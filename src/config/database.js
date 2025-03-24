/**
 * Database configuration 
 * This file is now importing the centralized database configuration from infrastructure
 * to maintain consistency across the application.
 */

// Import database configuration from infrastructure layer
const { pgDb, knex, logger } = require('../infrastructure/database/config');

// Export the database instance and knex instance to be used across the application
module.exports = {
  db: pgDb,     // For pg-promise queries (read operations in CQRS)
  knex,         // For knex queries (write operations in CQRS)
  logger
};