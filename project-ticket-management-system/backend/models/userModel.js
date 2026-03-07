const { query } = require('../config/database');

const mapUser = (row) =>
  row
    ? {
        id: row.id,
        displayName: row.display_name,
        username: row.username,
        handle: row.handle,
        location: row.location,
        workspaceId: row.workspace_id,
        workspaceName: row.workspace_name,
        isActive: row.is_active,
      }
    : null;

const getUserById = async (userId) => {
  const { rows } = await query(
    `SELECT u.*, w.name AS workspace_name
       FROM users u
       LEFT JOIN workspaces w ON u.workspace_id = w.id
      WHERE u.id = $1`,
    [userId]
  );
  return rows[0];
};

const getWorkspaceUsers = async (workspaceId) => {
  const { rows } = await query(
    `SELECT u.id,
            u.display_name,
            u.username,
            u.handle,
            u.location,
            u.workspace_id,
            w.name AS workspace_name,
            u.is_active AS is_active
       FROM users u
       LEFT JOIN workspaces w ON u.workspace_id = w.id
      WHERE u.workspace_id = $1
      ORDER BY u.display_name`,
    [workspaceId]
  );
  return rows.map((row) => mapUser(row));
};

const getAllUsers = async () => {
  const { rows } = await query(
    `SELECT u.id,
            u.display_name,
            u.username,
            u.handle,
            u.location,
            u.workspace_id,
            w.name AS workspace_name,
            u.is_active AS is_active
       FROM users u
       LEFT JOIN workspaces w ON u.workspace_id = w.id
      ORDER BY u.display_name`
  );
  return rows.map((row) => mapUser(row));
};

const fetchUserProjectIds = async (workspaceId, userId) => {
  const { rows } = await query(
    `SELECT DISTINCT t.project_id AS "projectId"
       FROM tickets t
       LEFT JOIN ticket_members tm ON tm.ticket_id = t.id AND tm.user_id = $2
      WHERE t.workspace_id = $1
        AND t.project_id IS NOT NULL
        AND (
          tm.user_id IS NOT NULL OR
          t.creator_id = $2 OR
          t.assignee_id = $2 OR
          t.reviewer_id = $2
        )`,
    [workspaceId, userId]
  );
  return rows.map((row) => row.projectId);
};

const setUserActiveState = (userId, isActive) =>
  query('UPDATE users SET is_active = $1 WHERE id = $2', [isActive, userId]);

const getGlobalReportsLastSeen = async (userId, workspaceId) => {
  const { rows } = await query(
    `SELECT global_reports_last_seen
       FROM users
      WHERE id = $1
        AND workspace_id = $2`,
    [userId, workspaceId]
  );
  return rows[0]?.global_reports_last_seen || null;
};

const setGlobalReportsLastSeen = (userId, workspaceId, timestamp) =>
  query(
    `UPDATE users
        SET global_reports_last_seen = $1
      WHERE id = $2
        AND workspace_id = $3`,
    [timestamp, userId, workspaceId]
  );

module.exports = {
  fetchUserProjectIds,
  getAllUsers,
  getGlobalReportsLastSeen,
  getUserById,
  getWorkspaceUsers,
  mapUser,
  setGlobalReportsLastSeen,
  setUserActiveState,
};
