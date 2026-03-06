const {
  getNotificationStatus,
  getUserNotifications,
  markNotificationRead,
  markTicketNotificationsRead,
  resetNotificationFlag,
} = require('../models/notificationModel');
const { requireUserContext, requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');

const listNotifications = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const userId = requireUserContext(req, res);
  if (!userId) return;
  const rows = await getUserNotifications(userId);
  res.json(rows);
});

const markNotificationAsRead = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const userId = requireUserContext(req, res);
  if (!userId) return;
  const { notificationId } = req.params;
  const result = await markNotificationRead(notificationId, userId);
  if (!result.rowCount) {
    return res.status(404).json({ message: 'Notification not found' });
  }
  res.json({ message: 'Notification updated' });
});

const getNotificationsStatus = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const userId = requireUserContext(req, res);
  if (!userId) return;
  const hasNew = await getNotificationStatus(userId, workspaceId);
  res.json({ hasNew });
});

const acknowledgeNotifications = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const userId = requireUserContext(req, res);
  if (!userId) return;
  await markTicketNotificationsRead(userId);
  await resetNotificationFlag(userId, workspaceId);
  res.json({ lastSeen: null });
});

module.exports = {
  acknowledgeNotifications,
  getNotificationsStatus,
  listNotifications,
  markNotificationAsRead,
};
