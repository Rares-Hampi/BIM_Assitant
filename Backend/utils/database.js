/**
 * Database Connection Utility
 * Prisma Client singleton for PostgreSQL with Prisma 7 adapter
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Build DATABASE_URL - prioritize individual env vars (from Docker) over DATABASE_URL (from .env)
// This ensures Docker environment variables override .env file
let DATABASE_URL;

if (process.env.DB_HOST && process.env.DB_HOST !== 'localhost') {
  // Use Docker environment variables (from docker-compose)
  DATABASE_URL = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?schema=public`;
  console.log('Using Docker database configuration');
} else {
  // Use DATABASE_URL from .env (for local development)
  DATABASE_URL = process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'bim_user'}:${process.env.DB_PASSWORD || 'bim_password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'bim_assistant'}?schema=public`;
  console.log('Using local database configuration');
}

console.log('Database connection string:', DATABASE_URL.replace(/:[^:@]+@/, ':****@')); // Hide password

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
});

// Prisma adapter
const adapter = new PrismaPg(pool);

// Prisma Client instance
let prisma;

/**
 * Get Prisma Client instance (Singleton pattern)
 */
function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
    
    console.log('Prisma Client initialized with PostgreSQL adapter');
  }
  
  return prisma;
}

/**
 * Connect to PostgreSQL database
 */
async function connectDatabase() {
  try {
    const client = getPrismaClient();
    
    // Test connection
    await client.$connect();
    console.log('Connected to PostgreSQL successfully');
    console.log('Database:', process.env.DATABASE_URL?.split('@')[1] || 'localhost:5432');
    
    return client;
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error.message);
    throw error;
  }
}

/**
 * Disconnect from database
 */
async function disconnectDatabase() {
  try {
    if (prisma) {
      await prisma.$disconnect();
      console.log('Disconnected from PostgreSQL');
      prisma = null;
    }
  } catch (error) {
    console.error('Error disconnecting from PostgreSQL:', error.message);
    throw error;
  }
}

/**
 * Health check for database
 */
async function checkDatabaseHealth() {
  try {
    const client = getPrismaClient();
    // Test connection with a simple operation
    await client.$connect();
    
    console.log('Testing database health with pool query...');
    // Try a simple query using the pool directly for health check
    const result = await pool.query('SELECT 1 as health');
    
    console.log('Database health check passed:', result.rows[0]);
    
    return { 
      status: 'healthy', 
      message: 'PostgreSQL connection is healthy',
      latency: 0,
      details: {
        connected: true,
        result: result.rows[0]
      }
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    return { 
      status: 'unhealthy', 
      message: error.message || 'Database connection failed',
      error: error.toString()
    };
  }
}

module.exports = {
  getPrismaClient,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth
};
