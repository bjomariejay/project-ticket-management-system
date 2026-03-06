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

module.exports = { parseMentions, resolveMentionRecipients };
