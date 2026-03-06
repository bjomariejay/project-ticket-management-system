const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const mapTicket = (row, viewerIsMember = true) => {
  const privacy = row.privacy || 'public';
  const isLocked = privacy === 'private' && !viewerIsMember;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title,
    description: row.description,
    status: row.status,
    projectId: row.project_id,
    creatorId: row.creator_id,
    assigneeId: row.assignee_id,
    reviewerId: row.reviewer_id,
    estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
    actualHours: row.actual_hours == null ? null : Number(row.actual_hours),
    startedAt: row.started_at,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    privacy,
    priority: row.priority || 'normal',
    isLocked,
    viewerIsMember,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const getTicketForWorkspace = async (ticketId, workspaceId) => {
  const { rows } = await query('SELECT * FROM tickets WHERE id = $1 AND workspace_id = $2', [
    ticketId,
    workspaceId,
  ]);
  return rows[0];
};

const ensureTicketMember = async (ticketId, userId) => {
  const { rows } = await query('SELECT 1 FROM ticket_members WHERE ticket_id = $1 AND user_id = $2', [
    ticketId,
    userId,
  ]);
  return rows.length > 0;
};

const appendTicketLog = async (client, ticketId, userId, message) => {
  await client.query(
    'INSERT INTO ticket_logs (id, ticket_id, message, created_by) VALUES ($1, $2, $3, $4)',
    [uuidv4(), ticketId, message, userId]
  );
};

module.exports = {
  appendTicketLog,
  ensureTicketMember,
  getTicketForWorkspace,
  mapTicket,
};
