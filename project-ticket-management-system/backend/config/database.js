const { Pool } = require('pg');
const { databaseUrl, dbSslEnabled } = require('./env');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: dbSslEnabled ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err);
  process.exit(1);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
