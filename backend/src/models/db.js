const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('connect', () => logger.info('✅ DB connection acquired from pool'));
pool.on('error',   (err) => logger.error('❌ Idle DB client error:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
