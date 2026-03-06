const express = require('express');
const {
  getLatestReportState,
  getWorkspaceReports,
  markReportsSeen,
} = require('../controllers/reportController');

const router = express.Router();

router.get('/', getWorkspaceReports);
router.get('/latest', getLatestReportState);
router.post('/seen', markReportsSeen);

module.exports = router;
