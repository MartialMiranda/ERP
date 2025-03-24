/**
 * Database initialization script
 * This script creates the database and runs all migrations and seeders
 * It follows CQRS by separating database initialization (command) from normal operations (queries)
 */
require('dotenv').config();
const { exec } = require('child_process');
const { Pool } = require('pg');
const { logger } = require('./config');

// Connection for creating the database (connects to postgres)
const adminPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'postgres', // Connect to postgres database to create our app database
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

/**
 * Create database if it doesn't exist
 */
async function createDatabase() {
  const dbName = process.env.DB_NAME || 'erp_proyecto';
  
  try {
    // Check if database exists
    const checkResult = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, 
      [dbName]
    );
    
    if (checkResult.rows.length === 0) {
      logger.info(`Database ${dbName} does not exist. Creating...`);
      
      // Create the database
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      logger.info(`Database ${dbName} created successfully`);
      return true;
    } else {
      logger.info(`Database ${dbName} already exists`);
      return false;
    }
  } catch (error) {
    logger.error('Error in database creation:', error);
    throw error;
  } finally {
    // Close the admin connection
    await adminPool.end();
  }
}

/**
 * Run knex migrations and seeds
 */
function runMigrationsAndSeeds() {
  return new Promise((resolve, reject) => {
    logger.info('Running migrations...');
    
    // Run migrations
    exec('npm run migrate', (error, stdout, stderr) => {
      if (error) {
        logger.error(`Migration error: ${error.message}`);
        return reject(error);
      }
      
      logger.info('Migrations completed successfully');
      logger.info(stdout);
      
      // Run seeds
      logger.info('Running seeds...');
      exec('npm run seed', (seedError, seedStdout, seedStderr) => {
        if (seedError) {
          logger.error(`Seed error: ${seedError.message}`);
          return reject(seedError);
        }
        
        logger.info('Seeds completed successfully');
        logger.info(seedStdout);
        resolve();
      });
    });
  });
}

/**
 * Initialize the database: create it if needed and run migrations and seeds
 */
async function initDatabase() {
  try {
    await createDatabase();
    await runMigrationsAndSeeds();
    logger.info('Database initialization completed successfully');
  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initDatabase();
}

module.exports = {
  initDatabase,
  createDatabase,
  runMigrationsAndSeeds
};
