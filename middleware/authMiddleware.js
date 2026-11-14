const db = require('../db');

/**
 * Middleware para asegurar que solo usuarios autenticados accedan a rutas privadas.
 */
async function requireAuth(req, res, next) {
  try {
    const userId = req.signedCookies && req.signedCookies.user_id;

    if (!userId) {
      return res.status(401).json({ error: 'No autorizado. Por favor inicia sesión.' });
    }

    // Verificar que el usuario exista en la base de datos
    const result = await db.query(
      'SELECT id, nombre, email, creado_en FROM usuarios WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      res.clearCookie('user_id');
      return res.status(401).json({ error: 'Sesión no válida. Usuario no encontrado.' });
    }

    // Inyectar datos del usuario autenticado en la petición
    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.status(500).json({ error: 'Error interno en la autenticación' });
  }
}

module.exports = { requireAuth };
