const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { getUserById } = require('../models/userModel');
const { requireUserContext, requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');

const sendDirectMessage = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { senderId, recipientId, body } = req.body || {};
  if (!senderId || !recipientId || !body) {
    return res.status(400).json({ message: 'senderId, recipientId and body are required' });
  }
  if (req.user?.userId && senderId !== req.user.userId) {
    return res.status(403).json({ message: 'You can only send messages as yourself.' });
  }
  const sender = await getUserById(senderId);
  const recipient = await getUserById(recipientId);
  if (
    !sender ||
    !recipient ||
    sender.workspace_id !== workspaceId ||
    recipient.workspace_id !== workspaceId
  ) {
    return res.status(404).json({ message: 'User not found' });
  }

  const id = uuidv4();
  await query('INSERT INTO dms (id, sender_id, recipient_id, body) VALUES ($1, $2, $3, $4)', [
    id,
    senderId,
    recipientId,
    body,
  ]);
  await query('INSERT INTO notifications (id, user_id, source_ticket_id, message) VALUES ($1, $2, NULL, $3)', [
    uuidv4(),
    recipientId,
    `${sender.display_name} sent you a DM`,
  ]);
  res.status(201).json({ id });
});

const listDirectMessages = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const authUserId = requireUserContext(req, res);
  if (!authUserId) return;
  const { rows } = await query(
    `SELECT d.id,
            d.body,
            d.created_at AS "createdAt",
            d.sender_id AS "senderId",
            d.recipient_id AS "recipientId",
            su.display_name AS "senderName",
            ru.display_name AS "recipientName"
       FROM dms d
       LEFT JOIN users su ON su.id = d.sender_id
       LEFT JOIN users ru ON ru.id = d.recipient_id
      WHERE (d.sender_id = $1 OR d.recipient_id = $1)
        AND su.workspace_id = $2
        AND ru.workspace_id = $2
      ORDER BY d.created_at DESC
      LIMIT 50`,
    [authUserId, workspaceId]
  );
  res.json(rows);
});

module.exports = { listDirectMessages, sendDirectMessage };
