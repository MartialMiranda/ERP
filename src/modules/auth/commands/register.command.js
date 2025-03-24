/**
 * Register Command - Handles user registration logic following CQRS pattern
 */
const bcrypt = require('bcrypt');
const { db } = require('../../../config/database');
const { v4: uuidv4 } = require('uuid');
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

/**
 * Execute the register command
 * @param {Object} userData - User data for registration
 * @returns {Promise<Object>} - Newly created user object (without password)
 */
async function execute(userData) {
  try {
    // Validate if user already exists
    const existingUser = await db.oneOrNone('SELECT * FROM usuarios WHERE email = $1', [userData.email]);
    
    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);
    
    // Generate UUID for the new user
    const userId = uuidv4();
    
    // Create new user
    const newUser = await db.one(
      `INSERT INTO usuarios 
      (id, nombre, email, contrasena, rol, tiene_2fa) 
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING id, nombre, email, rol, tiene_2fa, creado_en`,
      [
        userId,
        userData.nombre,
        userData.email,
        hashedPassword,
        userData.rol || 'usuario', // Default role is 'usuario'
        false // 2FA is disabled by default
      ]
    );
    
    logger.info(`User registered successfully: ${newUser.email}`);
    return newUser;
  } catch (error) {
    logger.error(`Error in register command: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };