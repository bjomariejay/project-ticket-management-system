const { query } = require('../config/database');
const {
  getAllUsers,
  getUserById,
  getWorkspaceUsers,
  mapUser,
  setUserActiveState,
} = require('../models/userModel');
const { requireUserContext, requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');

const listUsers = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const rows = await getWorkspaceUsers(workspaceId);
  res.json(rows);
});

const listPublicUsers = asyncHandler(async (req, res) => {
  const rows = await getAllUsers();
  res.json(rows);
});

const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!req.user) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const actorId = req.user.userId;
  const actorHandle = req.user.handle;
  const actorWorkspaceId = req.user.workspaceId;

  const targetUser = await getUserById(userId);
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const actorIsSelf = actorId === userId;
  const actorIsAdmin = actorHandle === 'admin';
  if (!actorIsSelf) {
    if (!actorIsAdmin) {
      return res.status(403).json({ message: 'You can only update your own profile.' });
    }
    if (targetUser.workspace_id !== actorWorkspaceId) {
      return res.status(403).json({ message: 'Admins can only update users in their workspace.' });
    }
  }

  const { displayName, handle, location } = req.body || {};
  const updates = [];
  const params = [];

  if (typeof displayName === 'string' && displayName.trim()) {
    params.push(displayName.trim());
    updates.push(`display_name = $${params.length}`);
  }
  if (typeof handle === 'string' && handle.trim()) {
    params.push(handle.trim().toLowerCase());
    updates.push(`handle = $${params.length}`);
  }
  if (typeof location === 'string') {
    params.push(location.trim() || null);
    updates.push(`location = $${params.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'Provide at least one field to update.' });
  }

  params.push(userId);
  const queryText = `WITH updated AS (
        UPDATE users SET ${updates.join(', ')}
        WHERE id = $${params.length}
        RETURNING id, display_name, username, handle, location, workspace_id
      )
      SELECT updated.id,
             updated.display_name,
             updated.username,
             updated.handle,
             updated.location,
             updated.workspace_id,
             w.name AS workspace_name
        FROM updated
        LEFT JOIN workspaces w ON updated.workspace_id = w.id`;

  try {
    const { rows } = await query(queryText, params);
    if (!rows.length) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(mapUser(rows[0]));
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_workspace_handle_unique') {
      return res.status(409).json({ message: 'Handle already in use in this workspace.' });
    }
    console.error('User update failed', error);
    res.status(500).json({ message: 'Unable to update profile.' });
  }
});

const heartbeat = asyncHandler(async (req, res) => {
  const userId = requireUserContext(req, res);
  if (!userId) return;
  await setUserActiveState(userId, true);
  res.json({ message: 'ok' });
});

const markInactive = asyncHandler(async (req, res) => {
  const userId = requireUserContext(req, res);
  if (!userId) return;
  await setUserActiveState(userId, false);
  res.json({ message: 'ok' });
});

module.exports = { heartbeat, listUsers, listPublicUsers, markInactive, updateUser };
