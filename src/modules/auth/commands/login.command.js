/**
 * Login Command - Handles user login logic following CQRS pattern
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../../config/database');
const speakeasy = require('speakeasy');
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
 * Generate JWT tokens for authenticated user
 * @param {Object} user - User object
 * @returns {Object} - Access and refresh tokens
 */
const generateTokens = (user) => {
  // Create access token
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  // Create refresh token
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
};

/**
 * Execute the login command
 * @param {Object} credentials - User credentials (email, password)
 * @returns {Promise<Object>} - User data and tokens if authentication is successful
 */
async function execute(credentials) {
  try {
    // Find user by email
    const user = await db.oneOrNone('SELECT * FROM usuarios WHERE email = $1', [credentials.email]);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(credentials.password, user.contrasena);
    
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }
    
    // Check if 2FA is enabled for the user
    if (user.tiene_2fa) {
      // If 2FA code is provided, verify it
      if (credentials.code_2fa) {
        let isValid = false;
        
        if (user.metodo_2fa === 'app') {
          // Verify TOTP code for app-based 2FA
          isValid = speakeasy.totp.verify({
            secret: user.secreto_2fa,
            encoding: 'base32',
            token: credentials.code_2fa,
            window: 1 // Allow 1 period before and after for clock drift
          });
        } else if (user.metodo_2fa === 'email') {
          // Verify email-based 2FA code
          const validCode = await db.oneOrNone(
            'SELECT * FROM autenticacion_2fa WHERE usuario_id = $1 AND codigo_2fa = $2 AND expira_en > NOW()',
            [user.id, credentials.code_2fa]
          );
          
          isValid = !!validCode;
          
          // If code is valid, delete it to prevent reuse
          if (isValid) {
            await db.none('DELETE FROM autenticacion_2fa WHERE id = $1', [validCode.id]);
          }
        }
        
        if (!isValid) {
          throw new Error('Invalid 2FA code');
        }
        
        // Generate tokens after successful 2FA verification
        const tokens = generateTokens(user);
        
        // Return user data and tokens
        return {
          user: {
            id: user.id,
            nombre: user.nombre,
            email: user.email,
            rol: user.rol,
            tiene_2fa: user.tiene_2fa
          },
          tokens
        };
      } else {
        // 2FA is required but no code provided
        return {
          requires2FA: true,
          metodo_2fa: user.metodo_2fa,
          userId: user.id
        };
      }
    } else {
      // 2FA not enabled, generate tokens directly
      const tokens = generateTokens(user);
      
      // Return user data and tokens
      return {
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          rol: user.rol,
          tiene_2fa: user.tiene_2fa
        },
        tokens
      };
    }
  } catch (error) {
    logger.error(`Error in login command: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };