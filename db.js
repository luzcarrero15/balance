const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('ERROR: No se encontró DATABASE_URL en el archivo .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Prueba de conexión inicial sin interferir con el pool
pool.query('SELECT 1')
  .then(() => {
    console.log('Conexión exitosa a PostgreSQL en Neon.');
  })
  .catch((err) => {
    console.error('Error al conectar a PostgreSQL:', err.message);
  });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
