const express = require('express');
const router = express.Router();
const progressController = require('../controllers/progress.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateUUID } = require('../middleware/validation.middleware');

// All routes require authentication
router.use(authenticate);

// GET /api/progress/:fileId - Server-Sent Events for file conversion progress
router.get('/:fileId', validateUUID('fileId'), progressController.streamFileProgress);

// GET /api/progress/batch/:projectId - SSE for multiple files in a project
router.get('/batch/:projectId', validateUUID('projectId'), progressController.streamBatchProgress);

module.exports = router;
