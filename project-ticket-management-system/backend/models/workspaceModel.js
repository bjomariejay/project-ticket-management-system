const { query } = require('../config/database');

const searchWorkspaces = async (searchTerm) => {
  const params = [];
  let whereClause = '';
  if (searchTerm) {
    params.push(`${searchTerm}%`);
    whereClause = 'WHERE LOWER(name) LIKE $1';
  }
  const { rows } = await query(
    `SELECT id, name
       FROM workspaces
       ${whereClause}
       ORDER BY name
       LIMIT 10`,
    params
  );
  return rows;
};

module.exports = { searchWorkspaces };
