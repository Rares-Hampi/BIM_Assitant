const express = require('express');
const router = express.Router();
const projectController = require('../controllers/project.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateProjectCreate, validateProjectUpdate, validateUUID } = require('../middleware/validation.middleware');
const { catchAsync } = require('../middleware/error.middleware');

// All routes require authentication
router.use(authenticate);

// GET /api/projects - Get all projects for current user
router.get('/', catchAsync(projectController.getAllProjects));

// POST /api/projects - Create new project
router.post('/', validateProjectCreate, catchAsync(projectController.createProject));

// GET /api/projects/:id - Get project by ID
router.get('/:id', validateUUID('id'), catchAsync(projectController.getProjectById));

// PUT /api/projects/:id - Update project
router.put('/:id', validateUUID('id'), validateProjectUpdate, catchAsync(projectController.updateProject));

// DELETE /api/projects/:id - Delete project
router.delete('/:id', validateUUID('id'), catchAsync(projectController.deleteProject));

// GET /api/projects/:id/files - Get all files in project
router.get('/:id/files', validateUUID('id'), catchAsync(projectController.getProjectFiles));

// GET /api/projects/:id/reports - Get all clash reports in project
router.get('/:id/reports', validateUUID('id'), catchAsync(projectController.getProjectReports));

module.exports = router;
