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

const slugify = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 64);

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

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const createExpiryClaim = () => Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

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
  if (payload.exp !== undefined) {
    const expValue = Number(payload.exp);
    if (!Number.isFinite(expValue)) {
      throw new Error('Token expired');
    }
    const expMs = expValue > 1e12 ? expValue : expValue * 1000;
    if (Date.now() > expMs) {
      throw new Error('Token expired');
    }
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
      }
    : null;

const fetchUser = async (userId) => {
  const { rows } = await query(
    `SELECT u.*, w.name AS workspace_name
       FROM users u
       LEFT JOIN workspaces w ON u.workspace_id = w.id
      WHERE u.id = $1`,
    [userId]
  );
  return rows[0];
};

const fetchProject = async (projectId, workspaceId) => {
  const params = workspaceId ? [projectId, workspaceId] : [projectId];
  const workspaceClause = workspaceId ? ' AND workspace_id = $2' : '';
  const { rows } = await query(
    `SELECT * FROM projects WHERE id = $1${workspaceClause}`,
    params
  );
  return rows[0];
};

const fetchTicketForWorkspace = async (ticketId, workspaceId) => {
  const { rows } = await query(
    'SELECT * FROM tickets WHERE id = $1 AND workspace_id = $2',
    [ticketId, workspaceId]
  );
  return rows[0];
};

const requireWorkspaceContext = (req, res) => {
  const workspaceId = req.user?.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ message: 'Workspace context is required' });
    return null;
  }
  return workspaceId;
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

app.get(
  '/api/workspaces',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').toLowerCase().trim();
    const params = [];
    let whereClause = '';
    if (search) {
      params.push(`${search}%`);
      whereClause = 'WHERE LOWER(name) LIKE $1';
    }
    const { rows } = await query(
      `SELECT id, name
         FROM workspaces
         ${whereClause}
         ORDER BY name
         LIMIT 10`,
      params
    );
    res.json(rows);
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const rawIdentifier = (req.body?.username ?? req.body?.handle ?? '').trim().toLowerCase();
    const { password } = req.body;
    if (!rawIdentifier || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }
    const {
      rows: [user],
    } = await query(
      `SELECT u.id,
              u.display_name,
              u.username,
              u.handle,
              u.location,
              u.password_hash,
              u.workspace_id,
              w.name AS workspace_name
         FROM users u
         LEFT JOIN workspaces w ON u.workspace_id = w.id
        WHERE u.username = $1`,
      [rawIdentifier]
    );
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    await query('UPDATE users SET last_active_at = now() WHERE id = $1', [user.id]);
    const token = signToken({
      userId: user.id,
      handle: user.handle,
      workspaceId: user.workspace_id,
      exp: createExpiryClaim(),
    });
    res.json({
      token,
      user: {
        id: user.id,
        displayName: user.display_name,
        username: user.username,
        handle: user.handle,
        location: user.location,
        workspaceId: user.workspace_id,
        workspaceName: user.workspace_name,
      },
    });
  })
);

