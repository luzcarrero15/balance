const express = require('express');
const router = express.Router();
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
    // Permite iniciar sesión con el correo o con el nombre
    const result = await db.query(
      'SELECT id, nombre, email, password_hash, creado_en FROM usuarios WHERE email = $1 OR LOWER(nombre) = $1',
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
