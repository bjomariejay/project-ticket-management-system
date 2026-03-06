const express = require('express');
const { listDirectMessages, sendDirectMessage } = require('../controllers/dmController');

const router = express.Router();

router.post('/', sendDirectMessage);
router.get('/', listDirectMessages);

module.exports = router;
