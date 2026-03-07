const express = require('express');
const { authenticate } = require('../middleware/authenticate');
const { listPublicUsers } = require('../controllers/userController');
const authRoutes = require('./authRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const dmRoutes = require('./dmRoutes');
const healthRoutes = require('./healthRoutes');
const notificationRoutes = require('./notificationRoutes');
const { createProjectRouter } = require('./projectRoutes');
const reportRoutes = require('./reportRoutes');
const reviewerRoutes = require('./reviewerRoutes');
const ticketRoutes = require('./ticketRoutes');
const userRoutes = require('./userRoutes');
const workspaceRoutes = require('./workspaceRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/auth', authRoutes);
router.get('/showUsers', listPublicUsers);

router.use(authenticate);
router.use('/users', userRoutes);
router.use('/projects', createProjectRouter('projectId'));
router.use('/channels', createProjectRouter('channelId'));
router.use('/reports', reportRoutes);
router.use('/reviewers', reviewerRoutes);
router.use('/tickets', ticketRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dms', dmRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
