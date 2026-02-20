/**
 * Database Connection Utility
 * Prisma Client singleton for PostgreSQL
 */

const { PrismaClient } = require('@prisma/client');

// Prisma Client instance
let prisma;

/**
 * Get Prisma Client instance (Singleton pattern)
 */
function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
    
    console.log('Prisma Client initialized');
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
    await client.$queryRaw`SELECT 1`;
    return { status: 'healthy', message: 'PostgreSQL connection is healthy' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
}

module.exports = {
  getPrismaClient,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth
};
