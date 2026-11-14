const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../auth');
const { requireAuth } = require('../middleware/authMiddleware');

// Configuración de cookies seguras
const COOKIE_OPTIONS = {
  signed: true,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
  sameSite: 'lax'
};

// Categorías iniciales por defecto para nuevos usuarios
const DEFAULT_CATEGORIES = [
  // Ingresos
  { nombre: 'Salario / Sueldo', tipo: 'ingreso' },
  { nombre: 'Ventas de Negocio', tipo: 'ingreso' },
  { nombre: 'Servicios Profesionales', tipo: 'ingreso' },
  { nombre: 'Otros Ingresos', tipo: 'ingreso' },
  // Gastos
  { nombre: 'Alimentación', tipo: 'gasto' },
  { nombre: 'Vivienda y Servicios', tipo: 'gasto' },
  { nombre: 'Transporte', tipo: 'gasto' },
  { nombre: 'Inventario / Mercancía', tipo: 'gasto' },
  { nombre: 'Marketing y Ventas', tipo: 'gasto' },
  { nombre: 'Otros Gastos', tipo: 'gasto' }
];

/**
 * POST /api/auth/register - Registro de usuario
 */
router.post('/register', async (req, res) => {
  const { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    // 1. Verificar si el correo ya está registrado
    const existing = await db.query('SELECT id FROM usuarios WHERE email = $1', [email.trim().toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Este correo electrónico ya está registrado' });
    }

    // 2. Hashear la contraseña con ARGON2I (Requisito obligatorio)
    const passwordHash = await hashPassword(password);

    // 3. Insertar usuario
    const newUser = await db.query(
      'INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nombre, email, creado_en',
      [nombre.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = newUser.rows[0];

    // 4. Crear categorías iniciales para el usuario
    for (const cat of DEFAULT_CATEGORIES) {
      await db.query(
        'INSERT INTO categorias (usuario_id, nombre, tipo) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [user.id, cat.nombre, cat.tipo]
      );
    }

    // 5. Iniciar sesión mediante cookie segura
    res.cookie('user_id', user.id, COOKIE_OPTIONS);

    return res.status(201).json({
      mensaje: 'Usuario registrado exitosamente',
      usuario: user
    });
  } catch (error) {
    console.error('Error en /register:', error);
    return res.status(500).json({ error: 'Error interno al registrar el usuario' });
  }
});

/**
 * POST /api/auth/login - Inicio de sesión
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Debes ingresar correo y contraseña' });
  }

  try {
    const cleanIdentifier = email.trim().toLowerCase();
    // Permite iniciar sesión con el correo o con el nombre (completo o primer nombre)
    const result = await db.query(
      `SELECT id, nombre, email, password_hash, creado_en 
       FROM usuarios 
       WHERE email = $1 
          OR LOWER(nombre) = $1 
          OR LOWER(nombre) LIKE $1 || '%'
          OR $1 = ANY(STRING_TO_ARRAY(LOWER(nombre), ' '))`,
      [cleanIdentifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas (correo o contraseña incorrectos)' });
    }

    const user = result.rows[0];

    // 2. Verificar contraseña con Argon2i
    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciales inválidas (correo o contraseña incorrectos)' });
    }

    // 3. Crear cookie de sesión
    res.cookie('user_id', user.id, COOKIE_OPTIONS);

    delete user.password_hash;
    return res.json({
      mensaje: 'Inicio de sesión exitoso',
      usuario: user
    });
  } catch (error) {
    console.error('Error en /login:', error);
    return res.status(500).json({ error: 'Error interno al iniciar sesión' });
  }
});

// Almacén en memoria para diagnóstico del último intento de envío de correo
let lastEmailAttempt = {
  timestamp: null,
  recipient: null,
  status: null,
  success: null,
  response: null,
  error: null
};

/**
 * Helper para enviar correo de recuperación con Resend
 */
async function sendResetEmailWithResend(toEmail, userName, resetUrl) {
  const rawKey = process.env.RESEND_API_KEY || '';
  // Limpiar posibles espacios accidentales o comillas
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    console.warn('[RESEND WARNING] RESEND_API_KEY no está configurada en las variables de entorno de Render.');
    console.log(`[ENLACE DE RECUPERACIÓN GENERADO]: ${resetUrl}`);
    lastEmailAttempt = {
      timestamp: new Date().toISOString(),
      recipient: toEmail,
      status: 'MISSING_API_KEY',
      success: false,
      response: 'RESEND_API_KEY no encontrada en process.env',
      error: null
    };
    return false;
  }

  try {
    console.log(`[RESEND INFO] Intentando enviar correo a: ${toEmail} con clave ${apiKey.substring(0, 5)}...`);
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FARO Balance <onboarding@resend.dev>',
        to: [toEmail],
        subject: 'Recupera tu contraseña - FARO Balance',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="background: #2D6B50; padding: 24px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 0.5px;">FARO Balance</h1>
              <p style="color: #E2E8F0; margin: 6px 0 0; font-size: 13px;">Sistema de Gestión Financiera</p>
            </div>
            <div style="padding: 28px 24px;">
              <h2 style="color: #1e293b; font-size: 18px; margin-top: 0;">Restablecimiento seguro de contraseña</h2>
              <p style="color: #475569; font-size: 14px; line-height: 1.6;">Hola <strong>${userName}</strong>,</p>
              <p style="color: #475569; font-size: 14px; line-height: 1.6;">Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón siguiente para ingresar una nueva clave protegida con Argon2i:</p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${resetUrl}" style="background-color: #2D6B50; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Restablecer mi Contraseña</a>
              </div>
              <p style="color: #64748b; font-size: 13px; line-height: 1.5;">🔒 <strong>Detalles de seguridad:</strong></p>
              <ul style="color: #64748b; font-size: 12px; line-height: 1.5; padding-left: 20px;">
                <li>Este enlace es <strong>temporal</strong> y expirará en <strong>1 hora</strong>.</li>
                <li>Es de <strong>un solo uso</strong>: una vez utilizada o cambiada la contraseña, quedará invalidado para siempre.</li>
                <li>Si no realizaste esta solicitud, puedes ignorar este mensaje; tu cuenta permanecerá segura.</li>
              </ul>
            </div>
            <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">FARO Balance • Seguridad y Claridad Financiera</p>
            </div>
          </div>
        `
      })
    });

    let resData;
    try {
      resData = await response.json();
    } catch (parseErr) {
      resData = await response.text();
    }

    console.log(`[RESEND RESPONSE] Status: ${response.status}`, resData);

    lastEmailAttempt = {
      timestamp: new Date().toISOString(),
      recipient: toEmail,
      status: response.status,
      success: response.ok,
      response: resData,
      error: null
    };

    return response.ok;
  } catch (error) {
    console.error('Error de red al conectar con Resend:', error.message);
    lastEmailAttempt = {
      timestamp: new Date().toISOString(),
      recipient: toEmail,
      status: 'FETCH_ERROR',
      success: false,
      response: null,
      error: error.message
    };
    return false;
  }
}

/**
 * GET /api/auth/resend-diagnostic - Diagnóstico seguro del estado de Resend (sin exponer la clave)
 */
router.get('/resend-diagnostic', async (req, res) => {
  const rawKey = process.env.RESEND_API_KEY || '';
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');

  const diag = {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyLength: apiKey.length,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 5) + '...' : 'none',
    apiKeyValidFormat: apiKey.startsWith('re_'),
    lastEmailAttempt: lastEmailAttempt
  };

  // Probar conectividad con Resend si hay clave
  if (apiKey) {
    try {
      const ping = await fetch('https://api.resend.com/api-keys', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      diag.resendPingStatus = ping.status;
      try {
        diag.resendPingData = await ping.json();
      } catch (e) {
        diag.resendPingData = await ping.text();
      }
    } catch (pingErr) {
      diag.resendPingError = pingErr.message;
    }
  }

  res.json(diag);
});

/**
 * POST /api/auth/forgot-password - Solicitar enlace seguro de recuperación
 * Seguridad:
 * - Respuesta genérica (no revela si el correo existe)
 * - Límite de frecuencia (rate limit) de 2 minutos para evitar spam
 * - Tokens generados criptográficamente y almacenados ÚNICAMENTE mediante hash SHA-256
 * - Expiración en 1 hora y de un solo uso
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  // Mensaje genérico para no filtrar cuentas existentes (Principio de Seguridad)
  const genericResponse = {
    mensaje: 'Si el correo electrónico está registrado en nuestro sistema, recibirás un enlace de recuperación en los próximos minutos.'
  };

  if (!email || typeof email !== 'string') {
    return res.json(genericResponse);
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const userRes = await db.query(
      'SELECT id, nombre, email FROM usuarios WHERE email = $1',
      [cleanEmail]
    );

    // Si el usuario no existe, devolvemos el mismo mensaje genérico inmediatamente
    if (userRes.rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = userRes.rows[0];

    // Protección contra solicitudes repetidas (Rate limit: 2 minutos)
    const recentRequest = await db.query(
      "SELECT id FROM recuperaciones_password WHERE usuario_id = $1 AND creado_en > NOW() - INTERVAL '2 minutes'",
      [user.id]
    );

    if (recentRequest.rows.length > 0) {
      // Ya se envió una solicitud muy recientemente, no saturar
      return res.json(genericResponse);
    }

    // Invalidar tokens previos no utilizados de este usuario
    await db.query(
      'UPDATE recuperaciones_password SET usado = TRUE WHERE usuario_id = $1 AND usado = FALSE',
      [user.id]
    );

    // Generar token criptográfico crudo (64 caracteres hex)
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Almacenar ÚNICAMENTE el hash SHA-256 del token en la base de datos (nunca texto plano)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Insertar en la base de datos con expiración estricta de 1 hora
    await db.query(
      "INSERT INTO recuperaciones_password (usuario_id, token_hash, expira_en) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
      [user.id, tokenHash]
    );

    // Construir enlace seguro hacia la página de restablecimiento
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const resetUrl = `${protocol}://${host}/reset-password.html?token=${rawToken}`;

    // Enviar correo mediante Resend
    await sendResetEmailWithResend(user.email, user.nombre, resetUrl);

    return res.json(genericResponse);
  } catch (error) {
    console.error('Error en /forgot-password:', error);
    return res.json(genericResponse);
  }
});

/**
 * GET /api/auth/verify-reset-token - Verificar validez de un token
 */
router.get('/verify-reset-token', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ valido: false, error: 'Token no proporcionado o inválido' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const result = await db.query(
      'SELECT id, expira_en, usado FROM recuperaciones_password WHERE token_hash = $1',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ valido: false, error: 'El enlace de recuperación no es válido' });
    }

    const record = result.rows[0];

    if (record.usado) {
      return res.status(400).json({ valido: false, error: 'Este enlace ya fue utilizado anteriormente' });
    }

    if (new Date() > new Date(record.expira_en)) {
      return res.status(400).json({ valido: false, error: 'El enlace de recuperación ha expirado (límite de 1 hora)' });
    }

    return res.json({ valido: true });
  } catch (error) {
    console.error('Error al verificar token:', error);
    return res.status(500).json({ valido: false, error: 'Error al verificar el enlace' });
  }
});

