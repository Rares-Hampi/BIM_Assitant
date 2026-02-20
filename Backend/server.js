/**
 * BIM Assistant - Main Express Server
 * Handles API routes and middleware setup
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { errorHandler, notFound } = require('./middleware/error.middleware');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Import routes
const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');
const uploadRoutes = require('./routes/upload.routes');
const progressRoutes = require('./routes/progress.routes');
const reportRoutes = require('./routes/report.routes');
const healthRoutes = require('./routes/health.routes');


// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/health', healthRoutes);


// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'BIM Assistant API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      projects: '/api/projects',
      upload: '/api/upload',
      reports: '/api/reports',
      progress: '/api/progress'
    }
  });
});

// 404 handler 
app.use(notFound);

// Global error handler 
app.use(errorHandler);

module.exports = app;
