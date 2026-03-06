const { query } = require('../config/database');
const {
  fetchUserProjectIds,
  getGlobalReportsLastSeen,
  getUserById,
  setGlobalReportsLastSeen,
} = require('../models/userModel');
const { requireUserContext, requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');

const formatReportRows = (rows) =>
  rows.map((row) => ({
    id: row.id,
    message: row.message,
    createdAt: row.created_at,
    actorName: row.actor_name,
    ticketNumber: row.ticket_number,
    ticketTitle: row.title,
  }));

const getWorkspaceReports = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { rows } = await query(
    `SELECT tl.id,
            tl.message,
            tl.created_at,
            u.display_name AS actor_name,
            t.ticket_number,
            t.title
       FROM ticket_logs tl
       JOIN tickets t ON tl.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON tl.created_by = u.id
      WHERE LOWER(tl.message) LIKE '%start%'
        AND p.workspace_id = $1
      ORDER BY tl.created_at DESC
      LIMIT 200`,
    [workspaceId]
  );
  res.json(formatReportRows(rows));
});

const getLatestReportState = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const userId = requireUserContext(req, res);
  if (!userId) return;

  const userProjectIds = await fetchUserProjectIds(workspaceId, userId);
  const latestParams = [workspaceId];
  let projectFilterClause = '';
  if (userProjectIds.length) {
    latestParams.push(userProjectIds);
    projectFilterClause = ` AND t.project_id = ANY($${latestParams.length})`;
  }

  const latestPromise = query(
    `SELECT MAX(tl.created_at) AS latest
       FROM ticket_logs tl
       JOIN tickets t ON tl.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
      WHERE LOWER(tl.message) LIKE '%start%'
        AND p.workspace_id = $1${projectFilterClause}`,
    latestParams
  );

  const [latestResult, lastSeen] = await Promise.all([
    latestPromise,
    getGlobalReportsLastSeen(userId, workspaceId),
  ]);

  const latest = latestResult.rows[0]?.latest || null;
  res.json({ latest, lastSeen });
});

const markReportsSeen = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const userId = requireUserContext(req, res);
  if (!userId) return;

  const provided = typeof req.body?.timestamp === 'string' ? req.body.timestamp : null;
  let seenAt;
  if (provided) {
    const parsed = new Date(provided);
    if (Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ message: 'Invalid timestamp' });
    }
    seenAt = parsed.toISOString();
  } else {
    seenAt = new Date().toISOString();
  }

  await setGlobalReportsLastSeen(userId, workspaceId, seenAt);
  res.json({ lastSeen: seenAt });
});

const getReviewerReports = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { reviewerId } = req.params;
  const reviewer = await getUserById(reviewerId);
  if (!reviewer || reviewer.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'Reviewer not found' });
  }
  const { rows } = await query(
    `SELECT tl.id,
            tl.message,
            tl.created_at,
            u.display_name AS actor_name,
            t.ticket_number,
            t.title
       FROM ticket_logs tl
       JOIN tickets t ON tl.ticket_id = t.id
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN users u ON tl.created_by = u.id
      WHERE t.reviewer_id = $1
        AND p.workspace_id = $2
        AND LOWER(tl.message) LIKE '%start%'
      ORDER BY tl.created_at DESC
      LIMIT 200`,
    [reviewerId, workspaceId]
  );
  res.json(formatReportRows(rows));
});

module.exports = {
  getLatestReportState,
  getReviewerReports,
  getWorkspaceReports,
  markReportsSeen,
};
