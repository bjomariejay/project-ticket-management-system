require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { pool, query } = require('./db');
const { asyncHandler, padTicketNumber } = require('./utils');

const app = express();

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
  : undefined;

const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. Falling back to a development secret.');
}

const base64UrlEncode = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const base64UrlDecode = (value) => {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) {
    normalized += '=';
  }
  return Buffer.from(normalized, 'base64');
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedHash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const derivedHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = Buffer.from(derivedHash, 'hex');
  if (hashBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, derivedBuffer);
};

const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization header' });
  }
  const token = authHeader.substring('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    console.error('Invalid token', error);
    return res.status(401).json({ message: 'Invalid token' });
  }
});

const signToken = (payload) => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    crypto.createHmac('sha256', jwtSecret).update(`${header}.${claims}`).digest()
  );
  return `${header}.${claims}.${signature}`;
};

const verifyToken = (token) => {
  const [header, claims, signature] = token.split('.');
  if (!header || !claims || !signature) {
    throw new Error('Invalid token structure');
  }
  const expectedSignature = base64UrlEncode(
    crypto.createHmac('sha256', jwtSecret).update(`${header}.${claims}`).digest()
  );
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length) {
    throw new Error('Invalid token signature');
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error('Invalid token signature');
  }
  const payload = JSON.parse(base64UrlDecode(claims).toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) {
    throw new Error('Token expired');
  }
  return payload;
};

app.use(
  cors({
    origin: allowedOrigins || '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

const mapTicket = (row) => ({
  id: row.id,
  ticketNumber: row.ticket_number,
  title: row.title,
  description: row.description,
  status: row.status,
  channelId: row.channel_id,
  creatorId: row.creator_id,
  assigneeId: row.assignee_id,
  estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
  actualHours: row.actual_hours == null ? null : Number(row.actual_hours),
  startedAt: row.started_at,
  closedAt: row.closed_at,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fetchUser = async (userId) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return rows[0];
};

const fetchChannel = async (channelId) => {
  const { rows } = await query('SELECT * FROM channels WHERE id = $1', [channelId]);
  return rows[0];
};

const ensureTicketMember = async (ticketId, userId) => {
  const { rows } = await query(
    'SELECT 1 FROM ticket_members WHERE ticket_id = $1 AND user_id = $2',
    [ticketId, userId]
  );
  return rows.length > 0;
};

const appendLog = async (client, ticketId, userId, message) => {
  await client.query(
    'INSERT INTO ticket_logs (id, ticket_id, message, created_by) VALUES ($1, $2, $3, $4)',
    [uuidv4(), ticketId, message, userId]
  );
};

const createNotification = async (client, userId, ticketId, message) => {
  await client.query(
    'INSERT INTO notifications (id, user_id, source_ticket_id, message) VALUES ($1, $2, $3, $4)',
    [uuidv4(), userId, ticketId, message]
  );
};

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { handle, password } = req.body;
    if (!handle || !password) {
      return res.status(400).json({ message: 'handle and password are required' });
    }
    const {
      rows: [user],
    } = await query('SELECT id, display_name, handle, location, password_hash FROM users WHERE handle = $1', [
      handle,
    ]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = signToken({
      userId: user.id,
      handle: user.handle,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });
    res.json({
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        handle: user.handle,
        location: user.location,
      },
    });
  })
);

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { displayName, handle, email, password, location } = req.body;
    if (!displayName || !handle || !email || !password) {
      return res
        .status(400)
        .json({ message: 'displayName, handle, email and password are required' });
    }
    const passwordHash = hashPassword(password);
    const userId = uuidv4();
    try {
      await query(
        `INSERT INTO users (id, display_name, handle, email, password_hash, location)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, displayName, handle.toLowerCase(), email.toLowerCase(), passwordHash, location]
      );
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Handle or email already exists' });
      }
      throw error;
    }
    const token = signToken({
      userId,
      handle: handle.toLowerCase(),
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });
    res.status(201).json({
      token,
      user: {
        id: userId,
        displayName,
        handle: handle.toLowerCase(),
        location,
      },
    });
  })
);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const openPaths = ['/api/health', '/api/auth/login', '/api/auth/register'];
  if (req.method === 'OPTIONS' || openPaths.includes(req.path)) {
    return next();
  }
  return authenticate(req, res, next);
});

app.get(
  '/api/users',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT id, display_name AS "displayName", handle, location FROM users ORDER BY display_name'
    );
    res.json(rows);
  })
);

app.get(
  '/api/channels',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'SELECT c.*, cs.last_value FROM channels c LEFT JOIN channel_sequences cs ON c.id = cs.channel_id ORDER BY c.name'
    );
    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        ticketPrefix: row.ticket_prefix,
        nextNumber: (row.last_value || 0) + 1,
      }))
    );
  })
);

app.get(
  '/api/tickets',
  asyncHandler(async (req, res) => {
    const { channelId, creatorId, assigneeId } = req.query;
    const conditions = [];
    const params = [];

    if (channelId) {
      params.push(channelId);
      conditions.push(`channel_id = $${params.length}`);
    }
    if (creatorId) {
      params.push(creatorId);
      conditions.push(`creator_id = $${params.length}`);
    }
    if (assigneeId) {
      params.push(assigneeId);
      conditions.push(`assignee_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT * FROM tickets ${whereClause} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    res.json(rows.map(mapTicket));
  })
);

