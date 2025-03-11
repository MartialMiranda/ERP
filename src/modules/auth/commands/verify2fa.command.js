/**
 * Verify2FA Command - Handles verification of two-factor authentication setup
 */
const speakeasy = require('speakeasy');
const db = require('../../../config/database');
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
 * Execute the verify2FA command
 * @param {Object} data - Data for verifying 2FA (userId, code, method)
 * @returns {Promise<Object>} - Verification result
 */
async function execute(data) {
  try {
    // Verify user exists and has 2FA method set
    const user = await db.oneOrNone(
      'SELECT * FROM usuarios WHERE id = $1 AND metodo_2fa = $2',
      [data.userId, data.method]
    );
    
    if (!user) {
      throw new Error('User not found or 2FA method not set');
    }
    
    let isValid = false;
    
    // Verify based on 2FA method
    if (data.method === 'app') {
      // Verify TOTP code for app-based 2FA
      isValid = speakeasy.totp.verify({
        secret: user.secreto_2fa,
        encoding: 'base32',
        token: data.code,
        window: 1 // Allow 1 period before and after for clock drift
      });
    } else if (data.method === 'email') {
      // Verify email-based 2FA code
      const validCode = await db.oneOrNone(
        'SELECT * FROM autenticacion_2fa WHERE usuario_id = $1 AND codigo_2fa = $2 AND expira_en > NOW()',
        [user.id, data.code]
      );
      
      isValid = !!validCode;
      
      // If code is valid, delete it to prevent reuse
      if (isValid) {
        await db.none('DELETE FROM autenticacion_2fa WHERE id = $1', [validCode.id]);
      }
    } else {
      throw new Error('Invalid 2FA method');
    }
    
    if (!isValid) {
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
    throw error;
  }
}

module.exports = { execute };