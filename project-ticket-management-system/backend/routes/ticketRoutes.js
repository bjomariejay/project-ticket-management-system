const express = require('express');
const {
  archiveTicket,
  assignTicket,
  createTicket,
  getTicket,
  getTicketLogs,
  getTicketMessages,
  joinTicket,
  listTickets,
  postTicketMessage,
  updateReviewer,
  updateTicketPrivacy,
  updateTicketSettings,
} = require('../controllers/ticketController');

const router = express.Router();

router.get('/', listTickets);
router.post('/', createTicket);
router.get('/:ticketId', getTicket);
router.post('/:ticketId/join', joinTicket);
router.post('/:ticketId/settings', updateTicketSettings);
router.post('/:ticketId/privacy', updateTicketPrivacy);
router.post('/:ticketId/assign', assignTicket);
router.post('/:ticketId/reviewer', updateReviewer);
router.post('/:ticketId/archive', archiveTicket);
router.post('/:ticketId/messages', postTicketMessage);
router.get('/:ticketId/messages', getTicketMessages);
router.get('/:ticketId/logs', getTicketLogs);

module.exports = router;
