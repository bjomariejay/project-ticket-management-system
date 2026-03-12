const { v4: uuidv4 } = require('uuid');
const { pool, query } = require('../config/database');
const { createNotification } = require('../models/notificationModel');
const { getProjectById } = require('../models/projectModel');
const { getUserById } = require('../models/userModel');
const { appendTicketLog, ensureTicketMember, getTicketForWorkspace, mapTicket } = require('../models/ticketModel');
const { logTicketWork } = require('../models/ticketWorkLogModel');
const { requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');
const { parseMentions, resolveMentionRecipients } = require('../utils/mentions');
const { padTicketNumber } = require('../utils/ticket');

const listTickets = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const projectFilter = req.query.projectId || req.query.channelId;
  const { creatorId, assigneeId, reviewerId } = req.query;
  const conditions = [];
  const params = [];

  params.push(workspaceId);
  conditions.push(`t.workspace_id = $${params.length}`);

  if (projectFilter) {
    params.push(projectFilter);
    conditions.push(`t.project_id = $${params.length}`);
  }
  if (creatorId) {
    params.push(creatorId);
    conditions.push(`t.creator_id = $${params.length}`);
  }
  if (assigneeId) {
    params.push(assigneeId);
    conditions.push(`t.assignee_id = $${params.length}`);
  }
  if (reviewerId) {
    params.push(reviewerId);
    conditions.push(`t.reviewer_id = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const viewerId = req.user?.userId || null;
  const viewerParamIndex = params.push(viewerId);
  const { rows } = await query(
    `SELECT t.*,
        CASE
          WHEN $${viewerParamIndex}::uuid IS NULL THEN false
          ELSE EXISTS (
            SELECT 1 FROM ticket_members tm WHERE tm.ticket_id = t.id AND tm.user_id = $${viewerParamIndex}
          )
        END AS viewer_is_member
       FROM tickets t
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT 100`,
    params
  );
  res.json(rows.map((row) => mapTicket(row, row.viewer_is_member)));
});

const getTicket = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const ticketRow = await getTicketForWorkspace(ticketId, workspaceId);
  if (!ticketRow) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  const viewerId = req.user?.userId || null;
  const isMember = viewerId ? await ensureTicketMember(ticketId, viewerId) : false;
  if (ticketRow.privacy === 'private' && !isMember) {
    return res.status(403).json({
      message: 'Join this private ticket to view details.',
      ticket: {
        id: ticketRow.id,
        ticketNumber: ticketRow.ticket_number,
        title: ticketRow.title,
        privacy: ticketRow.privacy,
      },
    });
  }
  const ticket = mapTicket(ticketRow, isMember);
  const [membersResult, logsResult, messagesResult] = await Promise.all([
    query(
      `SELECT tm.user_id AS "userId", u.display_name AS "displayName", u.handle, u.username, tm.role, tm.joined_at AS "joinedAt"
         FROM ticket_members tm
         JOIN users u ON tm.user_id = u.id
        WHERE tm.ticket_id = $1
        ORDER BY tm.joined_at`,
      [ticketId]
    ),
    query(
      `SELECT tl.id, tl.message, tl.created_at AS "createdAt", u.display_name AS "actorName"
         FROM ticket_logs tl
         LEFT JOIN users u ON tl.created_by = u.id
        WHERE tl.ticket_id = $1
        ORDER BY tl.created_at DESC
        LIMIT 50`,
      [ticketId]
    ),
    query(
      `SELECT tm.id, tm.body, tm.created_at AS "createdAt", tm.mentions, u.display_name AS "displayName", u.handle
         FROM ticket_messages tm
         LEFT JOIN users u ON tm.user_id = u.id
        WHERE tm.ticket_id = $1
        ORDER BY tm.created_at ASC
        LIMIT 200`,
      [ticketId]
    ),
  ]);

  res.json({
    ...ticket,
    members: membersResult.rows,
    logs: logsResult.rows,
    messages: messagesResult.rows,
  });
});

const createTicket = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { title, description, creatorId, estimatedHours, reviewerId: requestedReviewerId } = req.body || {};
  const projectId = req.body?.projectId || req.body?.channelId;
  if (!title || !projectId || !creatorId) {
    return res.status(400).json({ message: 'title, projectId and creatorId are required' });
  }
  const privacyValue = (req.body.privacy || 'public').toLowerCase();
  const allowedPrivacy = ['public', 'private'];
  const privacy = allowedPrivacy.includes(privacyValue) ? privacyValue : 'public';
  const priorityValue = (req.body.priority || 'normal').toLowerCase();
  const allowedPriorities = ['normal', 'priority'];
  const priority = allowedPriorities.includes(priorityValue) ? priorityValue : 'normal';
  const additionalMemberIds = Array.isArray(req.body.additionalMemberIds)
    ? Array.from(new Set(req.body.additionalMemberIds)).filter((id) => id && id !== creatorId)
    : [];

  const project = await getProjectById(projectId, workspaceId);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  const creator = await getUserById(creatorId);
  if (!creator || creator.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'Creator not found' });
  }
  let reviewerId = creatorId;
  if (requestedReviewerId && requestedReviewerId !== creatorId) {
    const reviewer = await getUserById(requestedReviewerId);
    if (!reviewer || reviewer.workspace_id !== workspaceId) {
      return res.status(404).json({ message: 'Reviewer not found' });
    }
    reviewerId = reviewer.id;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sequenceResult = await client.query(
      'UPDATE project_sequences SET last_value = last_value + 1 WHERE project_id = $1 RETURNING last_value',
      [projectId]
    );
    if (!sequenceResult.rowCount) {
      throw new Error('Project has no sequence configuration');
    }
    const nextNumber = sequenceResult.rows[0].last_value;
    const ticketNumber = `${project.ticket_prefix.toLowerCase()}-${padTicketNumber(nextNumber)}`;
    const ticketId = uuidv4();

    const insertTicket = await client.query(
      `INSERT INTO tickets (
          id, ticket_number, title, description, project_id, creator_id, reviewer_id, estimated_hours, privacy, priority, workspace_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        ticketId,
        ticketNumber,
        title,
        description || '',
        projectId,
        creatorId,
        reviewerId,
        estimatedHours || null,
        privacy,
        priority,
        workspaceId,
      ]
    );

    await client.query('INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)', [
      ticketId,
      creatorId,
      'owner',
    ]);

    for (const memberId of additionalMemberIds) {
      const teammate = await getUserById(memberId);
      if (!teammate || teammate.workspace_id !== workspaceId) continue;
      const memberCheck = await client.query(
        'SELECT 1 FROM ticket_members WHERE ticket_id = $1 AND user_id = $2',
        [ticketId, memberId]
      );
      if (memberCheck.rowCount) continue;
      await client.query('INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)', [
        ticketId,
        memberId,
        'participant',
      ]);
      await appendTicketLog(client, ticketId, creatorId, `${teammate.display_name} was invited to the ticket`);
    }

    await appendTicketLog(
      client,
      ticketId,
      creatorId,
      `${creator.display_name} created ticket ${ticketNumber}`
    );

    await client.query('COMMIT');
    res.status(201).json(mapTicket(insertTicket.rows[0], true));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ticket creation failed', error);
    res.status(500).json({ message: 'Unable to create ticket' });
  } finally {
    client.release();
  }
});

