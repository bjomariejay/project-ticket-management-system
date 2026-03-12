const { query } = require('../config/database');
const { requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeDateOnly = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return match[1];
};

const getOverview = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { startDate, endDate } = req.query;
  const params = [workspaceId];
  const conditions = [];

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

const getUserWorkLog = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { startDate, endDate, search } = req.query;
  const params = [workspaceId];
  const conditions = ['t.workspace_id = $1'];

  const start = normalizeDateOnly(startDate);
  const end = normalizeDateOnly(endDate);
  if (start && end && start > end) {
    return res.status(400).json({ message: 'startDate must be before endDate' });
  }
  if (start) {
    params.push(start);
    conditions.push(`DATE(twl.created_at) >= $${params.length}::date`);
  }
  if (end) {
    params.push(end);
    conditions.push(`DATE(twl.created_at) <= $${params.length}::date`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(
      `(u.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length} OR twl.ticket_number ILIKE $${params.length})`
    );
  }

  const queryText = `SELECT
        twl.id,
        twl.ticket_number AS "ticketNumber",
        twl.user_id AS "userId",
        twl.spend_time::float AS "spendTime",
        t.estimated_hours::float AS "estimatedHours",
        twl.created_at AS "createdAt",
        u.display_name AS "displayName"
      FROM ticket_work_logs twl
      JOIN tickets t ON twl.ticket_number = t.ticket_number
      LEFT JOIN users u ON twl.user_id = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY twl.created_at DESC
      LIMIT 1000`;

  const { rows } = await query(queryText, params);
  res.json(rows);
});

module.exports = { getOverview, getUserWorkLog };
