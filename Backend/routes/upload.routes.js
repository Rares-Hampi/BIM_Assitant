const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadMultiple, handleUploadError, validateFiles, validateProjectId } = require('../middleware/upload.middleware');
const { validateUUID } = require('../middleware/validation.middleware');
const { catchAsync } = require('../middleware/error.middleware');

// All routes require authentication
router.use(authenticate);

// POST /api/upload - Upload IFC files
router.post('/',
  uploadMultiple,
  handleUploadError,
  validateFiles,
  validateProjectId,
  catchAsync(uploadController.uploadFiles)
);

// GET /api/upload/status/:jobId - Get upload/conversion status
router.get('/status/:jobId', catchAsync(uploadController.getStatus));

// GET /api/upload/files/:fileId - Get specific file status
router.get('/files/:fileId', validateUUID('fileId'), catchAsync(uploadController.getFileStatus));

// DELETE /api/upload/files/:fileId - Delete uploaded file
router.delete('/files/:fileId', validateUUID('fileId'), catchAsync(uploadController.deleteFile));

module.exports = router;