const joinTicket = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const actorId = req.body.actorId || req.user?.userId;
  const targetUserId = req.body.userId || actorId;
  if (!actorId || !targetUserId) {
    return res.status(400).json({ message: 'actorId or user context is required' });
  }

  const ticket = await getTicketForWorkspace(ticketId, workspaceId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }

  const [actor, targetUser] = await Promise.all([
    getUserById(actorId),
    actorId === targetUserId ? Promise.resolve(null) : getUserById(targetUserId),
  ]);
  const resolvedTarget = actorId === targetUserId ? actor : targetUser;
  if (!actor || !resolvedTarget) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (actor.workspace_id !== workspaceId || resolvedTarget.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'User not found' });
  }

  const actorIsMember = await ensureTicketMember(ticketId, actorId);
  if (targetUserId !== actorId && !actorIsMember) {
    return res.status(403).json({ message: 'Only ticket members can invite others.' });
  }
  if (ticket.privacy === 'private' && !actorIsMember && actorId === targetUserId) {
    return res
      .status(403)
      .json({ message: 'This ticket is private. Ask an existing member to invite you.' });
  }

  const alreadyMember = await ensureTicketMember(ticketId, targetUserId);
  if (alreadyMember) {
    return res.json({ message: 'Already part of ticket' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO ticket_members (ticket_id, user_id) VALUES ($1, $2)', [
      ticketId,
      targetUserId,
    ]);
    if (targetUserId === actorId) {
      await appendTicketLog(client, ticketId, actorId, `${actor.display_name} joined the ticket`);
    } else {
      await appendTicketLog(
        client,
        ticketId,
        actorId,
        `${actor.display_name} invited ${resolvedTarget.display_name} to the ticket`
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'Joined ticket' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Join ticket failed', error);
    res.status(500).json({ message: 'Unable to join ticket' });
  } finally {
    client.release();
  }
});

const updateTicketSettings = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const { actorId, status, priority, estimatedHours, title, actualHours } = req.body || {};
  if (!actorId) {
    return res.status(400).json({ message: 'actorId is required' });
  }
  const [actor, ticket] = await Promise.all([
    getUserById(actorId),
    getTicketForWorkspace(ticketId, workspaceId),
  ]);
  if (!actor || actor.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'User not found' });
  }
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  const isMember = await ensureTicketMember(ticketId, actorId);
  if (!isMember) {
    return res.status(403).json({ message: 'Only members can update ticket details.' });
  }

  const updates = [];
  const params = [];
  const changeMessages = [];
  let shouldLogActualHours = false;
  let actualHoursTotal = null;
  const allowedStatuses = ['open', 'in_progress', 'archived'];
  const allowedPriorities = ['normal', 'priority'];

  if (status && status !== ticket.status) {
    const normalizedStatus = String(status).toLowerCase();
    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    updates.push(`status = $${updates.length + 1}`);
    params.push(normalizedStatus);
    if (normalizedStatus === 'archived') {
      updates.push(`archived_at = $${updates.length + 1}`);
      params.push(new Date());
    } else if (ticket.status === 'archived') {
      updates.push(`archived_at = $${updates.length + 1}`);
      params.push(null);
    }
    changeMessages.push(`${actor.display_name} set status to ${normalizedStatus}`);
  }

  if (priority && priority !== ticket.priority) {
    const normalizedPriority = String(priority).toLowerCase();
    if (!allowedPriorities.includes(normalizedPriority)) {
      return res.status(400).json({ message: 'Invalid priority value' });
    }
    updates.push(`priority = $${updates.length + 1}`);
    params.push(normalizedPriority);
    changeMessages.push(`${actor.display_name} marked ticket as ${normalizedPriority}`);
  }

  if (typeof title === 'string') {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return res.status(400).json({ message: 'Title cannot be empty' });
    }
    if (trimmedTitle !== ticket.title) {
      updates.push(`title = $${updates.length + 1}`);
      params.push(trimmedTitle);
      changeMessages.push(`${actor.display_name} renamed ticket`);
    }
  }

  if (Number.isFinite(estimatedHours)) {
    const hoursValue = Number(estimatedHours);
    updates.push(`estimated_hours = $${updates.length + 1}`);
    params.push(hoursValue >= 0 ? hoursValue : null);
    changeMessages.push(`${actor.display_name} updated estimate to ${hoursValue >= 0 ? hoursValue : 'unset'}`);
  }

  if (Number.isFinite(actualHours)) {
    const hoursValue = Number(actualHours);
    const existingActual = Number(ticket.actual_hours) || 0;
    const totalHrs = hoursValue + existingActual;
    updates.push(`actual_hours = $${updates.length + 1}`);
    params.push(totalHrs >= 0 ? totalHrs : null);
    const hoursMessage = `${actor.display_name} updated actual to ${totalHrs >= 0 ? totalHrs : 'unset'}`;
    changeMessages.push(hoursMessage);
    shouldLogActualHours = true;
    actualHoursTotal = totalHrs >= 0 ? totalHrs : null;
  }

  if (!updates.length) {
    return res.json({ message: 'No changes applied' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const setClause = updates.join(', ');
    const ticketIdParamIndex = params.length + 1;
    const updateQuery = `UPDATE tickets SET ${setClause}, updated_at = now() WHERE id = $${ticketIdParamIndex} RETURNING *`;
    params.push(ticketId);
    const updatedTicket = await client.query(updateQuery, params);
    const updatedRow = updatedTicket.rows[0];
    for (const message of changeMessages) {
      await appendTicketLog(client, ticketId, actorId, message);
    }
    if (shouldLogActualHours && updatedRow) {
      await logTicketWork({
        client,
        ticketRow: updatedRow,
        userId: actorId,
        actualHours: actualHours,
      });
    }
    await client.query('COMMIT');
    res.json(mapTicket(updatedTicket.rows[0], true));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ticket update failed', error);
    res.status(500).json({ message: 'Unable to update ticket' });
  } finally {
    client.release();
  }
});

