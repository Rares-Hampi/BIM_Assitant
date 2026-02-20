const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateClashReportGeneration, validateUUID, validatePagination } = require('../middleware/validation.middleware');
const { catchAsync } = require('../middleware/error.middleware');

// All routes require authentication
router.use(authenticate);

// POST /api/reports/generate - Generate clash detection report
router.post('/generate', validateClashReportGeneration, catchAsync(reportController.generateReport));

// GET /api/reports/project/:projectId - Get all reports for a project
router.get('/project/:projectId', validateUUID('projectId'), catchAsync(reportController.getProjectReports));

// GET /api/reports/:reportId - Get specific report details
router.get('/:reportId', validateUUID('reportId'), catchAsync(reportController.getReportById));

// GET /api/reports/:reportId/download - Download report as JSON/PDF
router.get('/:reportId/download', validateUUID('reportId'), catchAsync(reportController.downloadReport));

// DELETE /api/reports/:reportId - Delete clash report
router.delete('/:reportId', validateUUID('reportId'), catchAsync(reportController.deleteReport));

// GET /api/reports/:reportId/clashes - Get paginated clashes from report
router.get('/:reportId/clashes', validateUUID('reportId'), validatePagination, catchAsync(reportController.getReportClashes));

// GET /api/reports/:reportId/statistics - Get report statistics
router.get('/:reportId/statistics', validateUUID('reportId'), catchAsync(reportController.getReportStatistics));

module.exports = router;
