const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:123123@localhost:5432/project_ticket_management';
const sslEnabled = process.env.DB_SSL === 'true';

const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err);
  process.exit(1);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
