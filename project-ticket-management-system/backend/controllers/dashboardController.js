const { query } = require('../config/database');
const { requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');

const getOverview = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { startDate, endDate } = req.query;
  const params = [workspaceId];
  const conditions = [];

  const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (start && end && start > end) {
    return res.status(400).json({ message: 'startDate must be before endDate' });
  }
  if (start) {
    params.push(start);
    conditions.push(`t.created_at >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    conditions.push(`t.created_at <= $${params.length}`);
  }

  const joinCondition = conditions.length
    ? `t.assignee_id = u.id AND t.workspace_id = $1 AND ${conditions.join(' AND ')}`
    : 't.assignee_id = u.id AND t.workspace_id = $1';

  const queryText = `SELECT
        u.id,
        u.display_name AS "displayName",
        COUNT(CASE WHEN t.status = 'archived' THEN 1 END) AS "archivedCount",
        COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) AS "inProgressCount",
        COUNT(CASE WHEN t.status = 'open' THEN 1 END) AS "openCount",
        COALESCE(SUM(t.estimated_hours), 0)::float AS "estimatedTotal",
        COALESCE(SUM(t.actual_hours), 0)::float AS "actualTotal"
      FROM users u
      LEFT JOIN tickets t ON ${joinCondition}
      WHERE u.workspace_id = $1
      GROUP BY u.id, u.display_name
      ORDER BY u.display_name`;

  const { rows } = await query(queryText, params);
  res.json(rows);
});

module.exports = { getOverview };
