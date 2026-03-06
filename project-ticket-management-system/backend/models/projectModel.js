const { query } = require('../config/database');

const listProjectsForWorkspace = async (workspaceId) => {
  const { rows } = await query(
    `SELECT p.*, ps.last_value
       FROM projects p
       LEFT JOIN project_sequences ps ON p.id = ps.project_id
      WHERE p.workspace_id = $1
      ORDER BY p.name`,
    [workspaceId]
  );
  return rows;
};

const getProjectById = async (projectId, workspaceId) => {
  const { rows } = await query('SELECT * FROM projects WHERE id = $1 AND workspace_id = $2', [
    projectId,
    workspaceId,
  ]);
  return rows[0];
};

module.exports = { getProjectById, listProjectsForWorkspace };
