const express = require('express');
const {
  createProject,
  deleteProject,
  getProjectReports,
  listProjects,
  updateProject,
} = require('../controllers/projectController');

const createProjectRouter = (paramName = 'projectId') => {
  const router = express.Router();
  router.get('/', listProjects);
  router.post('/', createProject);
  router.patch(`/:${paramName}`, updateProject);
  router.delete(`/:${paramName}`, deleteProject);
  router.get(`/:${paramName}/reports`, getProjectReports);
  return router;
};

module.exports = { createProjectRouter };
