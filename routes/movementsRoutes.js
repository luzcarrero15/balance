const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
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
 * GET /api/movimientos/export-excel
 * Genera un archivo Excel (.xlsx) profesional y estilizado con la identidad de FARO Balance
 * - Hoja 1: Resumen Ejecutivo y Métricas de Balances con Logo e Identidad Visual
 * - Hoja 2: Detalle de Movimientos con formato de moneda, filtros y totales automáticos
 */
router.get('/export-excel', async (req, res) => {
  const userId = req.user.id;
  const userName = req.user.nombre || 'Usuario';
  const userEmail = req.user.email || 'No registrado';
  const ambito = (req.query.ambito || 'todo').toLowerCase();
  const tipo = (req.query.tipo || 'todos').toLowerCase();
  const search = (req.query.search || '').trim().toLowerCase();

  const validAmbitos = ['todo', 'personal', 'negocio'];
  const filtroAmbito = validAmbitos.includes(ambito) ? ambito : 'todo';

  const ambitoLabels = {
    todo: 'Consolidado (Personal + Negocio)',
    personal: 'Personal',
    negocio: 'Negocio'
  };

  const tipoLabels = {
    todos: 'Todos (Ingresos y Gastos)',
    ingreso: 'Solo Ingresos',
    gasto: 'Solo Gastos'
  };

  try {
    // 1. Obtener métricas de balances para la Hoja 1
    const balancesQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN fecha = CURRENT_DATE AND tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS diario_ingresos,
        COALESCE(SUM(CASE WHEN fecha = CURRENT_DATE AND tipo = 'gasto' THEN monto ELSE 0 END), 0) AS diario_gastos,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('week', fecha) = DATE_TRUNC('week', CURRENT_DATE) AND tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS semanal_ingresos,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('week', fecha) = DATE_TRUNC('week', CURRENT_DATE) AND tipo = 'gasto' THEN monto ELSE 0 END), 0) AS semanal_gastos,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE) AND tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS mensual_ingresos,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE) AND tipo = 'gasto' THEN monto ELSE 0 END), 0) AS mensual_gastos,
        COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS total_historico_ingresos,
        COALESCE(SUM(CASE WHEN tipo = 'gasto' THEN monto ELSE 0 END), 0) AS total_historico_gastos
      FROM movimientos
      WHERE usuario_id = $1
        AND ($2 = 'todo' OR ambito = $2)
    `;
    const bRes = await db.query(balancesQuery, [userId, filtroAmbito]);
    const bData = bRes.rows[0];

    // 2. Obtener movimientos para la Hoja 2
    let movQuery = `
      SELECT 
        m.id, 
        m.tipo, 
        m.ambito, 
        m.monto, 
        c.nombre AS categoria_nombre,
        TO_CHAR(m.fecha, 'YYYY-MM-DD') AS fecha, 
        TO_CHAR(m.creado_en, 'HH12:MI AM') AS hora,
        m.descripcion
      FROM movimientos m
      INNER JOIN categorias c ON m.categoria_id = c.id
      WHERE m.usuario_id = $1
    `;
    const params = [userId];
    let pIndex = 2;

    if (filtroAmbito !== 'todo') {
      movQuery += ` AND m.ambito = $${pIndex}`;
      params.push(filtroAmbito);
      pIndex++;
    }

    if (['ingreso', 'gasto'].includes(tipo)) {
      movQuery += ` AND m.tipo = $${pIndex}`;
      params.push(tipo);
      pIndex++;
    }

    movQuery += ' ORDER BY m.fecha DESC, m.id DESC';
    const movResult = await db.query(movQuery, params);
    let movimientos = movResult.rows;

    if (search) {
      movimientos = movimientos.filter(m =>
        (m.descripcion || '').toLowerCase().includes(search) ||
        (m.categoria_nombre || '').toLowerCase().includes(search) ||
        (m.ambito || '').toLowerCase().includes(search)
      );
    }

    // 3. Crear Libro con ExcelJS
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FARO Balance';
    workbook.created = new Date();

    const COLOR_ESMERALDA = 'FF2D6B50';
    const COLOR_DARK_GREEN = 'FF1C4533';
    const COLOR_BORGONA = 'FF7B1E34';
    const COLOR_CARD_BG = 'FFF8FAFC';
    const BORDER_COLOR = 'FFE2E8F0';
    const TEXT_DARK = 'FF1E293B';
    const TEXT_MUTED = 'FF64748B';

    // ----------------------------------------------------
    // HOJA 1: RESUMEN FINANCIERO
    // ----------------------------------------------------
    const ws1 = workbook.addWorksheet('Resumen Financiero', {
      views: [{ showGridLines: true }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    ws1.columns = [
      { width: 4 },  // A (Margen)
      { width: 14 }, // B (Logo/Espacio)
      { width: 26 }, // C (Etiqueta/Período)
      { width: 22 }, // D (Ingresos)
      { width: 22 }, // E (Gastos)
      { width: 24 }, // F (Balance Neto)
      { width: 18 }  // G (Rendimiento)
    ];

    // Incrustar Logo institucional si existe
    const logoPath = path.join(__dirname, '../public/img/logo.png');
    if (fs.existsSync(logoPath)) {
      try {
        const logoId = workbook.addImage({
          filename: logoPath,
          extension: 'png'
        });
        ws1.addImage(logoId, {
          tl: { col: 1.1, row: 1.1 },
          ext: { width: 68, height: 68 }
        });
      } catch (imgErr) {
        console.warn('No se pudo incrustar el logo en Excel:', imgErr.message);
      }
    }

    // Encabezado Visual y Título
    ws1.mergeCells('C2:G2');
    const titleCell = ws1.getCell('C2');
    titleCell.value = 'FARO Balance';
    titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: COLOR_ESMERALDA } };
    titleCell.alignment = { vertical: 'middle' };

    ws1.mergeCells('C3:G3');
    const subTitleCell = ws1.getCell('C3');
    subTitleCell.value = 'SISTEMA INTEGRAL DE CONTROL FINANCIERO Y BALANCES';
    subTitleCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLOR_BORGONA } };
    subTitleCell.alignment = { vertical: 'middle' };

    ws1.mergeCells('C4:G4');
    const subTitleCell2 = ws1.getCell('C4');
    subTitleCell2.value = 'Reporte Ejecutivo de Gestión Financiera y Balances Consolidados';
    subTitleCell2.font = { name: 'Arial', size: 9, italic: true, color: { argb: TEXT_MUTED } };
    subTitleCell2.alignment = { vertical: 'middle' };

    ws1.getRow(2).height = 26;
    ws1.getRow(3).height = 16;
    ws1.getRow(4).height = 16;

    // Ficha de Parámetros del Reporte (Filas 6 a 9)
    ws1.mergeCells('B6:G6');
    const metaHeader = ws1.getCell('B6');
    metaHeader.value = 'INFORMACIÓN GENERAL DEL REPORTE';
    metaHeader.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    metaHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_BORGONA } };
    metaHeader.alignment = { vertical: 'middle', indent: 1 };
    ws1.getRow(6).height = 22;

    const metadata = [
      ['Usuario Evaluado:', userName, 'Fecha de Emisión:', new Date().toLocaleString('es-CO')],
      ['Correo Registrado:', userEmail, 'Ámbito Analizado:', ambitoLabels[filtroAmbito] || 'Consolidado'],
      ['Filtro de Tipo:', tipoLabels[tipo] || 'Todos', 'Búsqueda / Criterio:', search ? `"${search}"` : 'Ninguno']
    ];

    metadata.forEach((row, idx) => {
      const rNum = 7 + idx;
      ws1.getRow(rNum).height = 20;

      // Col B & C
      ws1.getCell(`B${rNum}`).value = row[0];
      ws1.getCell(`B${rNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: TEXT_DARK } };
      ws1.getCell(`C${rNum}`).value = row[1];
      ws1.getCell(`C${rNum}`).font = { name: 'Arial', size: 9, color: { argb: TEXT_DARK } };

      // Col D & E
      ws1.getCell(`D${rNum}`).value = row[2];
      ws1.getCell(`D${rNum}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: TEXT_DARK } };
      ws1.getCell(`E${rNum}`).value = row[3];
      ws1.getCell(`E${rNum}`).font = { name: 'Arial', size: 9, color: { argb: TEXT_DARK } };

      ['B', 'C', 'D', 'E', 'F', 'G'].forEach(c => {
        const cell = ws1.getCell(`${c}${rNum}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CARD_BG } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
          top: { style: 'thin', color: { argb: BORDER_COLOR } },
          left: { style: 'thin', color: { argb: BORDER_COLOR } },
          right: { style: 'thin', color: { argb: BORDER_COLOR } }
        };
      });
    });

    // Encabezado de la Sección de Métricas (Requisitos 2 y 3)
    ws1.mergeCells('B11:G11');
    const sec1Header = ws1.getCell('B11');
    sec1Header.value = 'RESUMEN EJECUTIVO DE TOTALES Y BALANCES (REQUISITOS 2 Y 3)';
    sec1Header.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    sec1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ESMERALDA } };
    sec1Header.alignment = { vertical: 'middle', indent: 1 };
    ws1.getRow(11).height = 22;

    // Encabezados de Columna de la Tabla de Balances
    const tHeaderRow = ws1.getRow(12);
    tHeaderRow.values = ['', 'Ítem', 'Período Contable', 'Ingresos ($)', 'Gastos ($)', 'Balance Neto ($)', 'Rendimiento'];
    tHeaderRow.height = 24;
    tHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
    tHeaderRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };

    ['B12', 'C12', 'D12', 'E12', 'F12', 'G12'].forEach(ref => {
      ws1.getCell(ref).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_DARK_GREEN } };
      ws1.getCell(ref).border = {
        bottom: { style: 'medium', color: { argb: COLOR_ESMERALDA } },
        top: { style: 'thin', color: { argb: COLOR_ESMERALDA } }
      };
    });

    const metricRows = [
      {
        num: '01',
        nombre: 'Diario (Hoy)',
        ing: parseFloat(bData.diario_ingresos),
        gas: parseFloat(bData.diario_gastos)
      },
      {
        num: '02',
        nombre: 'Semana Actual (ISO)',
        ing: parseFloat(bData.semanal_ingresos),
        gas: parseFloat(bData.semanal_gastos)
      },
      {
        num: '03',
        nombre: 'Mes Actual (Calendario)',
        ing: parseFloat(bData.mensual_ingresos),
        gas: parseFloat(bData.mensual_gastos)
      },
      {
        num: '04',
        nombre: 'Histórico General',
        ing: parseFloat(bData.total_historico_ingresos),
        gas: parseFloat(bData.total_historico_gastos)
      }
    ];

    metricRows.forEach((m, idx) => {
      const rNum = 13 + idx;
      const balance = m.ing - m.gas;
      const isSuperavit = balance >= 0;
      const estado = isSuperavit ? '▲ Superávit' : '▼ Déficit';

      const r = ws1.getRow(rNum);
      r.values = ['', m.num, m.nombre, m.ing, m.gas, { formula: `D${rNum}-E${rNum}`, result: balance }, estado];
      r.height = 22;
      r.alignment = { vertical: 'middle' };

      ws1.getCell(`B${rNum}`).alignment = { horizontal: 'center' };
      ws1.getCell(`B${rNum}`).font = { bold: true, size: 9, color: { argb: TEXT_MUTED } };

      ws1.getCell(`C${rNum}`).font = { name: 'Arial', bold: idx === 3, size: 10 };
      ws1.getCell(`D${rNum}`).numFmt = '"$ "#,##0.00;("$ "#,##0.00);"-"';
      ws1.getCell(`E${rNum}`).numFmt = '"$ "#,##0.00;("$ "#,##0.00);"-"';
      ws1.getCell(`F${rNum}`).numFmt = '"$ "#,##0.00;[Red]("$ "#,##0.00);"-"';
      ws1.getCell(`F${rNum}`).font = {
        name: 'Arial',
        bold: true,
        color: { argb: isSuperavit ? COLOR_ESMERALDA : COLOR_BORGONA }
      };
      ws1.getCell(`G${rNum}`).font = {
        name: 'Arial',
        bold: true,
        color: { argb: isSuperavit ? COLOR_ESMERALDA : COLOR_BORGONA }
      };
      ws1.getCell(`G${rNum}`).alignment = { horizontal: 'center' };

      const bg = idx % 2 === 0 ? 'FFFFFFFF' : COLOR_CARD_BG;
      ['B', 'C', 'D', 'E', 'F', 'G'].forEach(c => {
        const cell = ws1.getCell(`${c}${rNum}`);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
          left: { style: 'thin', color: { argb: BORDER_COLOR } },
          right: { style: 'thin', color: { argb: BORDER_COLOR } }
        };
      });
    });

    // Nota de Pie de Página en Hoja 1
    ws1.mergeCells('B18:G18');
    const noteCell = ws1.getCell('B18');
    noteCell.value = 'Reporte oficial generado por FARO Balance. Cumplimiento académico y funcional verificado con Neon PostgreSQL.';
    noteCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: TEXT_MUTED } };
    noteCell.alignment = { vertical: 'middle', horizontal: 'center' };
    ws1.getRow(18).height = 24;

    // ----------------------------------------------------
    // HOJA 2: DETALLE DE MOVIMIENTOS
    // ----------------------------------------------------
    const ws2 = workbook.addWorksheet('Movimientos', {
      views: [{ state: 'frozen', ySplit: 1, showGridLines: true }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    ws2.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Hora', key: 'hora', width: 12 },
      { header: 'Tipo', key: 'tipo', width: 14 },
      { header: 'Ámbito', key: 'ambito', width: 14 },
      { header: 'Categoría', key: 'categoria', width: 24 },
      { header: 'Descripción', key: 'descripcion', width: 36 },
      { header: 'Monto ($)', key: 'monto', width: 20 }
    ];

    const headerRow = ws2.getRow(1);
    headerRow.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 26;

    for (let c = 1; c <= 8; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_ESMERALDA }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: COLOR_DARK_GREEN } },
        bottom: { style: 'medium', color: { argb: COLOR_DARK_GREEN } }
      };
    }

    let totalIngresosM = 0;
    let totalGastosM = 0;

    movimientos.forEach((m, idx) => {
      const numMonto = parseFloat(m.monto);
      const isIngreso = m.tipo.toLowerCase() === 'ingreso';

      if (isIngreso) totalIngresosM += numMonto;
      else totalGastosM += numMonto;

      const row = ws2.addRow({
        id: m.id,
        fecha: m.fecha,
        hora: m.hora,
        tipo: isIngreso ? '▲ Ingreso' : '▼ Gasto',
        ambito: m.ambito.charAt(0).toUpperCase() + m.ambito.slice(1),
        categoria: m.categoria_nombre,
        descripcion: m.descripcion || 'Sin descripción',
        monto: numMonto
      });

      row.height = 20;
      row.alignment = { vertical: 'middle' };

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };

      const tipoCell = row.getCell(4);
      tipoCell.alignment = { horizontal: 'center' };
      tipoCell.font = {
        name: 'Arial',
        bold: true,
        color: { argb: isIngreso ? COLOR_ESMERALDA : COLOR_BORGONA }
      };

      row.getCell(5).alignment = { horizontal: 'center' };

      const montoCell = row.getCell(8);
      montoCell.numFmt = '"$ "#,##0.00;[Red]("$ "#,##0.00);"-"';
      montoCell.alignment = { horizontal: 'right' };
      montoCell.font = {
        name: 'Arial',
        bold: true,
        color: { argb: isIngreso ? COLOR_ESMERALDA : COLOR_BORGONA }
      };

      const rowBg = idx % 2 === 0 ? 'FFFFFFFF' : COLOR_CARD_BG;
      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
          left: { style: 'thin', color: { argb: BORDER_COLOR } },
          right: { style: 'thin', color: { argb: BORDER_COLOR } }
        };
      }
    });

    // Filas de Totales Automáticos con fórmulas de Excel
    if (movimientos.length > 0) {
      const lastDataRow = movimientos.length + 1;

      // Fila 1: Total Ingresos
      const ingRow = ws2.addRow({
        id: '',
        fecha: '',
        hora: '',
        tipo: '',
        ambito: '',
        categoria: '',
        descripcion: 'TOTAL INGRESOS FILTRADOS:',
        monto: { formula: `SUMIF(D2:D${lastDataRow}, "*Ingreso*", H2:H${lastDataRow})`, result: totalIngresosM }
      });
      ingRow.height = 22;
      ingRow.getCell(7).font = { name: 'Arial', bold: true, size: 10, color: { argb: TEXT_DARK } };
      ingRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      const ingMonto = ingRow.getCell(8);
      ingMonto.numFmt = '"$ "#,##0.00;("$ "#,##0.00);"-"';
      ingMonto.font = { name: 'Arial', bold: true, size: 10, color: { argb: COLOR_ESMERALDA } };
      ingMonto.alignment = { horizontal: 'right', vertical: 'middle' };
      ingMonto.border = { top: { style: 'thin', color: { argb: TEXT_DARK } } };

      // Fila 2: Total Gastos
      const gasRow = ws2.addRow({
        id: '',
        fecha: '',
        hora: '',
        tipo: '',
        ambito: '',
        categoria: '',
        descripcion: 'TOTAL GASTOS FILTRADOS:',
        monto: { formula: `SUMIF(D2:D${lastDataRow}, "*Gasto*", H2:H${lastDataRow})`, result: totalGastosM }
      });
      gasRow.height = 22;
      gasRow.getCell(7).font = { name: 'Arial', bold: true, size: 10, color: { argb: TEXT_DARK } };
      gasRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      const gasMonto = gasRow.getCell(8);
      gasMonto.numFmt = '"$ "#,##0.00;("$ "#,##0.00);"-"';
      gasMonto.font = { name: 'Arial', bold: true, size: 10, color: { argb: COLOR_BORGONA } };
      gasMonto.alignment = { horizontal: 'right', vertical: 'middle' };

      // Fila 3: Balance Neto Consolidado
      const balRowNum = lastDataRow + 3;
      const ingRowNum = lastDataRow + 1;
      const gasRowNum = lastDataRow + 2;
      const netBalance = totalIngresosM - totalGastosM;

      const balRow = ws2.addRow({
        id: '',
        fecha: '',
        hora: '',
        tipo: '',
        ambito: '',
        categoria: '',
        descripcion: 'BALANCE NETO CONSOLIDADO:',
        monto: { formula: `H${ingRowNum}-H${gasRowNum}`, result: netBalance }
      });
      balRow.height = 25;
      balRow.getCell(7).font = { name: 'Arial', bold: true, size: 11, color: { argb: TEXT_DARK } };
      balRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      const balMonto = balRow.getCell(8);
      balMonto.numFmt = '"$ "#,##0.00;[Red]("$ "#,##0.00);"-"';
      balMonto.font = {
        name: 'Arial',
        bold: true,
        size: 11,
        color: { argb: netBalance >= 0 ? COLOR_ESMERALDA : COLOR_BORGONA }
      };
      balMonto.alignment = { horizontal: 'right', vertical: 'middle' };
      balMonto.border = {
        bottom: { style: 'double', color: { argb: TEXT_DARK } },
        top: { style: 'thin', color: { argb: TEXT_DARK } }
      };

      // Auto-filtro activo en todas las columnas
      ws2.autoFilter = {
        from: 'A1',
        to: `H${lastDataRow}`
      };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="FARO_Balance_${filtroAmbito}_${new Date().toISOString().split('T')[0]}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al exportar Excel:', error);
    res.status(500).json({ error: 'Error al generar el reporte en Excel' });
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
