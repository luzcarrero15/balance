require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const categoriesRoutes = require('./routes/categoriesRoutes');
const movementsRoutes = require('./routes/movementsRoutes');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'balance_secret_key_default_2026';

// Middlewares globales
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(SESSION_SECRET));

// Servir archivos estáticos del frontend desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/categorias', categoriesRoutes);
app.use('/api/movimientos', movementsRoutes);

// Ruta de estado de la aplicación
app.get('/api/health', (req, res) => {
  res.json({
    estado: 'ok',
    aplicacion: 'BALANCE',
    servidor: 'Activo'
  });
});

// Manejador para cualquier otra ruta (SPA fallback al index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejo centralizado de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado en la aplicación:', err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  🚀 Servidor BALANCE iniciado con éxito`);
  console.log(`  🌐 Escuchando en: http://localhost:${PORT}`);
  console.log(`  🔒 Cifrado de contraseñas: Argon2i`);
  console.log(`===============================================`);
});
