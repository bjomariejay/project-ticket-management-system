const express = require('express');
const { listWorkspaces } = require('../controllers/workspaceController');

const router = express.Router();

router.get('/', listWorkspaces);

module.exports = router;
