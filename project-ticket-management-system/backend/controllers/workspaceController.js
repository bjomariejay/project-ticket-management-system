const { searchWorkspaces } = require('../models/workspaceModel');
const { asyncHandler } = require('../utils/asyncHandler');

const listWorkspaces = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').toLowerCase().trim();
  const rows = await searchWorkspaces(search);
  res.json(rows);
});

module.exports = { listWorkspaces };
