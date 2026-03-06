const parseList = (value = '') =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const port = Number(process.env.PORT) || 4000;
const databaseUrl =
  process.env.DATABASE_URL || 'postgres://postgres:123123@localhost:5432/project_ticket_management';
const dbSslEnabled = String(process.env.DB_SSL).toLowerCase() === 'true';
const jwtSecret = process.env.JWT_SECRET || 'dev-secret';
const tokenTtlSeconds = Number(process.env.JWT_TTL_SECONDS) || 8 * 60 * 60;
const clientOrigins = process.env.CLIENT_ORIGIN ? parseList(process.env.CLIENT_ORIGIN) : undefined;

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. Falling back to a development secret.');
}

module.exports = {
  clientOrigins,
  databaseUrl,
  dbSslEnabled,
  jwtSecret,
  port,
  tokenTtlSeconds,
};
