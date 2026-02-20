const express = require('express');
const router = express.Router();
const { checkDatabaseHealth } = require('../utils/database');
const { checkHealth: checkMinioHealth } = require('../services/storage.service');
const { checkHealth: checkRabbitMQHealth } = require('../services/queue.service');

// GET /api/health - Basic health check
router.get('/', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    const isHealthy = dbHealth.status === 'healthy';
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbHealth
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /api/health/detailed - Detailed health check (all services)
router.get('/detailed', async (req, res) => {
  try {
    const healthChecks = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {}
    };
    
    // Check Database
    try {
      const dbHealth = await checkDatabaseHealth();
      healthChecks.services.database = dbHealth;
    } catch (error) {
      healthChecks.services.database = {
        status: 'unhealthy',
        error: error.message
      };
    }
    
    // Check RabbitMQ connection
    try {
      const rabbitHealth = await checkRabbitMQHealth();
      healthChecks.services.rabbitmq = rabbitHealth;
    } catch (error) {
      healthChecks.services.rabbitmq = {
        status: 'unhealthy',
        error: error.message
      };
    }
    
    // Check MinIO connection
    try {
      const minioHealth = await checkMinioHealth();
      healthChecks.services.minio = minioHealth;
    } catch (error) {
      healthChecks.services.minio = {
        status: 'unhealthy',
        error: error.message
      };
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    healthChecks.memory = {
      rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`
    };
    
    // Check CPU usage
    const cpuUsage = process.cpuUsage();
    healthChecks.cpu = {
      user: `${(cpuUsage.user / 1000000).toFixed(2)} seconds`,
      system: `${(cpuUsage.system / 1000000).toFixed(2)} seconds`
    };
    
    // Overall status
    const allHealthy = Object.values(healthChecks.services).every(
      service => service.status === 'healthy'
    );
    
    healthChecks.status = allHealthy ? 'healthy' : 'unhealthy';
    
    res.status(allHealthy ? 200 : 503).json(healthChecks);
    
  } catch (error) {
    console.error('Detailed health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /api/health/ready - Readiness probe (for Kubernetes/Docker)
router.get('/ready', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    
    if (dbHealth.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not ready'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// GET /api/health/live - Liveness probe (for Kubernetes/Docker)
router.get('/live', (req, res) => {
  // Simple check - if server can respond, it's alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
