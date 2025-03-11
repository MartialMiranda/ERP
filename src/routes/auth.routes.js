/**
 * Authentication Routes
 * Handles all authentication-related endpoints
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const registerCommand = require('../modules/auth/commands/register.command');
const loginCommand = require('../modules/auth/commands/login.command');
const enable2faCommand = require('../modules/auth/commands/enable2fa.command');
const verify2faCommand = require('../modules/auth/commands/verify2fa.command');
const disable2faCommand = require('../modules/auth/commands/disable2fa.command');
const { verifyToken, refreshToken } = require('../middleware/auth.middleware');
const winston = require('winston');

// Create router
const router = express.Router();

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
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('nombre').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please include a valid email'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
    body('rol').optional().isIn(['admin', 'gestor', 'usuario']).withMessage('Invalid role')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      // Execute register command
      const user = await registerCommand.execute(req.body);
      
      res.status(201).json({
        message: 'User registered successfully',
        user
      });
    } catch (error) {
      logger.error(`Registration error: ${error.message}`);
      
      if (error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }
      
      res.status(500).json({ message: 'Server error during registration' });
    }
  }
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please include a valid email'),
    body('password').exists().withMessage('Password is required'),
    body('code_2fa').optional()
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      // Execute login command
      const result = await loginCommand.execute(req.body);
      
      // Check if 2FA is required
      if (result.requires2FA) {
        return res.status(200).json({
          message: '2FA verification required',
          requires2FA: true,
          metodo_2fa: result.metodo_2fa,
          userId: result.userId
        });
      }
      
      res.status(200).json({
        message: 'Login successful',
        user: result.user,
        tokens: result.tokens
      });
    } catch (error) {
      logger.error(`Login error: ${error.message}`);
      
      if (error.message === 'Invalid credentials') {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      if (error.message === 'Invalid 2FA code') {
        return res.status(401).json({ message: 'Invalid 2FA code' });
      }
      
      res.status(500).json({ message: 'Server error during login' });
    }
  }
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh-token', refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate tokens
 * @access  Private
 */
router.post('/logout', verifyToken, async (req, res) => {
  try {
    // Log the logout action
    logger.info(`User logged out: ${req.user.id}`);
    
    // In a stateless JWT setup, the client is responsible for removing the token
    // Here we just return a success message
    res.status(200).json({ message: 'Logout successful' });
    
    // Note: For a more secure implementation, you could:
    // 1. Add the token to a blacklist/blocklist in Redis or database
    // 2. Implement a token revocation mechanism
    // 3. Use shorter token expiration times
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

/**
 * @route   POST /api/auth/enable-2fa
 * @desc    Enable 2FA for a user
 * @access  Private
 */
router.post(
  '/enable-2fa',
  [
    verifyToken,
    body('method').isIn(['app', 'email']).withMessage('Invalid 2FA method')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      // Execute enable2fa command
      const result = await enable2faCommand.execute({
        userId: req.user.id,
        method: req.body.method
      });
      
      res.status(200).json({
        message: '2FA setup initiated',
        ...result
      });
    } catch (error) {
      logger.error(`Enable 2FA error: ${error.message}`);
      
      if (error.message === 'User not found') {
        return res.status(404).json({ message: 'User not found' });
      }
      
      if (error.message === 'Invalid 2FA method') {
        return res.status(400).json({ message: 'Invalid 2FA method' });
      }
      
      if (error.message.includes('Failed to send')) {
        return res.status(500).json({ message: 'Failed to send verification email' });
      }
      
      res.status(500).json({ message: 'Server error during 2FA setup' });
    }
  }
);

/**
 * @route   POST /api/auth/verify-2fa
 * @desc    Verify 2FA setup
 * @access  Private
 */
router.post(
  '/verify-2fa',
  [
    verifyToken,
    body('code').notEmpty().withMessage('Verification code is required'),
    body('method').isIn(['app', 'email']).withMessage('Invalid 2FA method')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      // Execute verify2fa command
      const result = await verify2faCommand.execute({
        userId: req.user.id,
        code: req.body.code,
        method: req.body.method
      });
      
      res.status(200).json({
        message: '2FA verification successful',
        ...result
      });
    } catch (error) {
      logger.error(`Verify 2FA error: ${error.message}`);
      
      if (error.message === 'User not found or 2FA method not set') {
        return res.status(404).json({ message: 'User not found or 2FA method not set' });
      }
      
      if (error.message === 'Invalid verification code') {
        return res.status(401).json({ message: 'Invalid verification code' });
      }
      
      if (error.message === 'Invalid 2FA method') {
        return res.status(400).json({ message: 'Invalid 2FA method' });
      }
      
      res.status(500).json({ message: 'Server error during 2FA verification' });
    }
  }
);

/**
 * @route   POST /api/auth/disable-2fa
 * @desc    Disable 2FA for a user
 * @access  Private
 */
router.post(
  '/disable-2fa',
  [
    verifyToken
  ],
  async (req, res) => {
    try {      
      // Execute disable2fa command
      const result = await disable2faCommand.execute({
        userId: req.user.id
      });
      
      res.status(200).json({
        message: '2FA disabled successfully',
        ...result
      });
    } catch (error) {
      logger.error(`Disable 2FA error: ${error.message}`);
      
      if (error.message === 'User not found or 2FA not enabled') {
        return res.status(404).json({ message: 'User not found or 2FA not enabled' });
      }
      
      res.status(500).json({ message: 'Server error during 2FA disabling' });
    }
  }
);

module.exports = router;