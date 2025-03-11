/**
 * Enable2FA Command - Handles enabling two-factor authentication for users
 */
const speakeasy = require('speakeasy');
const db = require('../../../config/database');
const nodemailer = require('nodemailer');
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
 * Configure email transporter for sending 2FA codes
 */
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

/**
 * Generate a random 6-digit code for email-based 2FA
 * @returns {string} - 6-digit code
 */
const generateEmailCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send 2FA code via email
 * @param {string} email - User's email address
 * @param {string} code - 2FA code to send
 * @returns {Promise<boolean>} - True if email was sent successfully
 */
const sendEmailCode = async (email, code) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Your 2FA Verification Code',
      text: `Your verification code is: ${code}. It will expire in 10 minutes.`,
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>It will expire in 10 minutes.</p>`
    });
    return true;
  } catch (error) {
    logger.error(`Error sending 2FA email: ${error.message}`);
    return false;
  }
};

/**
 * Execute the enable2FA command
 * @param {Object} data - Data for enabling 2FA (userId, method)
 * @returns {Promise<Object>} - 2FA setup information
 */
async function execute(data) {
  try {
    // Verify user exists
    const user = await db.oneOrNone('SELECT * FROM usuarios WHERE id = $1', [data.userId]);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Handle different 2FA methods
    if (data.method === 'app') {
      // Generate new TOTP secret for app-based 2FA
      const secret = speakeasy.generateSecret({
        length: 20,
        name: `${process.env['2FA_APP_NAME']}:${user.email}`
      });
      
      // Update user with 2FA information (not enabled yet until verified)
      await db.none(
        'UPDATE usuarios SET secreto_2fa = $1, metodo_2fa = $2 WHERE id = $3',
        [secret.base32, 'app', user.id]
      );
      
      // Return the secret and QR code for the user to scan
      return {
        secret: secret.base32,
        otpauth_url: secret.otpauth_url,
        verified: false
      };
    } else if (data.method === 'email') {
      // Generate a random code for email-based 2FA
      const code = generateEmailCode();
      
      // Calculate expiration time (10 minutes from now)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);
      
      // Store the code in the database
      await db.none(
        'INSERT INTO autenticacion_2fa (usuario_id, codigo_2fa, expira_en) VALUES ($1, $2, $3)',
        [user.id, code, expiresAt]
      );
      
      // Update user with 2FA method (not enabled yet until verified)
      await db.none(
        'UPDATE usuarios SET metodo_2fa = $1 WHERE id = $2',
        ['email', user.id]
      );
      
      // Send the code via email
      const emailSent = await sendEmailCode(user.email, code);
      
      if (!emailSent) {
        throw new Error('Failed to send verification email');
      }
      
      return {
        emailSent: true,
        verified: false
      };
    } else {
      throw new Error('Invalid 2FA method');
    }
  } catch (error) {
    logger.error(`Error in enable2FA command: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };