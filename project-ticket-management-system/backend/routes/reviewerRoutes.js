const express = require('express');
const { getReviewerReports } = require('../controllers/reportController');

const router = express.Router();

router.get('/:reviewerId/reports', getReviewerReports);

module.exports = router;
