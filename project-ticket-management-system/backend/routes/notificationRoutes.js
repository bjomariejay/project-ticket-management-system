const express = require('express');
const {
  acknowledgeNotifications,
  getNotificationsStatus,
  listNotifications,
  markNotificationAsRead,
} = require('../controllers/notificationController');

const router = express.Router();

router.get('/', listNotifications);
router.get('/status', getNotificationsStatus);
router.post('/seen', acknowledgeNotifications);
router.post('/:notificationId/read', markNotificationAsRead);

module.exports = router;
