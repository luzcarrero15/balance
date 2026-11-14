const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

/**
 * GET /api/movimientos/balances
 * Requisitos 2 y 3: Totales y Balances diarios, semanales y mensuales.
 * Filtro acordado: Todo, Personal y Negocio.
 */
router.get('/balances', async (req, res) => {
  const userId = req.user.id;
  const ambito = (req.query.ambito || 'todo').toLowerCase();

  const validAmbitos = ['todo', 'personal', 'negocio'];
  const filtroAmbito = validAmbitos.includes(ambito) ? ambito : 'todo';

  try {
    const query = `
      SELECT
        -- Métricas Diarias (Hoy)
        COALESCE(SUM(CASE WHEN fecha = CURRENT_DATE AND tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS diario_ingresos,
        COALESCE(SUM(CASE WHEN fecha = CURRENT_DATE AND tipo = 'gasto' THEN monto ELSE 0 END), 0) AS diario_gastos,

        -- Métricas Semanales (Semana actual ISO)
        COALESCE(SUM(CASE WHEN DATE_TRUNC('week', fecha) = DATE_TRUNC('week', CURRENT_DATE) AND tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS semanal_ingresos,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('week', fecha) = DATE_TRUNC('week', CURRENT_DATE) AND tipo = 'gasto' THEN monto ELSE 0 END), 0) AS semanal_gastos,

        -- Métricas Mensuales (Mes calendario actual)
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE) AND tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS mensual_ingresos,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE) AND tipo = 'gasto' THEN monto ELSE 0 END), 0) AS mensual_gastos,

        -- Total Histórico General
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS total_historico_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) AS total_historico_gastos
      FROM movimientos
      WHERE usuario_id = $1
        AND ($2 = 'todo' OR ambito = $2)
    `;

    const result = await db.query(query, [userId, filtroAmbito]);
    const data = result.rows[0];

    const diarioIngresos = parseFloat(data.diario_ingresos);
    const diarioGastos = parseFloat(data.diario_gastos);
    const semanalIngresos = parseFloat(data.semanal_ingresos);
    const semanalGastos = parseFloat(data.semanal_gastos);
    const mensualIngresos = parseFloat(data.mensual_ingresos);
    const mensualGastos = parseFloat(data.mensual_gastos);
    const totalIngresos = parseFloat(data.total_historico_ingresos);
    const totalGastos = parseFloat(data.total_historico_gastos);

    res.json({
      ambito: filtroAmbito,
      diario: {
        ingresos: diarioIngresos,
        gastos: diarioGastos,
        balance: diarioIngresos - diarioGastos
      },
      semanal: {
        ingresos: semanalIngresos,
        gastos: semanalGastos,
        balance: semanalIngresos - semanalGastos
      },
      mensual: {
        ingresos: mensualIngresos,
        gastos: mensualGastos,
        balance: mensualIngresos - mensualGastos
      },
      historico: {
        ingresos: totalIngresos,
        gastos: totalGastos,
        balance: totalIngresos - totalGastos
      }
    });
  } catch (error) {
    console.error('Error al calcular balances:', error);
    res.status(500).json({ error: 'Error al calcular totales y balances' });
  }
});

