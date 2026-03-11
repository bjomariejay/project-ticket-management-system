const express = require('express');
const { getOverview, getUserWorkLog } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/overview', getOverview);
router.get('/user-work-log', getUserWorkLog);

module.exports = router;
