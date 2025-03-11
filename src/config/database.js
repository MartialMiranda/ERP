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

// Database connection configuration
const connection = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 30 // Maximum number of connections in the pool
};

// Create the database instance
const db = pgp(connection);

// Test the connection
db.connect()
  .then(obj => {
    logger.info('Database connection established successfully');
    obj.done(); // Release the connection
  })
  .catch(error => {
    logger.error('Error connecting to database:', error);
  });

module.exports = db;