const updateTicketPrivacy = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const requestedPrivacy = (req.body?.privacy || '').toLowerCase();
  const allowedPrivacy = ['public', 'private'];
  if (!allowedPrivacy.includes(requestedPrivacy)) {
    return res.status(400).json({ message: 'privacy must be public or private' });
  }
  const actorId = req.body?.actorId || req.user?.userId;
  if (!actorId) {
    return res.status(400).json({ message: 'actorId is required' });
  }

  const [ticket, actor] = await Promise.all([
    getTicketForWorkspace(ticketId, workspaceId),
    getUserById(actorId),
  ]);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  if (!actor || actor.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'User not found' });
  }
  const isMember = await ensureTicketMember(ticketId, actorId);
  if (!isMember) {
    return res.status(403).json({ message: 'Only ticket members can update privacy.' });
  }
  if (ticket.privacy === requestedPrivacy) {
    return res.json({ message: `Ticket already ${requestedPrivacy}` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE tickets SET privacy = $1, updated_at = now() WHERE id = $2', [
      requestedPrivacy,
      ticketId,
    ]);
    await appendTicketLog(
      client,
      ticketId,
      actorId,
      `${actor.display_name} set ticket privacy to ${requestedPrivacy}`
    );
    await client.query('COMMIT');
    res.json({ message: 'Privacy updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Privacy update failed', error);
    res.status(500).json({ message: 'Unable to update privacy' });
  } finally {
    client.release();
  }
});

const assignTicket = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const { assigneeId, actorId } = req.body || {};
  if (!assigneeId || !actorId) {
    return res.status(400).json({ message: 'assigneeId and actorId are required' });
  }

  const [ticket, assignee, actor] = await Promise.all([
    getTicketForWorkspace(ticketId, workspaceId),
    getUserById(assigneeId),
    getUserById(actorId),
  ]);

  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  if (
    !assignee ||
    !actor ||
    assignee.workspace_id !== workspaceId ||
    actor.workspace_id !== workspaceId
  ) {
    return res.status(404).json({ message: 'User not found' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE tickets SET assignee_id = $1, updated_at = now() WHERE id = $2', [
      assigneeId,
      ticketId,
    ]);
    const memberCheck = await client.query(
      'SELECT 1 FROM ticket_members WHERE ticket_id = $1 AND user_id = $2',
      [ticketId, assigneeId]
    );
    if (!memberCheck.rowCount) {
      await client.query('INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)', [
        ticketId,
        assigneeId,
        'participant',
      ]);
    }
    await appendTicketLog(
      client,
      ticketId,
      actorId,
      `${actor.display_name} assigned ticket to ${assignee.display_name}`
    );
    await client.query('COMMIT');
    res.json({ message: 'Assignee updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: 'Unable to assign ticket' });
  } finally {
    client.release();
  }
});

const updateReviewer = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const { reviewerId, actorId } = req.body || {};
  if (!reviewerId || !actorId) {
    return res.status(400).json({ message: 'reviewerId and actorId are required' });
  }

  const [ticket, reviewer, actor] = await Promise.all([
    getTicketForWorkspace(ticketId, workspaceId),
    getUserById(reviewerId),
    getUserById(actorId),
  ]);

  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  if (
    !reviewer ||
    !actor ||
    reviewer.workspace_id !== workspaceId ||
    actor.workspace_id !== workspaceId
  ) {
    return res.status(404).json({ message: 'User not found' });
  }

  const actorIsMember = await ensureTicketMember(ticketId, actorId);
  if (!actorIsMember) {
    return res.status(403).json({ message: 'Only ticket members can assign a reviewer.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE tickets SET reviewer_id = $1, updated_at = now() WHERE id = $2', [
      reviewerId,
      ticketId,
    ]);
    const memberCheck = await client.query(
      'SELECT 1 FROM ticket_members WHERE ticket_id = $1 AND user_id = $2',
      [ticketId, reviewerId]
    );
    if (!memberCheck.rowCount) {
      await client.query('INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)', [
        ticketId,
        reviewerId,
        'participant',
      ]);
    }
    await appendTicketLog(
      client,
      ticketId,
      actorId,
      `${actor.display_name} set reviewer to ${reviewer.display_name}`
    );
    await client.query('COMMIT');
    res.json({ message: 'Reviewer updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unable to update reviewer', error);
    res.status(500).json({ message: 'Unable to update reviewer' });
  } finally {
    client.release();
  }
});

