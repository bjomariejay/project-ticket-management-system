# Development Guide

## Creating a Project
1. Click the `+ Project` button in the Projects panel. This triggers `openCreateProject()` which sets `showCreateProject` to true and reveals the Create Project modal.
2. Complete the form fields (Name, Slug, Ticket Prefix, Description). Each input is bound through `updateCreateProjectField` so state updates immediately while you type.
3. Press the `Create project` button. The submit handler (`handleProjectSubmit`) calls `createProject()`, which clamps/slugifies the form values, logs the payload for debugging, sends it to the API with `apiClient.createProject`, then reloads projects/tickets once the server responds.

### Backend flow for `createProject()`
Once the API call above reaches the backend (`backend/src/server.js`), the shared `createProject` handler for `/api/projects` and `/api/channels` runs through these steps:
1. **Workspace guard** – `requireWorkspaceContext(req, res)` verifies the request is scoped to a workspace before any inserts occur.
2. **Input normalization** – destructure `name`, `slug`, `ticketPrefix`, `description` from `req.body`, require `name` and `ticketPrefix`, slugify the slug/name, and sanitize the prefix (uppercase alphanumeric, max 10 chars).
3. **Transactional insert** – open a client with `pool.connect()`, `BEGIN`, insert the project record, and initialize the matching row in `project_sequences` with `last_value = 0` so new tickets start at `1`.
4. **Response & error handling** – `COMMIT` and return the created project payload; on uniqueness violations (`23505`) roll back and respond with `409`.

Key portion of the handler for reference:

```js
const createProject = asyncHandler(async (req, res) => {
  const workspaceId = requireWorkspaceContext(req, res);
  if (!workspaceId) return;
  const { name, slug, ticketPrefix, description } = req.body;
  const normalizedSlug = slugify(slug || name);
  const prefix = String(ticketPrefix).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
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
```

## Creating a Ticket
1. Click the `+ Ticket` button beside the Projects header. This calls `openCreateTicket()` and shows the Create Ticket modal.
2. Fill in the ticket details (Title, Description, Project, Estimated hours, Priority, Privacy). Inputs use `updateCreateTicketField` to keep the draft in sync.
3. Click `Create ticket`. `handleTicketSubmit()` invokes `createTicket()`, posting the new ticket to the API. On success the ticket list refreshes and the modal closes.
