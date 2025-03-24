/**
 * Rutas para el módulo de Asignaciones
 * Maneja todas las operaciones relacionadas con asignaciones de recursos a equipos y tareas
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const asignarRecursoCommand = require('../modules/recursos/commands/asignar-recurso.command');
const asignarRecursoTareaCommand = require('../modules/recursos/commands/asignar-recurso-tarea.command');
const finalizarAsignacionCommand = require('../modules/recursos/commands/finalizar-asignacion.command');
const { verifyToken } = require('../middleware/auth.middleware');
const winston = require('winston');

// Crear router
const router = express.Router();

// Configuración del logger
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
 * Middleware para validar errores
 */
const validarErrores = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn(`Errores de validación: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * @route   POST /api/asignaciones/equipo
 * @desc    Asignar un recurso a un equipo
 * @access  Private
 */
router.post(
  '/equipo',
  verifyToken,
  [
    body('recurso_id').isUUID().withMessage('ID de recurso inválido'),
    body('equipo_id').isUUID().withMessage('ID de equipo inválido'),
    body('cantidad').optional().isInt({ min: 1 }).withMessage('La cantidad debe ser un número entero positivo'),
    body('fecha_inicio').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de inicio'),
    body('fecha_fin').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de fin'),
    body('notas').optional().isString().withMessage('Las notas deben ser texto')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/asignaciones/equipo de usuario: ${req.user.id}`);
      
      const asignacion = await asignarRecursoCommand.execute(req.body, req.user.id);
      
      res.status(201).json(asignacion);
    } catch (error) {
      logger.error(`Error en POST /api/asignaciones/equipo: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('ya está asignado') || error.message.includes('no disponible')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al asignar el recurso al equipo' });
    }
  }
);

/**
 * @route   POST /api/asignaciones/tarea
 * @desc    Asignar un recurso a una tarea
 * @access  Private
 */
router.post(
  '/tarea',
  verifyToken,
  [
    body('recurso_id').isUUID().withMessage('ID de recurso inválido'),
    body('tarea_id').isUUID().withMessage('ID de tarea inválido'),
    body('cantidad').optional().isInt({ min: 1 }).withMessage('La cantidad debe ser un número entero positivo'),
    body('fecha_inicio').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de inicio'),
    body('fecha_fin').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de fin'),
    body('actualizar_estado_tarea').optional().isBoolean().withMessage('El valor debe ser booleano'),
    body('notas').optional().isString().withMessage('Las notas deben ser texto')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/asignaciones/tarea de usuario: ${req.user.id}`);
      
      const asignacion = await asignarRecursoTareaCommand.execute(req.body, req.user.id);
      
      res.status(201).json(asignacion);
    } catch (error) {
      logger.error(`Error en POST /api/asignaciones/tarea: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('no disponible') || error.message.includes('fecha')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al asignar el recurso a la tarea' });
    }
  }
);

/**
 * @route   PUT /api/asignaciones/equipo/:id/finalizar
 * @desc    Finalizar una asignación de recurso a equipo
 * @access  Private
 */
router.put(
  '/equipo/:id/finalizar',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de asignación inválido'),
    body('notas').optional().isString().withMessage('Las notas deben ser texto')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/asignaciones/equipo/${req.params.id}/finalizar de usuario: ${req.user.id}`);
      
      const asignacion = await finalizarAsignacionCommand.execute(
        req.params.id, 
        'equipo', 
        req.body, 
        req.user.id
      );
      
      res.json(asignacion);
    } catch (error) {
      logger.error(`Error en PUT /api/asignaciones/equipo/${req.params.id}/finalizar: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('ya está finalizada')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al finalizar la asignación del recurso' });
    }
  }
);

/**
 * @route   PUT /api/asignaciones/tarea/:id/finalizar
 * @desc    Finalizar una asignación de recurso a tarea
 * @access  Private
 */
router.put(
  '/tarea/:id/finalizar',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de asignación inválido'),
    body('evaluacion').optional().isInt({ min: 1, max: 5 }).withMessage('La evaluación debe ser un número entre 1 y 5'),
    body('notas').optional().isString().withMessage('Las notas deben ser texto')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/asignaciones/tarea/${req.params.id}/finalizar de usuario: ${req.user.id}`);
      
      const asignacion = await finalizarAsignacionCommand.execute(
        req.params.id, 
        'tarea', 
        req.body, 
        req.user.id
      );
      
      res.json(asignacion);
    } catch (error) {
      logger.error(`Error en PUT /api/asignaciones/tarea/${req.params.id}/finalizar: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('ya está finalizada')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al finalizar la asignación del recurso' });
    }
  }
);

module.exports = router;
