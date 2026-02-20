const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validateRegistration, validateLogin } = require('../middleware/validation.middleware');
const { catchAsync } = require('../middleware/error.middleware');

// POST /api/auth/register - Register new user
router.post('/register', validateRegistration, catchAsync(authController.register));

// POST /api/auth/login - Login user
router.post('/login', validateLogin, catchAsync(authController.login));

// POST /api/auth/logout - Logout user
router.post('/logout', catchAsync(authController.logout));

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', catchAsync(authController.refreshAccessToken));

// GET /api/auth/me - Get current user info (protected)
router.get('/me', authenticate, catchAsync(authController.getCurrentUser));

module.exports = router;
