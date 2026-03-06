const { query } = require('../config/database');
const { asyncHandler } = require('../utils/asyncHandler');

const checkHealth = asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ status: 'ok' });
});

module.exports = { checkHealth };
