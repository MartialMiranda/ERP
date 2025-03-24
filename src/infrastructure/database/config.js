/**
 * Database configuration integration for migrations/seeds and application.
 * This follows CQRS principles by separating the configuration for different database operations.
 */
const knex = require('knex');
const knexConfig = require('../../../knexfile');
const pgp = require('pg-promise')();
const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Environment-based configuration
const environment = process.env.NODE_ENV || 'development';

// Knex instance (for migrations and query building)
const knexInstance = knex(knexConfig[environment]);

// Pg-promise instance (for application queries)
const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'erp_proyecto',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 30 // Maximum number of connections in the pool
};

// Create the database instance
const pgDb = pgp(connection);

// Test the connection
pgDb.connect()
  .then(obj => {
    logger.info('Database connection established successfully');
    obj.done(); // Release the connection
  })
  .catch(error => {
    logger.error('Error connecting to database:', error);
  });

module.exports = {
  knex: knexInstance,
  pgDb,
  logger
};
