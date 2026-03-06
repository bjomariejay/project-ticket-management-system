const { v4: uuidv4 } = require('uuid');
const { pool, query } = require('../config/database');
const { getProjectById, listProjectsForWorkspace } = require('../models/projectModel');
const { requireWorkspaceContext } = require('../middleware/context');
const { asyncHandler } = require('../utils/asyncHandler');
const { slugify } = require('../utils/string');

const resolveProjectId = (req) => req.params.projectId || req.params.channelId;

const listProjects = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const rows = await listProjectsForWorkspace(workspaceId);
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
  const { name, slug, ticketPrefix, description } = req.body || {};
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
    await client.query(
      'INSERT INTO project_sequences (project_id, last_value) VALUES ($1, 0) ON CONFLICT (project_id) DO NOTHING',
      [projectId]
    );
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

const updateProject = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const projectId = resolveProjectId(req);
  const { name, slug, ticketPrefix, description } = req.body || {};

  const existing = await getProjectById(projectId, workspaceId);
  if (!existing) {
    return res.status(404).json({ message: 'Project not found' });
  }

  const trimmedName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
  if (!trimmedName) {
    return res.status(400).json({ message: 'Project name is required' });
  }

  let normalizedSlug = existing.slug;
  if (typeof slug === 'string') {
    const slugInput = slug.trim();
    normalizedSlug = slugInput ? slugify(slugInput) : existing.slug;
    if (!normalizedSlug) {
      return res.status(400).json({ message: 'Invalid slug' });
    }
  }

  let sanitizedPrefix = existing.ticket_prefix;
  if (typeof ticketPrefix === 'string') {
    const prefixInput = ticketPrefix.trim();
    sanitizedPrefix = prefixInput
      ? prefixInput.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10)
      : existing.ticket_prefix;
  }
  if (!sanitizedPrefix) {
    return res.status(400).json({ message: 'Invalid ticket prefix' });
  }

  let nextDescription = existing.description;
  if (description !== undefined) {
    if (description === null) {
      nextDescription = null;
    } else if (typeof description === 'string') {
      const trimmedDescription = description.trim();
      nextDescription = trimmedDescription || null;
    }
  }

  try {
    const { rows } = await query(
      `WITH updated AS (
         UPDATE projects
            SET name = $1,
                slug = $2,
                ticket_prefix = $3,
                description = $4
          WHERE id = $5
            AND workspace_id = $6
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
      [
        trimmedName,
        normalizedSlug,
        sanitizedPrefix,
        nextDescription,
        projectId,
        workspaceId,
      ]
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
  const projectId = resolveProjectId(req);
  const { rowCount } = await query('DELETE FROM projects WHERE id = $1 AND workspace_id = $2', [
    projectId,
    workspaceId,
  ]);
  if (!rowCount) {
    return res.status(404).json({ message: 'Project not found' });
  }
  res.status(204).send();
});

const getProjectReports = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const projectId = resolveProjectId(req);
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

module.exports = {
  createProject,
  deleteProject,
  getProjectReports,
  listProjects,
  updateProject,
};
