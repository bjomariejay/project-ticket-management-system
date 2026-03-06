const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const createNotification = async (client, userId, ticketId, message, options = {}) => {
  await client.query(
    'INSERT INTO notifications (id, user_id, source_ticket_id, message) VALUES ($1, $2, $3, $4)',
    [uuidv4(), userId, ticketId, message]
  );
  if (options.triggerAttention) {
    await client.query('UPDATE users SET has_new_notifications = true WHERE id = $1', [userId]);
  }
};

const getUserNotifications = async (userId) => {
  const { rows } = await query(
    `SELECT n.id,
            n.message,
            n.is_read AS "isRead",
            n.created_at AS "createdAt",
            t.ticket_number AS "ticketNumber",
            t.id AS "ticketId"
       FROM notifications n
       LEFT JOIN tickets t ON n.source_ticket_id = t.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 50`,
    [userId]
  );
  return rows;
};

const markNotificationRead = (notificationId, userId) =>
  query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [
    notificationId,
    userId,
  ]);

const markTicketNotificationsRead = (userId) =>
  query(
    `UPDATE notifications
        SET is_read = true
      WHERE user_id = $1
        AND source_ticket_id IS NOT NULL
        AND is_read = false`,
    [userId]
  );

const getNotificationStatus = async (userId, workspaceId) => {
  const { rows } = await query(
    `SELECT has_new_notifications
       FROM users
      WHERE id = $1
        AND workspace_id = $2`,
    [userId, workspaceId]
  );
  return Boolean(rows[0]?.has_new_notifications);
};

const resetNotificationFlag = (userId, workspaceId) =>
  query(
    `UPDATE users
        SET has_new_notifications = false
      WHERE id = $1
        AND workspace_id = $2`,
    [userId, workspaceId]
  );

module.exports = {
  createNotification,
  getNotificationStatus,
  getUserNotifications,
  markNotificationRead,
  markTicketNotificationsRead,
  resetNotificationFlag,
};
