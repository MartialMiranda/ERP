/**
 * Login Command - Handles user login logic following CQRS pattern
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { db } = require('../../../config/database');
const nodemailer = require('nodemailer');
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

  logger.info(`Generated tokens for user ID: ${user.id}`);
  return { accessToken, refreshToken };
};

/**
 * Execute the login command
 * @param {Object} credentials - User credentials (email, password)
 * @returns {Promise<Object>} - User data and tokens if authentication is successful
 */
async function execute(credentials) {
  try {
    logger.info(`Login attempt for email: ${credentials.email}`);
    
    // Find user by email
    const user = await db.oneOrNone('SELECT * FROM usuarios WHERE email = $1', [credentials.email]);
    
    if (!user) {
      logger.warn(`Login failed - user not found: ${credentials.email}`);
      throw new Error('Invalid credentials');
    }
    
    logger.info(`User found with ID: ${user.id}, verifying password`);
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(credentials.password, user.contrasena);
    
    if (!isPasswordValid) {
      logger.warn(`Login failed - invalid password for user: ${user.id}`);
      throw new Error('Invalid credentials');
    }
    
    logger.info(`Password valid for user ID: ${user.id}, 2FA enabled: ${user.tiene_2fa}`);
    
    // Check if 2FA is enabled for the user
    if (user.tiene_2fa) {
      // If 2FA code is provided, verify it
      if (credentials.code_2fa) {
        let isValid = false;
        
        logger.info(`Verifying 2FA code for user ID: ${user.id}, method: ${user.metodo_2fa}`);
        
        if (user.metodo_2fa === 'app') {
          // Verify TOTP code for app-based 2FA
          isValid = speakeasy.totp.verify({
            secret: user.secreto_2fa,
            encoding: 'base32',
            token: credentials.code_2fa,
            window: 2 // Allow 2 periods before and after for clock drift (increased tolerance)
          });
          
          logger.info(`App-based 2FA verification result: ${isValid ? 'valid' : 'invalid'}`);
        } else if (user.metodo_2fa === 'email') {
          logger.info(`Querying for email verification code: ${credentials.code_2fa}`);
          
          // Verify email-based 2FA code
          const validCode = await db.oneOrNone(
            'SELECT * FROM autenticacion_2fa WHERE usuario_id = $1 AND codigo_2fa = $2 AND expira_en > NOW()',
            [user.id, credentials.code_2fa]
          );
          
          isValid = !!validCode;
          
          logger.info(`Email-based 2FA verification result: ${isValid ? 'valid' : 'invalid'}`);
          
          // If code is valid, delete it to prevent reuse
          if (isValid && validCode) {
            await db.none('DELETE FROM autenticacion_2fa WHERE id = $1', [validCode.id]);
            logger.info(`Used 2FA code deleted: ID=${validCode.id}`);
          }
        }
        
        if (!isValid) {
          logger.warn(`Invalid 2FA code for user ID: ${user.id}`);
          throw new Error('Invalid 2FA code');
        }
        
        logger.info(`2FA verification successful for user ID: ${user.id}`);
        
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
        logger.info(`2FA required but no code provided for user ID: ${user.id}`);
        
        // If 2FA is enabled but no code is provided, send email with code if method is email
        if (user.metodo_2fa === 'email') {
          // Generate a random code
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          
          // Calculate expiration time (10 minutes from now)
          const expiresAt = new Date();
          expiresAt.setMinutes(expiresAt.getMinutes() + 10);
          
          // Generate UUID for the authentication record
          const authId = uuidv4();
          
          logger.info(`Generated email 2FA code for login, user ID: ${user.id}`);
          
          // First, clean up any existing codes
          await db.none('DELETE FROM autenticacion_2fa WHERE usuario_id = $1', [user.id]);
          
          // Store the code in the database
          await db.none(
            'INSERT INTO autenticacion_2fa (id, usuario_id, codigo_2fa, expira_en) VALUES ($1, $2, $3, $4)',
            [authId, user.id, code, expiresAt]
          );
          
          // Verify the code was stored correctly
          const verifyCode = await db.oneOrNone(
            'SELECT * FROM autenticacion_2fa WHERE usuario_id = $1',
            [user.id]
          );
          
          if (verifyCode) {
            logger.info(`Verification of stored login code: ID=${verifyCode.id}, Code=${verifyCode.codigo_2fa}, Expires=${verifyCode.expira_en}`);
          } else {
            logger.warn(`Could not verify stored login code for user ID: ${user.id}`);
          }
          
          // Configure email transporter
          const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_PORT === '465',
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD
            },
            tls: {
              rejectUnauthorized: false
            }
          });
          
          // Send the code via email
          try {
            await transporter.sendMail({
              from: process.env.EMAIL_FROM,
              to: user.email,
              subject: 'Your Login Verification Code',
              text: `Your login verification code is: ${code}. It will expire in 10 minutes.`,
              html: `<p>Your login verification code is: <strong>${code}</strong></p><p>It will expire in 10 minutes.</p>`
            });
            
            logger.info(`Login verification email sent to: ${user.email}`);
          } catch (emailError) {
            logger.error(`Error sending login verification email: ${emailError.message}`);
            throw new Error('Failed to send verification email');
          }
        }
        
        // Return that 2FA is required
        return {
          requires2FA: true,
          method: user.metodo_2fa,
          userId: user.id,
          message: 'Two-factor authentication required'
        };
      }
    }
    
    logger.info(`Login successful for user ID: ${user.id}`);
    
    // Generate tokens if 2FA is not enabled
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
  } catch (error) {
    logger.error(`Error in login command: ${error.message}`);
    
    // Add stack trace for debugging
    if (process.env.NODE_ENV !== 'production') {
      logger.error(`Stack trace: ${error.stack}`);
    }
    
    throw error;
  }
}

module.exports = { execute };