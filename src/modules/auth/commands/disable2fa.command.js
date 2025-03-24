/**
 * Disable2FA Command - Handles disabling two-factor authentication for users
 */
const { db } = require('../../../config/database');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

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
 * Execute the disable2FA command
 * @param {Object} data - Data for disabling 2FA (userId)
 * @returns {Promise<Object>} - Result of disabling 2FA
 */
async function execute(data) {
  try {
    // Verify user exists and has 2FA enabled
    const user = await db.oneOrNone(
      'SELECT * FROM usuarios WHERE id = $1 AND tiene_2fa = TRUE',
      [data.userId]
    );
    
    if (!user) {
      throw new Error('User not found or 2FA not enabled');
    }
    
    // Disable 2FA for the user
    await db.none(
      'UPDATE usuarios SET tiene_2fa = FALSE, secreto_2fa = NULL WHERE id = $1',
      [user.id]
    );
    
    // Clean up any email-based 2FA codes if they exist
    if (user.metodo_2fa === 'email') {
      await db.none('DELETE FROM autenticacion_2fa WHERE usuario_id = $1', [user.id]);
    }
    
    logger.info(`2FA disabled successfully for user ID: ${user.id}`);
    
    return {
      disabled: true,
      message: '2FA has been successfully disabled'
    };
  } catch (error) {
    logger.error(`Error in disable2FA command: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };