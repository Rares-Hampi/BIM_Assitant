const app = require('./server');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

// Import database connection
const { connectDatabase, disconnectDatabase } = require('./utils/database');

// TODO: Import RabbitMQ connection when rabbitmq/connection.js is created
// const { connectRabbitMQ } = require('./rabbitmq/connection');

// TODO: Import MinIO initialization when services/storageService.js is created
// const { initializeBuckets } = require('./services/storageService');

/**
 * Initialize all services and start the server
 */
async function startServer() {
  try {
    console.log('Starting BIM Assistant Server...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Connect to PostgreSQL
    console.log('Connecting to PostgreSQL...');
    await connectDatabase();
    console.log('PostgreSQL connected successfully');
    
    // TODO: Connect to RabbitMQ
    // console.log('Connecting to RabbitMQ...');
    // await connectRabbitMQ();
    // console.log('RabbitMQ connected successfully');
    
    // TODO: Initialize MinIO buckets
    // console.log('Initializing MinIO buckets...');
    // await initializeBuckets();
    // console.log('MinIO buckets initialized successfully');
    
    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('===========================================');
      console.log('BIM Assistant API Server');
      console.log('===========================================');
      console.log(`Server running on port: ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log('===========================================');
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await disconnectDatabase();
  // TODO: Close RabbitMQ connections
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  await disconnectDatabase();
  // TODO: Close RabbitMQ connections
  process.exit(0);
});

// Start the server
startServer();
