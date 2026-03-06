const express = require('express');
const { heartbeat, listUsers, markInactive, updateUser } = require('../controllers/userController');

const router = express.Router();

router.post('/me/heartbeat', heartbeat);
router.post('/me/inactive', markInactive);
router.get('/', listUsers);
router.patch('/:userId', updateUser);

module.exports = router;
