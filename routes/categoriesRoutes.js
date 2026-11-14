const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

/**
 * GET /api/categorias - Listar categorías del usuario autenticado
 * Parámetro opcional: ?tipo=ingreso o ?tipo=gasto
 */
router.get('/', async (req, res) => {
  const { tipo } = req.query;
  const userId = req.user.id;

  try {
    let query = 'SELECT id, nombre, tipo FROM categorias WHERE usuario_id = $1';
    const params = [userId];

    if (tipo && ['ingreso', 'gasto'].includes(tipo)) {
      query += ' AND tipo = $2';
      params.push(tipo);
    }

    query += ' ORDER BY nombre ASC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al consultar categorías' });
  }
});

/**
 * POST /api/categorias - Crear una nueva categoría
 */
router.post('/', async (req, res) => {
  const { nombre, tipo } = req.body;
  const userId = req.user.id;

  if (!nombre || !tipo) {
    return res.status(400).json({ error: 'Nombre y tipo son obligatorios' });
  }

  if (!['ingreso', 'gasto'].includes(tipo)) {
    return res.status(400).json({ error: "El tipo debe ser 'ingreso' o 'gasto'" });
  }

  try {
    const result = await db.query(
      'INSERT INTO categorias (usuario_id, nombre, tipo) VALUES ($1, $2, $3) RETURNING id, nombre, tipo',
      [userId, nombre.trim(), tipo]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Violación de clave única
      return res.status(400).json({ error: 'Ya tienes una categoría con ese nombre para este tipo' });
    }
    console.error('Error al crear categoría:', error);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

module.exports = router;
