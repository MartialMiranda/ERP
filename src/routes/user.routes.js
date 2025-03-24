/**
 * User Routes
 * Handles all user-related endpoints
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { verifyToken, checkRole } = require('../middleware/auth.middleware');
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
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await db.oneOrNone(
      'SELECT id, nombre, email, rol, tiene_2fa, metodo_2fa, creado_en FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    logger.error(`Error fetching user profile: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put(
  '/profile',
  [
    verifyToken,
    body('nombre').optional().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Please include a valid email')
  ],
  async (req, res) => {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      
      // Build update fields
      const updateFields = {};
      if (req.body.nombre) updateFields.nombre = req.body.nombre;
      if (req.body.email) updateFields.email = req.body.email;
      
      // If no fields to update
      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ message: 'No update fields provided' });
      }
      
      // Add updated timestamp
      updateFields.actualizado_en = new Date();
      
      // Generate SQL query dynamically
      const updateColumns = Object.keys(updateFields).map((key, index) => `${key} = $${index + 1}`);
      const updateValues = Object.values(updateFields);
      
      // Add user ID to values array
      updateValues.push(req.user.id);
      
      // Execute update
      const updatedUser = await db.oneOrNone(
        `UPDATE usuarios SET ${updateColumns.join(', ')} WHERE id = $${updateValues.length} RETURNING id, nombre, email, rol, tiene_2fa, metodo_2fa, creado_en, actualizado_en`,
        updateValues
      );
      
      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      res.json({
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      logger.error(`Error updating user profile: ${error.message}`);
      
      if (error.message.includes('duplicate key')) {
        return res.status(409).json({ message: 'Email already in use' });
      }
      
      res.status(500).json({ message: 'Server error' });
    }
  }
);

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private/Admin
 */
router.get('/', [verifyToken, checkRole(['admin'])], async (req, res) => {
  try {
    const users = await db.manyOrNone(
      'SELECT id, nombre, email, rol, tiene_2fa, metodo_2fa, creado_en FROM usuarios ORDER BY id'
    );
    
    res.json(users);
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete a user (admin only)
 * @access  Private/Admin
 */
router.delete('/:id', [verifyToken, checkRole(['admin'])], async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }
    
    const result = await db.result('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting user: ${error.message}`);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;