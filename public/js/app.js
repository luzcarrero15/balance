/**
 * BALANCE - Lógica del Frontend
 * Gestión de autenticación, CRUD de movimientos, cálculo de balances y cambio de paleta en vivo.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Configuraciones Regionales e Internacionales (Requisito 4)
  const REGIONS = {
    CO: {
      name: 'Colombia',
      currency: 'COP',
      symbol: '$',
      locale: 'es-CO',
      thousandsSep: '.',
      decimalSep: ',',
      flag: '🇨🇴'
    },
    US: {
      name: 'USA',
      currency: 'USD',
      symbol: '$',
      locale: 'en-US',
      thousandsSep: ',',
      decimalSep: '.',
      flag: '🇺🇸'
    },
    ES: {
      name: 'España / Europa',
      currency: 'EUR',
      symbol: '€',
      locale: 'es-ES',
      thousandsSep: '.',
      decimalSep: ',',
      flag: '🇪🇸'
    },
    MX: {
      name: 'México',
      currency: 'MXN',
      symbol: '$',
      locale: 'es-MX',
      thousandsSep: ',',
      decimalSep: '.',
      flag: '🇲🇽'
    }
  };

  // Estado global de la aplicación
  const state = {
    user: null,
    scope: 'todo',         // 'todo' | 'personal' | 'negocio'
    tipoFilter: 'todos',   // 'todos' | 'ingreso' | 'gasto'
    searchQuery: '',       // Filtro de búsqueda en tiempo real
    region: localStorage.getItem('faro_region') || 'CO',
    categoriasIngreso: [],
    categoriasGasto: [],
    movimientos: []
  };

  // ==================== 1. TEMA DEFINITIVO (PALETA 1 ESMERALDA & BORGOÑA) ====================
  document.body.className = 'theme-1';

  // ==================== 2. ELEMENTOS DEL DOM ====================
  const selectRegion = document.getElementById('select-region');
  if (selectRegion) {
    selectRegion.value = state.region;
    selectRegion.addEventListener('change', (e) => {
      state.region = e.target.value;
      localStorage.setItem('faro_region', state.region);
      refreshDashboard();
      setupAllCurrencyInputs();
    });
  }

  // Activar botones de ver/ocultar contraseña (Requisito 2)
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (input) {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        btn.textContent = isPassword ? '🙈' : '👁️';
      }
    });
  });

  const authSection = document.getElementById('auth-section');
  const dashboardSection = document.getElementById('dashboard-section');
  const navUserPill = document.getElementById('nav-user-pill');
  const navUserName = document.getElementById('nav-user-name');
  const btnLogout = document.getElementById('btn-logout');

  // Pestañas de Auth
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const authAlert = document.getElementById('auth-alert');

  // Modal y Enlace de Recuperación de Contraseña (Requisito 3)
  const linkForgot = document.getElementById('link-forgot-pwd');
  const modalForgot = document.getElementById('modal-forgot');
  const formForgot = document.getElementById('form-forgot');
  const forgotAlert = document.getElementById('forgot-alert');

  if (linkForgot && modalForgot) {
    linkForgot.addEventListener('click', (e) => {
      e.preventDefault();
      modalForgot.classList.add('active');
      if (forgotAlert) forgotAlert.style.display = 'none';
      if (formForgot) formForgot.reset();
    });
  }

  if (formForgot) {
    formForgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value;
      const newPassword = document.getElementById('forgot-new-password').value;

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, newPassword })
        });
        const data = await res.json();
        if (!res.ok) {
          forgotAlert.textContent = data.error || 'Error al restablecer la contraseña';
          forgotAlert.className = 'alert error';
          forgotAlert.style.display = 'block';
          return;
        }

        forgotAlert.textContent = data.mensaje;
        forgotAlert.className = 'alert success';
        forgotAlert.style.display = 'block';

        setTimeout(() => {
          modalForgot.classList.remove('active');
          showAuthAlert('Contraseña restablecida exitosamente. Inicia sesión con tu nueva clave.', 'success');
        }, 2000);
      } catch (err) {
        forgotAlert.textContent = 'Error de conexión con el servidor';
        forgotAlert.className = 'alert error';
        forgotAlert.style.display = 'block';
      }
    });
  }

  // Elementos de Métricas y Hero
  const heroLabel = document.getElementById('hero-label');
  const heroAmount = document.getElementById('hero-amount');
  const metricDiarioBal = document.getElementById('metric-diario-balance');
  const metricDiarioIng = document.getElementById('metric-diario-ingresos');
  const metricDiarioGas = document.getElementById('metric-diario-gastos');
  const metricSemanalBal = document.getElementById('metric-semanal-balance');
  const metricSemanalIng = document.getElementById('metric-semanal-ingresos');
  const metricSemanalGas = document.getElementById('metric-semanal-gastos');
  const metricMensualBal = document.getElementById('metric-mensual-balance');
  const metricMensualIng = document.getElementById('metric-mensual-ingresos');
  const metricMensualGas = document.getElementById('metric-mensual-gastos');

  // Tabla
  const movementsTbody = document.getElementById('movements-tbody');
  const emptyState = document.getElementById('empty-state');
  const tableSearch = document.getElementById('table-search');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Modales
  const modalIngreso = document.getElementById('modal-ingreso');
  const modalGasto = document.getElementById('modal-gasto');
  const modalEdit = document.getElementById('modal-edit');
  const btnOpenIngreso = document.getElementById('btn-open-ingreso');
  const btnOpenGasto = document.getElementById('btn-open-gasto');

  // Formularios Modales
  const formIngreso = document.getElementById('form-ingreso');
  const formGasto = document.getElementById('form-gasto');
  const formEdit = document.getElementById('form-edit');
  const selectCatIngreso = document.getElementById('ingreso-categoria');
  const selectCatGasto = document.getElementById('gasto-categoria');
  const selectCatEdit = document.getElementById('edit-categoria');

  // ==================== 3. UTILIDADES REGIONALES E INTERNACIONALES ====================
  function getActiveRegion() {
    return REGIONS[state.region] || REGIONS.CO;
  }

  function formatMoney(amount) {
    const val = parseFloat(amount) || 0;
    const region = getActiveRegion();
    return val.toLocaleString(region.locale, {
      style: 'currency',
      currency: region.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatLocalTime(isoString, fallbackHora) {
    if (!isoString) return fallbackHora || '';
    try {
      const d = new Date(isoString);
      const region = getActiveRegion();
      return d.toLocaleTimeString(region.locale, { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return fallbackHora || '';
    }
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const region = getActiveRegion();
        return d.toLocaleDateString(region.locale);
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  }

  // Formateador de moneda en tiempo real sin límite de dígitos (Requisito 1)
  function setupCurrencyMask(inputElem) {
    if (!inputElem) return;
    inputElem.addEventListener('input', (e) => {
      const region = getActiveRegion();
      let val = e.target.value;

      if (region.decimalSep === ',') {
        // Formato con coma para decimales y puntos para miles (CO, ES)
        let clean = val.replace(/[^\d,]/g, '');
        if (!clean) { e.target.value = ''; return; }
        const hasComma = clean.includes(',');
        const parts = clean.split(',');
        const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        if (parts.length > 1) {
          const decimals = parts.slice(1).join('').substring(0, 2);
          e.target.value = `${integerPart},${decimals}`;
        } else {
          e.target.value = integerPart + (hasComma ? ',' : '');
        }
      } else {
        // Formato con punto para decimales y comas para miles (US, MX)
        let clean = val.replace(/[^\d.]/g, '');
        if (!clean) { e.target.value = ''; return; }
        const hasDot = clean.includes('.');
        const parts = clean.split('.');
        const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        if (parts.length > 1) {
          const decimals = parts.slice(1).join('').substring(0, 2);
          e.target.value = `${integerPart}.${decimals}`;
        } else {
          e.target.value = integerPart + (hasDot ? '.' : '');
        }
      }
    });
  }

  function setupAllCurrencyInputs() {
    ['ingreso-monto', 'gasto-monto', 'edit-monto'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.value) {
        const num = parseCurrencyInput(el.value);
        if (num > 0) el.value = formatNumberToMask(num);
      }
    });
  }

  function parseCurrencyInput(value) {
    if (!value) return 0;
    const region = getActiveRegion();
    let clean = value.toString();
    if (region.decimalSep === ',') {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
    return parseFloat(clean) || 0;
  }

  function formatNumberToMask(num) {
    if (num === null || num === undefined || isNaN(num)) return '';
    const region = getActiveRegion();
    const parts = parseFloat(num).toFixed(2).split('.');
    if (region.decimalSep === ',') {
      const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return parseInt(parts[1], 10) > 0 ? `${integerPart},${parts[1]}` : integerPart;
    } else {
      const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parseInt(parts[1], 10) > 0 ? `${integerPart}.${parts[1]}` : integerPart;
    }
  }

  function showAuthAlert(msg, type = 'error') {
    authAlert.textContent = msg;
    authAlert.className = `alert ${type}`;
    authAlert.style.display = 'block';
  }

  function hideAuthAlert() {
    authAlert.style.display = 'none';
  }

  // ==================== 4. AUTENTICACIÓN ====================
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = 'block';
    formRegister.style.display = 'none';
    hideAuthAlert();
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = 'block';
    formLogin.style.display = 'none';
    hideAuthAlert();
  });

  // Login
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        return showAuthAlert(data.error || 'Error al iniciar sesión');
      }

      state.user = data.usuario;
      setupAppForUser();
    } catch (err) {
      showAuthAlert('Error de conexión con el servidor');
    }
  });

  // Registro
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const nombre = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password })
      });
      const data = await res.json();

      if (!res.ok) {
        return showAuthAlert(data.error || 'Error al crear la cuenta');
      }

      state.user = data.usuario;
      setupAppForUser();
    } catch (err) {
      showAuthAlert('Error de conexión con el servidor');
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    state.user = null;
    showAuthScreen();
  });

  // Verificar sesión existente
  async function checkSession() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        state.user = data.usuario;
        setupAppForUser();
      } else {
        showAuthScreen();
      }
    } catch (err) {
      showAuthScreen();
    }
  }

  function showAuthScreen() {
    authSection.style.display = 'flex';
    dashboardSection.style.display = 'none';
    navUserPill.style.display = 'none';
  }

  function setupAppForUser() {
    authSection.style.display = 'none';
    dashboardSection.style.display = 'block';
    navUserPill.style.display = 'flex';
    navUserName.textContent = state.user.nombre.split(' ')[0];

    loadCategories();
    refreshDashboard();
  }

  // ==================== 5. CARGA DE DATOS Y BALANCES ====================
  async function loadCategories() {
    try {
      const [resIng, resGas] = await Promise.all([
        fetch('/api/categorias?tipo=ingreso'),
        fetch('/api/categorias?tipo=gasto')
      ]);

      state.categoriasIngreso = await resIng.json();
      state.categoriasGasto = await resGas.json();

      populateSelect(selectCatIngreso, state.categoriasIngreso);
      populateSelect(selectCatGasto, state.categoriasGasto);
    } catch (e) {
      console.error('Error al cargar categorías:', e);
    }
  }

  function populateSelect(selectElem, categories, selectedId = null) {
    selectElem.innerHTML = '<option value="">Selecciona una categoría...</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nombre;
      if (selectedId && parseInt(selectedId) === cat.id) {
        opt.selected = true;
      }
      selectElem.appendChild(opt);
    });
  }

  async function loadBalances() {
    try {
      const res = await fetch(`/api/movimientos/balances?ambito=${state.scope}`);
      if (!res.ok) return;
      const data = await res.json();

      // Actualizar Hero Card
      const scopeLabels = {
        todo: 'Balance General Consolidado (Personal + Negocio)',
        personal: 'Balance Personal',
        negocio: 'Balance de Negocio'
      };
      heroLabel.textContent = scopeLabels[state.scope] || 'Balance General';

      // Usamos el balance del mes o histórico según corresponda
      const totalBalance = data.historico.balance;
      heroAmount.textContent = formatMoney(totalBalance);
      heroAmount.className = 'hero-balance-amount ' + (totalBalance >= 0 ? 'positive' : 'negative');

      // Actualizar Métricas de Períodos
      // 1. Diario
      metricDiarioBal.textContent = formatMoney(data.diario.balance);
      metricDiarioBal.style.color = data.diario.balance >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
      metricDiarioIng.textContent = formatMoney(data.diario.ingresos);
      metricDiarioGas.textContent = formatMoney(data.diario.gastos);

      // 2. Semanal
      metricSemanalBal.textContent = formatMoney(data.semanal.balance);
      metricSemanalBal.style.color = data.semanal.balance >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
      metricSemanalIng.textContent = formatMoney(data.semanal.ingresos);
      metricSemanalGas.textContent = formatMoney(data.semanal.gastos);

      // 3. Mensual
      metricMensualBal.textContent = formatMoney(data.mensual.balance);
      metricMensualBal.style.color = data.mensual.balance >= 0 ? 'var(--color-income)' : 'var(--color-expense)';
      metricMensualIng.textContent = formatMoney(data.mensual.ingresos);
      metricMensualGas.textContent = formatMoney(data.mensual.gastos);

    } catch (e) {
      console.error('Error al cargar balances:', e);
    }
  }

  async function loadMovements() {
    try {
      let url = `/api/movimientos?ambito=${state.scope}`;
      if (state.tipoFilter !== 'todos') {
        url += `&tipo=${state.tipoFilter}`;
      }

      const res = await fetch(url);
      if (!res.ok) return;
      state.movimientos = await res.json();
      renderMovementsTable();
    } catch (e) {
      console.error('Error al listar movimientos:', e);
    }
  }

  function renderMovementsTable() {
    movementsTbody.innerHTML = '';

    const query = (state.searchQuery || '').toLowerCase().trim();
    const items = (state.movimientos || []).filter(mov => {
      if (!query) return true;
      const desc = (mov.descripcion || '').toLowerCase();
      const cat = (mov.categoria_nombre || '').toLowerCase();
      const ambito = (mov.ambito || '').toLowerCase();
      return desc.includes(query) || cat.includes(query) || ambito.includes(query);
    });

    if (items.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    items.forEach(mov => {
      const tr = document.createElement('tr');
      const isIngreso = mov.tipo === 'ingreso';

      tr.innerHTML = `
        <td style="white-space: nowrap;">
          <div style="font-weight: 600;">${formatDateDisplay(mov.fecha)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">${formatLocalTime(mov.creado_en, mov.hora)}</div>
        </td>
        <td><strong>${escapeHtml(mov.descripcion || 'Sin descripción')}</strong></td>
        <td>
          <span class="badge-ambito ${mov.ambito}">${mov.ambito}</span>
        </td>
        <td>${escapeHtml(mov.categoria_nombre)}</td>
        <td>
          <span class="badge-tipo ${mov.tipo}">
            ${isIngreso ? '▲ Ingreso' : '▼ Gasto'}
          </span>
        </td>
        <td>
          <span class="table-amount ${mov.tipo}">
            ${isIngreso ? '+' : '-'} ${formatMoney(mov.monto)}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="table-actions" style="justify-content: flex-end;">
            <button type="button" class="btn-icon" data-edit-id="${mov.id}" title="Editar">
              ✏️
            </button>
            <button type="button" class="btn-icon delete" data-delete-id="${mov.id}" title="Eliminar">
              🗑️
            </button>
          </div>
        </td>
      `;

      // Eventos de botones de acción
      tr.querySelector('[data-edit-id]').addEventListener('click', () => openEditModal(mov));
      tr.querySelector('[data-delete-id]').addEventListener('click', () => confirmDeleteMovement(mov.id));

      movementsTbody.appendChild(tr);
    });
  }

  function refreshDashboard() {
    loadBalances();
    loadMovements();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ==================== 6. FILTROS DE ÁMBITO Y TIPO ====================
  // Tabs de Ámbito (Todo / Personal / Negocio)
  document.querySelectorAll('.scope-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scope-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.scope = btn.dataset.scope;
      refreshDashboard();
    });
  });

  // Filtros de Tipo en Tabla (Todos / Ingreso / Gasto)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tipoFilter = btn.dataset.filterTipo;
      loadMovements();
    });
  });

  // Buscador en tiempo real de movimientos
  if (tableSearch) {
    tableSearch.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderMovementsTable();
    });
  }

  // Exportar a archivo CSV (Compatible con Excel)
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const items = state.movimientos || [];
      if (items.length === 0) {
        return alert('No hay movimientos registrados para exportar.');
      }

      const query = (state.searchQuery || '').toLowerCase().trim();
      const filtered = items.filter(mov => {
        if (!query) return true;
        const desc = (mov.descripcion || '').toLowerCase();
        const cat = (mov.categoria_nombre || '').toLowerCase();
        const ambito = (mov.ambito || '').toLowerCase();
        return desc.includes(query) || cat.includes(query) || ambito.includes(query);
      });

      if (filtered.length === 0) {
        return alert('No hay movimientos que coincidan con la búsqueda actual.');
      }

      // Columnas del reporte
      const headers = ['ID', 'Fecha', 'Hora', 'Tipo', 'Ambito', 'Categoria', 'Descripcion', 'Monto ($)'];
      const rows = filtered.map(m => [
        m.id,
        m.fecha,
        `"${formatLocalTime(m.creado_en, m.hora)}"`,
        m.tipo.toUpperCase(),
        m.ambito.toUpperCase(),
        `"${(m.categoria_nombre || '').replace(/"/g, '""')}"`,
        `"${(m.descripcion || '').replace(/"/g, '""')}"`,
        parseFloat(m.monto).toFixed(2)
      ]);

      // Agregar BOM (\uFEFF) para que Excel reconozca tildes y caracteres en español
      const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `reporte_balance_${state.scope}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    });
  }

  // ==================== 7. MODALES Y REGISTRO (CRUD) ====================
  // Cerrar modales con [x] o clic afuera
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModalAll());
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModalAll();
    });
  });

  function closeModalAll() {
    modalIngreso.classList.remove('active');
    modalGasto.classList.remove('active');
    modalEdit.classList.remove('active');
  }

  // Inicializar máscaras de moneda en los inputs
  setupCurrencyMask(document.getElementById('ingreso-monto'));
  setupCurrencyMask(document.getElementById('gasto-monto'));
  setupCurrencyMask(document.getElementById('edit-monto'));

  // Abrir Modal Ingreso
  btnOpenIngreso.addEventListener('click', () => {
    formIngreso.reset();
    document.getElementById('ingreso-fecha').value = getTodayString();
    populateSelect(selectCatIngreso, state.categoriasIngreso);
    modalIngreso.classList.add('active');
  });

  // Abrir Modal Gasto
  btnOpenGasto.addEventListener('click', () => {
    formGasto.reset();
    document.getElementById('gasto-fecha').value = getTodayString();
    populateSelect(selectCatGasto, state.categoriasGasto);
    modalGasto.classList.add('active');
  });

  // Guardar Ingreso
  formIngreso.addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = parseCurrencyInput(document.getElementById('ingreso-monto').value);
    const ambito = document.querySelector('input[name="ingreso-ambito"]:checked').value;
    const categoria_id = document.getElementById('ingreso-categoria').value;
    const fecha = document.getElementById('ingreso-fecha').value;
    const descripcion = document.getElementById('ingreso-desc').value;

    try {
      const res = await fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'ingreso', ambito, monto, categoria_id, fecha, descripcion })
      });

      if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Error al guardar ingreso');
      }

      closeModalAll();
      refreshDashboard();
    } catch (err) {
      alert('Error de conexión');
    }
  });

  // Guardar Gasto
  formGasto.addEventListener('submit', async (e) => {
    e.preventDefault();
    const monto = parseCurrencyInput(document.getElementById('gasto-monto').value);
    const ambito = document.querySelector('input[name="gasto-ambito"]:checked').value;
    const categoria_id = document.getElementById('gasto-categoria').value;
    const fecha = document.getElementById('gasto-fecha').value;
    const descripcion = document.getElementById('gasto-desc').value;

    try {
      const res = await fetch('/api/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'gasto', ambito, monto, categoria_id, fecha, descripcion })
      });

      if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Error al guardar el gasto');
      }

      closeModalAll();
      refreshDashboard();
    } catch (err) {
      alert('Error de conexión');
    }
  });

  // Editar Movimiento
  function openEditModal(mov) {
    document.getElementById('edit-id').value = mov.id;
    document.getElementById('edit-tipo').value = mov.tipo;
    document.getElementById('edit-monto').value = formatNumberToMask(mov.monto);
    document.getElementById('edit-fecha').value = mov.fecha;
    document.getElementById('edit-desc').value = mov.descripcion || '';

    if (mov.ambito === 'personal') {
      document.getElementById('edit-ambito-personal').checked = true;
    } else {
      document.getElementById('edit-ambito-negocio').checked = true;
    }

    const cats = mov.tipo === 'ingreso' ? state.categoriasIngreso : state.categoriasGasto;
    populateSelect(selectCatEdit, cats, mov.categoria_id);

    const titleElem = document.getElementById('edit-title');
    titleElem.textContent = `Editar ${mov.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}`;
    titleElem.style.color = mov.tipo === 'ingreso' ? 'var(--color-income)' : 'var(--color-expense)';

    const btnSubmit = document.getElementById('edit-submit-btn');
    btnSubmit.className = `btn-submit ${mov.tipo === 'ingreso' ? 'btn-income' : 'btn-expense'}`;

    modalEdit.classList.add('active');
  }

  formEdit.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const tipo = document.getElementById('edit-tipo').value;
    const monto = parseCurrencyInput(document.getElementById('edit-monto').value);
    const ambito = document.querySelector('input[name="edit-ambito"]:checked').value;
    const categoria_id = document.getElementById('edit-categoria').value;
    const fecha = document.getElementById('edit-fecha').value;
    const descripcion = document.getElementById('edit-desc').value;

    try {
      const res = await fetch(`/api/movimientos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, ambito, monto, categoria_id, fecha, descripcion })
      });

      if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Error al actualizar movimiento');
      }

      closeModalAll();
      refreshDashboard();
    } catch (err) {
      alert('Error de conexión');
    }
  });

  // Eliminar Movimiento
  async function confirmDeleteMovement(id) {
    if (!confirm('¿Estás seguro de que deseas eliminar este movimiento? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const res = await fetch(`/api/movimientos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Error al eliminar movimiento');
      }
      refreshDashboard();
    } catch (err) {
      alert('Error de conexión');
    }
  }

  // Iniciar comprobación de sesión al arrancar
  checkSession();
});