/**
 * GET /api/movimientos - Listar movimientos con filtros
 */
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const { ambito, tipo, fecha_inicio, fecha_fin } = req.query;

  try {
    let query = `
      SELECT 
        m.id, 
        m.tipo, 
        m.ambito, 
        m.monto, 
        m.categoria_id, 
        c.nombre AS categoria_nombre,
        TO_CHAR(m.fecha, 'YYYY-MM-DD') AS fecha, 
        TO_CHAR(m.creado_en, 'HH12:MI AM') AS hora,
        m.descripcion, 
        m.creado_en
      FROM movimientos m
      INNER JOIN categorias c ON m.categoria_id = c.id
      WHERE m.usuario_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (ambito && ['personal', 'negocio'].includes(ambito.toLowerCase())) {
      query += ` AND m.ambito = $${paramIndex}`;
      params.push(ambito.toLowerCase());
      paramIndex++;
    }

    if (tipo && ['ingreso', 'gasto'].includes(tipo.toLowerCase())) {
      query += ` AND m.tipo = $${paramIndex}`;
      params.push(tipo.toLowerCase());
      paramIndex++;
    }

    if (fecha_inicio) {
      query += ` AND m.fecha >= $${paramIndex}`;
      params.push(fecha_inicio);
      paramIndex++;
    }

    if (fecha_fin) {
      query += ` AND m.fecha <= $${paramIndex}`;
      params.push(fecha_fin);
      paramIndex++;
    }

    query += ' ORDER BY m.fecha DESC, m.id DESC LIMIT 150';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al listar movimientos:', error);
    res.status(500).json({ error: 'Error al consultar movimientos' });
  }
});

/**
 * POST /api/movimientos - Registrar un nuevo movimiento (Ingreso o Gasto)
 */
router.post('/', async (req, res) => {
  const userId = req.user.id;
  const { tipo, ambito, monto, categoria_id, fecha, descripcion } = req.body;

  if (!tipo || !ambito || !monto || !categoria_id) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (!['ingreso', 'gasto'].includes(tipo)) {
    return res.status(400).json({ error: "El tipo debe ser 'ingreso' o 'gasto'" });
  }

  if (!['personal', 'negocio'].includes(ambito)) {
    return res.status(400).json({ error: "El ámbito debe ser 'personal' o 'negocio'" });
  }

  const montoNumero = parseFloat(monto);
  if (isNaN(montoNumero) || montoNumero <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número mayor a cero' });
  }

  try {
    // 1. Validar que la categoría exista, pertenezca al usuario y corresponda al tipo
    const catCheck = await db.query(
      'SELECT id, nombre FROM categorias WHERE id = $1 AND usuario_id = $2 AND tipo = $3',
      [categoria_id, userId, tipo]
    );

    if (catCheck.rows.length === 0) {
      return res.status(400).json({
        error: `La categoría seleccionada no es válida para un ${tipo} o no pertenece a tu cuenta`
      });
    }

    // 2. Insertar movimiento
    const fechaMovimiento = fecha || new Date().toISOString().split('T')[0];
    const insertQuery = `
      INSERT INTO movimientos (usuario_id, tipo, ambito, monto, categoria_id, fecha, descripcion)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, tipo, ambito, monto, categoria_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, TO_CHAR(creado_en, 'HH12:MI AM') AS hora, descripcion, creado_en
    `;
    const result = await db.query(insertQuery, [
      userId,
      tipo,
      ambito,
      montoNumero,
      categoria_id,
      fechaMovimiento,
      (descripcion || '').trim()
    ]);

    const nuevoMovimiento = result.rows[0];
    nuevoMovimiento.categoria_nombre = catCheck.rows[0].nombre;

    res.status(201).json(nuevoMovimiento);
  } catch (error) {
    console.error('Error al crear movimiento:', error);
    res.status(500).json({ error: 'Error al registrar movimiento' });
  }
});

/**
 * PUT /api/movimientos/:id - Actualizar un movimiento existente
 */
router.put('/:id', async (req, res) => {
  const userId = req.user.id;
  const movimientoId = parseInt(req.params.id, 10);
  const { tipo, ambito, monto, categoria_id, fecha, descripcion } = req.body;

  if (isNaN(movimientoId)) {
    return res.status(400).json({ error: 'ID de movimiento inválido' });
  }

  const montoNumero = parseFloat(monto);
  if (isNaN(montoNumero) || montoNumero <= 0) {
    return res.status(400).json({ error: 'El monto debe ser mayor a cero' });
  }

  try {
    // 1. Validar que el movimiento exista y pertenezca al usuario
    const movExist = await db.query(
      'SELECT id FROM movimientos WHERE id = $1 AND usuario_id = $2',
      [movimientoId, userId]
    );

    if (movExist.rows.length === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado' });
    }

    // 2. Validar categoría
    const catCheck = await db.query(
      'SELECT id, nombre FROM categorias WHERE id = $1 AND usuario_id = $2 AND tipo = $3',
      [categoria_id, userId, tipo]
    );

    if (catCheck.rows.length === 0) {
      return res.status(400).json({
        error: `La categoría seleccionada no es válida para un ${tipo}`
      });
    }

    // 3. Actualizar
    const updateQuery = `
      UPDATE movimientos
      SET tipo = $1, ambito = $2, monto = $3, categoria_id = $4, fecha = $5, descripcion = $6
      WHERE id = $7 AND usuario_id = $8
      RETURNING id, tipo, ambito, monto, categoria_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, TO_CHAR(creado_en, 'HH12:MI AM') AS hora, descripcion, creado_en
    `;
    const result = await db.query(updateQuery, [
      tipo,
      ambito,
      montoNumero,
      categoria_id,
      fecha,
      (descripcion || '').trim(),
      movimientoId,
      userId
    ]);

    const movActualizado = result.rows[0];
    movActualizado.categoria_nombre = catCheck.rows[0].nombre;

    res.json(movActualizado);
  } catch (error) {
    console.error('Error al actualizar movimiento:', error);
    res.status(500).json({ error: 'Error al actualizar movimiento' });
  }
});

/**
 * DELETE /api/movimientos/:id - Eliminar un movimiento
 */
router.delete('/:id', async (req, res) => {
  const userId = req.user.id;
  const movimientoId = parseInt(req.params.id, 10);

  if (isNaN(movimientoId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const result = await db.query(
      'DELETE FROM movimientos WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [movimientoId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Movimiento no encontrado o no tienes permiso para eliminarlo' });
    }

    res.json({ mensaje: 'Movimiento eliminado correctamente', id: movimientoId });
  } catch (error) {
    console.error('Error al eliminar movimiento:', error);
    res.status(500).json({ error: 'Error al eliminar movimiento' });
  }
});

module.exports = router;
