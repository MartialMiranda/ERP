/**
 * Database reset script
 * This script drops the database and recreates it with all migrations and seeders
 */
require('dotenv').config();
const { Pool } = require('pg');
const { initDatabase } = require('./initDatabase');
const { logger } = require('./config');

// Connection for admin operations (connects to postgres)
const adminPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'postgres', // Connect to postgres database
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

/**
 * Drop database if it exists
 */
async function dropDatabase() {
  const dbName = process.env.DB_NAME || 'erp_proyecto';
  
  try {
    // Disconnect all active connections to the database
    await adminPool.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${dbName}'
      AND pid <> pg_backend_pid();
    `);
    
    // Drop the database
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    logger.info(`Database ${dbName} dropped successfully`);
    return true;
  } catch (error) {
    logger.error('Error dropping database:', error);
    throw error;
  } finally {
    // Close the admin connection
    await adminPool.end();
  }
}

/**
 * Reset the database: drop, create, and initialize with migrations and seeds
 */
async function resetDatabase() {
  try {
    await dropDatabase();
    await initDatabase();
    logger.info('Database reset completed successfully');
  } catch (error) {
    logger.error('Database reset failed:', error);
    process.exit(1);
  }
}

// Run the reset if this script is executed directly
if (require.main === module) {
  resetDatabase();
}

module.exports = {
  resetDatabase,
  dropDatabase
};