const archiveTicket = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const { actorId } = req.body || {};
  const ticket = await getTicketForWorkspace(ticketId, workspaceId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  const actor = actorId ? await getUserById(actorId) : null;
  if (actor && actor.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'User not found' });
  }

  const result = await query(
    'UPDATE tickets SET archived_at = now(), status = $1 WHERE id = $2 AND workspace_id = $3 RETURNING *',
    ['archived', ticketId, workspaceId]
  );
  if (!result.rowCount) {
    return res.status(404).json({ message: 'Ticket not found' });
  }

  if (actor) {
    await query(
      'INSERT INTO ticket_logs (id, ticket_id, message, created_by) VALUES ($1, $2, $3, $4)',
      [uuidv4(), ticketId, `${actor.display_name} archived the ticket`, actorId]
    );
  }

  res.json(mapTicket(result.rows[0]));
});

const postTicketMessage = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const { userId, body } = req.body || {};
  if (!userId || !body) {
    return res.status(400).json({ message: 'userId and body are required' });
  }

  const [ticket, user] = await Promise.all([
    getTicketForWorkspace(ticketId, workspaceId),
    getUserById(userId),
  ]);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  if (!user || user.workspace_id !== workspaceId) {
    return res.status(404).json({ message: 'User not found' });
  }

  const isMember = await ensureTicketMember(ticketId, userId);
  if (!isMember) {
    return res.status(403).json({ message: 'Join ticket before posting' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mentions = parseMentions(body);
    const messageId = uuidv4();
    await client.query(
      'INSERT INTO ticket_messages (id, ticket_id, user_id, body, mentions) VALUES ($1, $2, $3, $4, $5)',
      [messageId, ticketId, userId, body, mentions]
    );

    await appendTicketLog(client, ticketId, userId, `${user.display_name} posted an update`);

    const trimmed = body.trim().toLowerCase();
    if (trimmed === 'start ticket') {
      if (ticket.status === 'open' || ticket.status === 'archived') {
        const params = ['in_progress'];
        const clauses = ['status = $1'];
        if (ticket.status === 'open') {
          clauses.push('started_at = now()');
        }
        if (ticket.status === 'archived') {
          clauses.push('archived_at = NULL');
        }
        clauses.push('updated_at = now()');
        const updateQuery = `UPDATE tickets SET ${clauses.join(', ')} WHERE id = $${params.length + 1}`;
        await client.query(updateQuery, [...params, ticketId]);
      }
      await appendTicketLog(client, ticketId, userId, `${user.display_name} started working on the ticket`);
    }

    const recipients = await resolveMentionRecipients(client, mentions, userId, workspaceId);
    if (recipients.length) {
      for (const recipient of recipients) {
        const membership = await client.query(
          'SELECT 1 FROM ticket_members WHERE ticket_id = $1 AND user_id = $2',
          [ticketId, recipient.id]
        );
        if (!membership.rowCount) {
          await client.query(
            'INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)',
            [ticketId, recipient.id, 'participant']
          );
          await appendTicketLog(
            client,
            ticketId,
            userId,
            `${user.display_name} added ${recipient.display_name} via mention`
          );
        }
        await createNotification(
          client,
          recipient.id,
          ticketId,
          `${user.display_name} mentioned you on ${ticket.ticket_number}`,
          { triggerAttention: true }
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: messageId });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('message failed', error);
    res.status(500).json({ message: 'Unable to post message' });
  } finally {
    client.release();
  }
});

const getTicketMessages = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const ticket = await getTicketForWorkspace(ticketId, workspaceId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  const { rows } = await query(
    `SELECT tm.id, tm.body, tm.created_at AS "createdAt", tm.mentions, u.display_name AS "displayName", u.handle
       FROM ticket_messages tm LEFT JOIN users u ON tm.user_id = u.id
      WHERE tm.ticket_id = $1 ORDER BY tm.created_at ASC LIMIT 200`,
    [ticketId]
  );
  res.json(rows);
});

const getTicketLogs = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { ticketId } = req.params;
  const ticket = await getTicketForWorkspace(ticketId, workspaceId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found' });
  }
  const { rows } = await query(
    `SELECT tl.id, tl.message, tl.created_at AS "createdAt", u.display_name AS "actorName"
       FROM ticket_logs tl LEFT JOIN users u ON tl.created_by = u.id
      WHERE tl.ticket_id = $1 ORDER BY tl.created_at DESC LIMIT 100`,
    [ticketId]
  );
  res.json(rows);
});

module.exports = {
  archiveTicket,
  assignTicket,
  createTicket,
  getTicket,
  getTicketLogs,
  getTicketMessages,
  joinTicket,
  listTickets,
  postTicketMessage,
  updateReviewer,
  updateTicketPrivacy,
  updateTicketSettings,
};