app.get(
  '/api/tickets/:ticketId',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { rows } = await query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    const ticket = mapTicket(rows[0]);
    const [membersResult, logsResult, messagesResult] = await Promise.all([
      query(
        `SELECT tm.user_id AS "userId", u.display_name AS "displayName", u.handle, tm.role, tm.joined_at AS "joinedAt"
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
  })
);

app.post(
  '/api/tickets',
  asyncHandler(async (req, res) => {
    const { title, description, channelId, creatorId, estimatedHours } = req.body;
    if (!title || !channelId || !creatorId) {
      return res.status(400).json({ message: 'title, channelId and creatorId are required' });
    }

    const channel = await fetchChannel(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    const creator = await fetchUser(creatorId);
    if (!creator) {
      return res.status(404).json({ message: 'Creator not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sequenceResult = await client.query(
        'UPDATE channel_sequences SET last_value = last_value + 1 WHERE channel_id = $1 RETURNING last_value',
        [channelId]
      );
      if (!sequenceResult.rowCount) {
        throw new Error('Channel has no sequence configuration');
      }
      const nextNumber = sequenceResult.rows[0].last_value;
      const ticketNumber = `${channel.ticket_prefix.toLowerCase()}-${padTicketNumber(nextNumber)}`;
      const ticketId = uuidv4();

      const insertTicket = await client.query(
        `INSERT INTO tickets (
          id, ticket_number, title, description, channel_id, creator_id, estimated_hours
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          ticketId,
          ticketNumber,
          title,
          description || '',
          channelId,
          creatorId,
          estimatedHours || null,
        ]
      );

      await client.query(
        'INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)',
        [ticketId, creatorId, 'owner']
      );

      await appendLog(
        client,
        ticketId,
        creatorId,
        `${creator.display_name} created ticket ${ticketNumber}`
      );

      await client.query('COMMIT');
      res.status(201).json(mapTicket(insertTicket.rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ticket creation failed', error);
      res.status(500).json({ message: 'Unable to create ticket' });
    } finally {
      client.release();
    }
  })
);

app.post(
  '/api/tickets/:ticketId/join',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const [ticketResult, user] = await Promise.all([
      query('SELECT * FROM tickets WHERE id = $1', [ticketId]),
      fetchUser(userId),
    ]);
    if (!ticketResult.rows.length) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const alreadyMember = await ensureTicketMember(ticketId, userId);
    if (alreadyMember) {
      return res.json({ message: 'Already part of ticket' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO ticket_members (ticket_id, user_id) VALUES ($1, $2)', [
        ticketId,
        userId,
      ]);
      await appendLog(client, ticketId, userId, `${user.display_name} joined the ticket`);
      await client.query('COMMIT');
      res.json({ message: 'Joined ticket' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Join ticket failed', error);
      res.status(500).json({ message: 'Unable to join ticket' });
    } finally {
      client.release();
    }
  })
);

app.post(
  '/api/tickets/:ticketId/assign',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { assigneeId, actorId } = req.body;
    if (!assigneeId || !actorId) {
      return res.status(400).json({ message: 'assigneeId and actorId are required' });
    }

    const [ticketResult, assignee, actor] = await Promise.all([
      query('SELECT * FROM tickets WHERE id = $1', [ticketId]),
      fetchUser(assigneeId),
      fetchUser(actorId),
    ]);

    if (!ticketResult.rows.length) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    if (!assignee || !actor) {
      return res.status(404).json({ message: 'User not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE tickets SET assignee_id = $1, updated_at = now() WHERE id = $2', [
        assigneeId,
        ticketId,
      ]);
      await appendLog(
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
  })
);

app.post(
  '/api/tickets/:ticketId/archive',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { actorId } = req.body;
    const actor = actorId ? await fetchUser(actorId) : null;

    const result = await query('UPDATE tickets SET archived_at = now(), status = $1 WHERE id = $2 RETURNING *', [
      'archived',
      ticketId,
    ]);
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
  })
);

const parseMentions = (text = '') => {
  const matches = text.match(/@([a-zA-Z0-9_-]+)/g) || [];
  return matches.map((mention) => mention.replace('@', '').toLowerCase());
};

const resolveMentionRecipients = async (client, mentionHandles, authorId) => {
  if (!mentionHandles.length) return [];
  const usersToNotify = new Map();

  const uniqueHandles = [...new Set(mentionHandles)];
  for (const handle of uniqueHandles) {
    if (handle === 'cebu') {
      const { rows } = await client.query(
        'SELECT id, display_name FROM users WHERE LOWER(location) LIKE $1',
        ['%cebu%']
      );
      rows.forEach((row) => {
        if (row.id !== authorId) {
          usersToNotify.set(row.id, row);
        }
      });
      continue;
    }
    const { rows } = await client.query('SELECT id, display_name FROM users WHERE LOWER(handle) = $1', [
      handle,
    ]);
    if (rows.length && rows[0].id !== authorId) {
      usersToNotify.set(rows[0].id, rows[0]);
    }
  }

  return Array.from(usersToNotify.values());
};

app.post(
  '/api/tickets/:ticketId/messages',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { userId, body } = req.body;
    if (!userId || !body) {
      return res.status(400).json({ message: 'userId and body are required' });
    }

    const [ticketResult, user] = await Promise.all([
      query('SELECT * FROM tickets WHERE id = $1', [ticketId]),
      fetchUser(userId),
    ]);
    if (!ticketResult.rows.length) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const ticket = ticketResult.rows[0];

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

      await appendLog(client, ticketId, userId, `${user.display_name} posted an update`);

      const trimmed = body.trim().toLowerCase();
      if (trimmed === 'start ticket' && ticket.status === 'open') {
        await client.query(
          'UPDATE tickets SET status = $1, started_at = now(), updated_at = now() WHERE id = $2',
          ['in_progress', ticketId]
        );
        await appendLog(client, ticketId, userId, `${user.display_name} started working on the ticket`);
      }

      const recipients = await resolveMentionRecipients(client, mentions, userId);
      if (recipients.length) {
        for (const recipient of recipients) {
          await createNotification(
            client,
            recipient.id,
            ticketId,
            `${user.display_name} mentioned you on ${ticket.ticket_number}`
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
  })
);

app.get(
  '/api/tickets/:ticketId/messages',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { rows } = await query(
      `SELECT tm.id, tm.body, tm.created_at AS "createdAt", tm.mentions, u.display_name AS "displayName", u.handle
       FROM ticket_messages tm LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.ticket_id = $1 ORDER BY tm.created_at ASC LIMIT 200`,
      [ticketId]
    );
    res.json(rows);
  })
);

app.get(
  '/api/tickets/:ticketId/logs',
  asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const { rows } = await query(
      `SELECT tl.id, tl.message, tl.created_at AS "createdAt", u.display_name AS "actorName"
       FROM ticket_logs tl LEFT JOIN users u ON tl.created_by = u.id
       WHERE tl.ticket_id = $1 ORDER BY tl.created_at DESC LIMIT 100`,
      [ticketId]
    );
    res.json(rows);
  })
);

app.get(
  '/api/notifications',
  asyncHandler(async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const { rows } = await query(
      `SELECT n.id, n.message, n.is_read AS "isRead", n.created_at AS "createdAt", t.ticket_number AS "ticketNumber"
       FROM notifications n
       LEFT JOIN tickets t ON n.source_ticket_id = t.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(rows);
  })
);

app.post(
  '/api/notifications/:notificationId/read',
  asyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    await query('UPDATE notifications SET is_read = true WHERE id = $1', [notificationId]);
    res.json({ message: 'Notification updated' });
  })
);

app.post(
  '/api/dms',
  asyncHandler(async (req, res) => {
    const { senderId, recipientId, body } = req.body;
    if (!senderId || !recipientId || !body) {
      return res.status(400).json({ message: 'senderId, recipientId and body are required' });
    }
    const sender = await fetchUser(senderId);
    const recipient = await fetchUser(recipientId);
    if (!sender || !recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    const id = uuidv4();
    await query(
      'INSERT INTO dms (id, sender_id, recipient_id, body) VALUES ($1, $2, $3, $4)',
      [id, senderId, recipientId, body]
    );
    await query(
      'INSERT INTO notifications (id, user_id, source_ticket_id, message) VALUES ($1, $2, NULL, $3)',
      [uuidv4(), recipientId, `${sender.display_name} sent you a DM`]
    );
    res.status(201).json({ id });
  })
);

app.get(
  '/api/dms',
  asyncHandler(async (req, res) => {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const { rows } = await query(
      `SELECT d.id, d.body, d.created_at AS "createdAt", d.sender_id AS "senderId", d.recipient_id AS "recipientId",
              su.display_name AS "senderName", ru.display_name AS "recipientName"
       FROM dms d
       LEFT JOIN users su ON su.id = d.sender_id
       LEFT JOIN users ru ON ru.id = d.recipient_id
       WHERE d.sender_id = $1 OR d.recipient_id = $1
       ORDER BY d.created_at DESC LIMIT 50`,
      [userId]
    );
    res.json(rows);
  })
);

app.get(
  '/api/dashboard/overview',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT
        u.id,
        u.display_name AS "displayName",
        COUNT(CASE WHEN t.status = 'archived' THEN 1 END) AS "archivedCount",
        COUNT(CASE WHEN t.status = 'in_progress' THEN 1 END) AS "inProgressCount",
        COUNT(CASE WHEN t.status = 'open' THEN 1 END) AS "openCount",
        COALESCE(SUM(t.estimated_hours), 0)::float AS "estimatedTotal",
        COALESCE(SUM(t.actual_hours), 0)::float AS "actualTotal"
      FROM users u
      LEFT JOIN tickets t ON t.assignee_id = u.id
      GROUP BY u.id, u.display_name
      ORDER BY u.display_name`
    );
    res.json(rows);
  })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