app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { displayName, handle, email, password, location, username, workspaceName } = req.body;
    if (!displayName || !handle || !email || !password || !workspaceName) {
      return res.status(400).json({
        message: 'displayName, handle, email, password and workspaceName are required',
      });
    }
    const normalizedWorkspaceName = workspaceName.trim().toLowerCase();
    if (!normalizedWorkspaceName) {
      return res.status(400).json({ message: 'workspaceName is required' });
    }
    const passwordHash = hashPassword(password);
    const userId = uuidv4();
    const client = await pool.connect();
    let workspaceId = '';
    let workspaceDisplayName = normalizedWorkspaceName;
    try {
      await client.query('BEGIN');
      const existingWorkspace = await client.query('SELECT id, name FROM workspaces WHERE name = $1', [
        normalizedWorkspaceName,
      ]);
      if (existingWorkspace.rowCount) {
        workspaceId = existingWorkspace.rows[0].id;
        workspaceDisplayName = existingWorkspace.rows[0].name;
      } else {
        workspaceId = uuidv4();
        try {
          await client.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [
            workspaceId,
            normalizedWorkspaceName,
          ]);
        } catch (workspaceError) {
          if (workspaceError.code === '23505') {
            const fallback = await client.query('SELECT id, name FROM workspaces WHERE name = $1', [
              normalizedWorkspaceName,
            ]);
            if (fallback.rowCount) {
              workspaceId = fallback.rows[0].id;
              workspaceDisplayName = fallback.rows[0].name;
            } else {
              throw workspaceError;
            }
          } else {
            throw workspaceError;
          }
        }
      }
      await client.query(
        `INSERT INTO users (id, display_name, username, handle, email, password_hash, location, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          displayName,
          (username || handle).toLowerCase(),
          handle.toLowerCase(),
          email.toLowerCase(),
          passwordHash,
          location,
          workspaceId,
        ]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        switch (error.constraint) {
          case 'users_username_key':
            return res.status(409).json({ message: 'Username already exists' });
          case 'users_email_key':
            return res.status(409).json({ message: 'Email already exists' });
          case 'users_workspace_handle_unique':
            return res.status(409).json({ message: 'Handle already exists in this workspace' });
          default:
            return res.status(409).json({ message: 'Account already exists' });
        }
      }
      throw error;
    } finally {
      client.release();
    }
    const token = signToken({
      userId,
      handle: handle.toLowerCase(),
      workspaceId,
      exp: createExpiryClaim(),
    });
    res.status(201).json({
      token,
      user: {
        id: userId,
        displayName,
        username: (username || handle).toLowerCase(),
        handle: handle.toLowerCase(),
        location,
        workspaceId,
        workspaceName: workspaceDisplayName,
      },
    });
  })
);

app.post(
  '/api/users/me/heartbeat',
  asyncHandler(async (req, res) => {
    if (!req.user?.userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    await query('UPDATE users SET last_active_at = now() WHERE id = $1', [req.user.userId]);
    res.json({ message: 'ok' });
  })
);

app.post(
  '/api/users/me/inactive',
  asyncHandler(async (req, res) => {
    if (!req.user?.userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    await query("UPDATE users SET last_active_at = now() - INTERVAL '10 minutes' WHERE id = $1", [
      req.user.userId,
    ]);
    res.json({ message: 'ok' });
  })
);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const openPaths = ['/api/health', '/api/auth/login', '/api/auth/register', '/api/workspaces'];
  if (req.method === 'OPTIONS' || openPaths.includes(req.path)) {
    return next();
  }
  return authenticate(req, res, next);
});

app.get(
  '/api/users',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { rows } = await query(
      `SELECT u.id,
              u.display_name,
              u.username,
              u.handle,
              u.location,
              u.workspace_id,
              w.name AS workspace_name,
              CASE WHEN u.last_active_at >= now() - interval '5 minutes' THEN true ELSE false END AS is_active
         FROM users u
         LEFT JOIN workspaces w ON u.workspace_id = w.id
        WHERE u.workspace_id = $1
        ORDER BY u.display_name`,
      [workspaceId]
    );
    res.json(rows.map((row) => ({
      ...mapUser(row),
      isActive: row.is_active,
    })));
  })
);

app.patch(
  '/api/users/:userId',
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!req.user) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const actorId = req.user.userId;
    const actorHandle = req.user.handle;
    const actorWorkspaceId = req.user.workspaceId;

    const targetUser = await fetchUser(userId);
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
  })
);

const listProjects = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { rows } = await query(
    `SELECT p.*, ps.last_value
       FROM projects p
       LEFT JOIN project_sequences ps ON p.id = ps.project_id
      WHERE p.workspace_id = $1
      ORDER BY p.name`,
    [workspaceId]
  );
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      ticketPrefix: row.ticket_prefix,
      description: row.description,
      nextNumber: (row.last_value || 0) + 1,
    }))
  );
});

const createProject = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { name, slug, ticketPrefix, description } = req.body;
  if (!name || !ticketPrefix) {
    return res.status(400).json({ message: 'name and ticketPrefix are required' });
  }
  const normalizedSlug = slugify(slug || name);
  if (!normalizedSlug) {
    return res.status(400).json({ message: 'Invalid slug' });
  }
  const prefix = String(ticketPrefix).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
  if (!prefix) {
    return res.status(400).json({ message: 'Invalid ticket prefix' });
  }

  const projectId = uuidv4();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO projects (id, name, slug, ticket_prefix, description, workspace_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [projectId, name.trim(), normalizedSlug, prefix, description || null, workspaceId]
    );
    await client.query('INSERT INTO project_sequences (project_id, last_value) VALUES ($1, 0) ON CONFLICT (project_id) DO NOTHING', [
      projectId,
    ]);
    await client.query('COMMIT');
    res.status(201).json({
      id: projectId,
      name: name.trim(),
      slug: normalizedSlug,
      ticketPrefix: prefix,
      description: description || null,
      nextNumber: 1,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Project slug or prefix already exists' });
    }
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/projects', listProjects);
app.get('/api/channels', listProjects);
app.post('/api/projects', createProject);
app.post('/api/channels', createProject);

const updateProject = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const projectId = req.params.projectId || req.params.channelId;
  const { name, slug, ticketPrefix, description } = req.body || {};

  const updates = [];
  const params = [];

  if (typeof name === 'string' && name.trim()) {
    params.push(name.trim());
    updates.push(`name = $${params.length}`);
  }

  if (typeof slug === 'string') {
    const normalizedSlug = slugify(slug || name || '');
    if (!normalizedSlug) {
      return res.status(400).json({ message: 'Invalid slug' });
    }
    params.push(normalizedSlug);
    updates.push(`slug = $${params.length}`);
  }

  if (typeof ticketPrefix === 'string') {
    const prefix = String(ticketPrefix).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    if (!prefix) {
      return res.status(400).json({ message: 'Invalid ticket prefix' });
    }
    params.push(prefix);
    updates.push(`ticket_prefix = $${params.length}`);
  }

  if (description !== undefined) {
    params.push(description && description.trim() ? description.trim() : null);
    updates.push(`description = $${params.length}`);
  }

  if (!updates.length) {
    return res.status(400).json({ message: 'Provide at least one field to update.' });
  }

  params.push(projectId);
  const projectParamIndex = params.length;
  params.push(workspaceId);
  const workspaceParamIndex = params.length;

  try {
    const { rows } = await query(
      `WITH updated AS (
         UPDATE projects
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${projectParamIndex}
            AND workspace_id = $${workspaceParamIndex}
          RETURNING id, name, slug, ticket_prefix, description
       )
       SELECT u.id,
              u.name,
              u.slug,
              u.ticket_prefix,
              u.description,
              ps.last_value
         FROM updated u
         LEFT JOIN project_sequences ps ON u.id = ps.project_id`,
      params
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const row = rows[0];
    res.json({
      id: row.id,
      name: row.name,
      slug: row.slug,
      ticketPrefix: row.ticket_prefix,
      description: row.description,
      nextNumber: (row.last_value || 0) + 1,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Project slug or prefix already exists' });
    }
    console.error('Project update failed', error);
    res.status(500).json({ message: 'Unable to update project.' });
  }
});

const deleteProject = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const projectId = req.params.projectId || req.params.channelId;
  const { rowCount } = await query('DELETE FROM projects WHERE id = $1 AND workspace_id = $2', [
    projectId,
    workspaceId,
  ]);
  if (!rowCount) {
    return res.status(404).json({ message: 'Project not found' });
  }
  res.status(204).send();
});

app.delete('/api/projects/:projectId', deleteProject);
app.delete('/api/channels/:channelId', deleteProject);
app.patch('/api/projects/:projectId', updateProject);
app.patch('/api/channels/:channelId', updateProject);

const projectReportsHandler = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const projectId = req.params.projectId || req.params.channelId;
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
        WHERE t.project_id = $1
          AND p.workspace_id = $2
          AND LOWER(tl.message) LIKE '%start%'
        ORDER BY tl.created_at DESC
        LIMIT 200`,
      [projectId, workspaceId]
  );
  res.json(
    rows.map((row) => ({
      id: row.id,
      message: row.message,
      createdAt: row.created_at,
      actorName: row.actor_name,
      ticketNumber: row.ticket_number,
      ticketTitle: row.title,
    }))
  );
});

app.get('/api/projects/:projectId/reports', projectReportsHandler);
app.get('/api/channels/:channelId/reports', projectReportsHandler);

app.get(
  '/api/reports',
  asyncHandler(async (req, res) => {
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
    res.json(
      rows.map((row) => ({
        id: row.id,
        message: row.message,
        createdAt: row.created_at,
        actorName: row.actor_name,
        ticketNumber: row.ticket_number,
        ticketTitle: row.title,
      }))
    );
  })
);

app.get(
  '/api/tickets',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const projectFilter = req.query.projectId || req.query.channelId;
    const { creatorId, assigneeId } = req.query;
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
  })
);

app.get(
  '/api/tickets/:ticketId',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const ticketRow = await fetchTicketForWorkspace(ticketId, workspaceId);
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
  })
);

app.post(
  '/api/tickets',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { title, description, creatorId, estimatedHours } = req.body;
    const projectId = req.body.projectId || req.body.channelId;
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

    const project = await fetchProject(projectId, workspaceId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    const creator = await fetchUser(creatorId);
    if (!creator || creator.workspace_id !== workspaceId) {
      return res.status(404).json({ message: 'Creator not found' });
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
          id, ticket_number, title, description, project_id, creator_id, estimated_hours, privacy, priority, workspace_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          ticketId,
          ticketNumber,
          title,
          description || '',
          projectId,
          creatorId,
          estimatedHours || null,
          privacy,
          priority,
          workspaceId,
        ]
      );

      await client.query(
        'INSERT INTO ticket_members (ticket_id, user_id, role) VALUES ($1, $2, $3)',
        [ticketId, creatorId, 'owner']
      );

      for (const memberId of additionalMemberIds) {
        const teammate = await fetchUser(memberId);
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
        await appendLog(client, ticketId, creatorId, `${teammate.display_name} was invited to the ticket`);
      }

      await appendLog(
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
  })
);

app.post(
  '/api/tickets/:ticketId/join',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const actorId = req.body.actorId || req.user?.userId;
    const targetUserId = req.body.userId || actorId;
    if (!actorId || !targetUserId) {
      return res.status(400).json({ message: 'actorId or user context is required' });
    }

    const ticket = await fetchTicketForWorkspace(ticketId, workspaceId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const [actor, targetUser] = await Promise.all([
      fetchUser(actorId),
      actorId === targetUserId ? Promise.resolve(null) : fetchUser(targetUserId),
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
        await appendLog(client, ticketId, actorId, `${actor.display_name} joined the ticket`);
      } else {
        await appendLog(
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
  })
);

app.post(
  '/api/tickets/:ticketId/settings',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const { actorId, status, priority, estimatedHours } = req.body;
    if (!actorId) {
      return res.status(400).json({ message: 'actorId is required' });
    }
    const [actor, ticket] = await Promise.all([
      fetchUser(actorId),
      fetchTicketForWorkspace(ticketId, workspaceId),
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

    if (Number.isFinite(estimatedHours)) {
      const hoursValue = Number(estimatedHours);
      updates.push(`estimated_hours = $${updates.length + 1}`);
      params.push(hoursValue >= 0 ? hoursValue : null);
      changeMessages.push(`${actor.display_name} updated estimate to ${hoursValue >= 0 ? hoursValue : 'unset'}`);
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
      for (const message of changeMessages) {
        await appendLog(client, ticketId, actorId, message);
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
  })
);

app.post(
  '/api/tickets/:ticketId/privacy',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const requestedPrivacy = (req.body.privacy || '').toLowerCase();
    const allowedPrivacy = ['public', 'private'];
    if (!allowedPrivacy.includes(requestedPrivacy)) {
      return res.status(400).json({ message: 'privacy must be public or private' });
    }
    const actorId = req.body.actorId || req.user?.userId;
    if (!actorId) {
      return res.status(400).json({ message: 'actorId is required' });
    }

    const [ticket, actor] = await Promise.all([
      fetchTicketForWorkspace(ticketId, workspaceId),
      fetchUser(actorId),
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
      await appendLog(
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
  })
);

app.post(
  '/api/tickets/:ticketId/assign',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const { assigneeId, actorId } = req.body;
    if (!assigneeId || !actorId) {
      return res.status(400).json({ message: 'assigneeId and actorId are required' });
    }

    const [ticket, assignee, actor] = await Promise.all([
      fetchTicketForWorkspace(ticketId, workspaceId),
      fetchUser(assigneeId),
      fetchUser(actorId),
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
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const { actorId } = req.body;
    const ticket = await fetchTicketForWorkspace(ticketId, workspaceId);
    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }
    const actor = actorId ? await fetchUser(actorId) : null;
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
  })
);

const parseMentions = (text = '') => {
  const matches = text.match(/@([a-zA-Z0-9_-]+)/g) || [];
  return matches.map((mention) => mention.replace('@', '').toLowerCase());
};

const resolveMentionRecipients = async (client, mentionHandles, authorId, workspaceId) => {
  if (!mentionHandles.length) return [];
  const usersToNotify = new Map();

  const uniqueHandles = [...new Set(mentionHandles)];
  for (const handle of uniqueHandles) {
    if (handle === 'cebu') {
      const { rows } = await client.query(
        'SELECT id, display_name FROM users WHERE workspace_id = $1 AND LOWER(location) LIKE $2',
        [workspaceId, '%cebu%']
      );
      rows.forEach((row) => {
        if (row.id !== authorId) {
          usersToNotify.set(row.id, row);
        }
      });
      continue;
    }
    const { rows } = await client.query(
      `SELECT id, display_name
         FROM users
        WHERE workspace_id = $1
          AND (LOWER(handle) = $2 OR LOWER(username) = $2)`,
      [workspaceId, handle]
    );
    if (rows.length && rows[0].id !== authorId) {
      usersToNotify.set(rows[0].id, rows[0]);
    }
  }

  return Array.from(usersToNotify.values());
};

app.post(
  '/api/tickets/:ticketId/messages',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const { userId, body } = req.body;
    if (!userId || !body) {
      return res.status(400).json({ message: 'userId and body are required' });
    }

    const [ticket, user] = await Promise.all([
      fetchTicketForWorkspace(ticketId, workspaceId),
      fetchUser(userId),
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

      await appendLog(client, ticketId, userId, `${user.display_name} posted an update`);

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
          await appendLog(client, ticketId, userId, `${user.display_name} started working on the ticket`);
        }
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
            await appendLog(
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
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const ticket = await fetchTicketForWorkspace(ticketId, workspaceId);
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
  })
);

app.get(
  '/api/tickets/:ticketId/logs',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { ticketId } = req.params;
    const ticket = await fetchTicketForWorkspace(ticketId, workspaceId);
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
  })
);

app.get(
  '/api/notifications',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const authUserId = req.user?.userId;
    if (!authUserId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
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
      [authUserId]
    );
    res.json(rows);
  })
);

app.post(
  '/api/notifications/:notificationId/read',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const authUserId = req.user?.userId;
    if (!authUserId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const { notificationId } = req.params;
    const result = await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [
      notificationId,
      authUserId,
    ]);
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ message: 'Notification updated' });
  })
);

app.post(
  '/api/dms',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { senderId, recipientId, body } = req.body;
    if (!senderId || !recipientId || !body) {
      return res.status(400).json({ message: 'senderId, recipientId and body are required' });
    }
    if (req.user?.userId && senderId !== req.user.userId) {
      return res.status(403).json({ message: 'You can only send messages as yourself.' });
    }
    const sender = await fetchUser(senderId);
    const recipient = await fetchUser(recipientId);
    if (
      !sender ||
      !recipient ||
      sender.workspace_id !== workspaceId ||
      recipient.workspace_id !== workspaceId
    ) {
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
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const authUserId = req.user?.userId;
    if (!authUserId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const { rows } = await query(
      `SELECT d.id, d.body, d.created_at AS "createdAt", d.sender_id AS "senderId", d.recipient_id AS "recipientId",
              su.display_name AS "senderName", ru.display_name AS "recipientName"
       FROM dms d
       LEFT JOIN users su ON su.id = d.sender_id
       LEFT JOIN users ru ON ru.id = d.recipient_id
       WHERE (d.sender_id = $1 OR d.recipient_id = $1)
         AND su.workspace_id = $2
         AND ru.workspace_id = $2
       ORDER BY d.created_at DESC LIMIT 50`,
      [authUserId, workspaceId]
    );
    res.json(rows);
  })
);

app.get(
  '/api/dashboard/overview',
  asyncHandler(async (req, res) => {
    const workspaceId = requireWorkspaceContext(req, res);
    if (!workspaceId) return;
    const { startDate, endDate } = req.query;
    const params = [workspaceId];
    const conditions = [];

    const parseDate = (value) => {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (start && end && start > end) {
      return res.status(400).json({ message: 'startDate must be before endDate' });
    }
    if (start) {
      params.push(start);
      conditions.push(`t.updated_at >= $${params.length}`);
    }
    if (end) {
      params.push(end);
      conditions.push(`t.updated_at <= $${params.length}`);
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