/**
 * POST /api/auth/reset-password - Restablecer contraseña mediante token seguro (Argon2i)
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  try {
    // 1. Validar token comparando su hash SHA-256
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const tokenResult = await db.query(
      'SELECT id, usuario_id, expira_en, usado FROM recuperaciones_password WHERE token_hash = $1',
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'El enlace de recuperación es inválido' });
    }

    const tokenRecord = tokenResult.rows[0];

    if (tokenRecord.usado) {
      return res.status(400).json({ error: 'Este enlace ya fue utilizado y no puede volver a usarse' });
    }

    if (new Date() > new Date(tokenRecord.expira_en)) {
      return res.status(400).json({ error: 'Este enlace ha expirado. Por favor solicita uno nuevo.' });
    }

    // 2. Cifrar la nueva contraseña con ARGON2I (Requisito 7 del profesor)
    const passwordHash = await hashPassword(newPassword);

    // 3. Actualizar contraseña del usuario en PostgreSQL
    await db.query(
      'UPDATE usuarios SET password_hash = $1 WHERE id = $2',
      [passwordHash, tokenRecord.usuario_id]
    );

    // 4. Marcar el token como usado de inmediato (Un solo uso)
    await db.query(
      'UPDATE recuperaciones_password SET usado = TRUE WHERE id = $1',
      [tokenRecord.id]
    );

    return res.json({ mensaje: '¡Contraseña actualizada exitosamente! Ya puedes iniciar sesión con tu nueva clave.' });
  } catch (error) {
    console.error('Error en /reset-password:', error);
    return res.status(500).json({ error: 'Error interno al actualizar la contraseña' });
  }
});

/**
 * POST /api/auth/logout - Cerrar sesión
 */
router.post('/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ mensaje: 'Sesión cerrada correctamente' });
});

/**
 * GET /api/auth/me - Obtener el usuario autenticado actual
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

module.exports = router;
