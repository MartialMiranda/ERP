/**
 * Verify2FA Command - Handles verification of two-factor authentication setup
 */
const speakeasy = require('speakeasy');
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
 * Execute the verify2FA command
 * @param {Object} data - Data for verifying 2FA (userId, code, method)
 * @returns {Promise<Object>} - Verification result
 */
async function execute(data) {
  try {
    logger.info(`Attempting to verify 2FA for user ID: ${data.userId}, method: ${data.method}`);
    
    // Log for debugging
    logger.info(`Verification data: ${JSON.stringify({
      userId: data.userId,
      method: data.method,
      codeLength: data.code ? data.code.length : 0
    })}`);
    
    // Verify user exists and has 2FA method set
    const user = await db.oneOrNone(
      'SELECT * FROM usuarios WHERE id = $1 AND metodo_2fa = $2',
      [data.userId, data.method]
    );
    
    if (!user) {
      logger.warn(`User not found or 2FA method not set: ID=${data.userId}, method=${data.method}`);
      throw new Error('User not found or 2FA method not set');
    }
    
    logger.info(`User found with ID: ${user.id}, method: ${user.metodo_2fa}`);
    
    let isValid = false;
    
    // Verify based on 2FA method
    if (data.method === 'app') {
      // Verify TOTP code for app-based 2FA
      isValid = speakeasy.totp.verify({
        secret: user.secreto_2fa,
        encoding: 'base32',
        token: data.code,
        window: 2 // Allow 2 periods before and after for clock drift (increased tolerance)
      });
      
      logger.info(`App-based verification result: ${isValid ? 'valid' : 'invalid'}`);
      
    } else if (data.method === 'email') {
      // Log query for debugging
      logger.info(`Querying for email verification code: user_id=${user.id}, code=${data.code}`);
      
      // Verify email-based 2FA code
      const validCode = await db.oneOrNone(
        'SELECT * FROM autenticacion_2fa WHERE usuario_id = $1 AND codigo_2fa = $2 AND expira_en > NOW()',
        [user.id, data.code]
      );
      
      isValid = !!validCode;
      
      logger.info(`Email-based verification result: ${isValid ? 'valid' : 'invalid'}`);
      
      // If code is valid, delete it to prevent reuse
      if (isValid && validCode) {
        await db.none('DELETE FROM autenticacion_2fa WHERE id = $1', [validCode.id]);
        logger.info(`Used 2FA code deleted: ID=${validCode.id}`);
      }
    } else {
      logger.error(`Invalid 2FA method: ${data.method}`);
      throw new Error('Invalid 2FA method');
    }
    
    if (!isValid) {
      logger.warn(`Invalid verification code for user ID: ${user.id}`);
      throw new Error('Invalid verification code');
    }
    
    // Enable 2FA for the user
    await db.none(
      'UPDATE usuarios SET tiene_2fa = TRUE WHERE id = $1',
      [user.id]
    );
    
    logger.info(`2FA enabled successfully for user ID: ${user.id}`);
    
    return {
      verified: true,
      message: '2FA has been successfully enabled'
    };
  } catch (error) {
    logger.error(`Error in verify2FA command: ${error.message}`);
    
    // Add stack trace for debugging
    if (process.env.NODE_ENV !== 'production') {
      logger.error(`Stack trace: ${error.stack}`);
    }
    
    throw error;
  }
}

module.exports = { execute };