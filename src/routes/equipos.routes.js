/**
 * Rutas para el módulo de Equipos
 * Maneja todas las operaciones REST relacionadas con equipos
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const crearEquipoCommand = require('../modules/equipos/commands/crear-equipo.command');
const actualizarEquipoCommand = require('../modules/equipos/commands/actualizar-equipo.command');
const eliminarEquipoCommand = require('../modules/equipos/commands/eliminar-equipo.command');
const obtenerEquiposQuery = require('../modules/equipos/queries/obtener-equipos.query');
const obtenerEquipoQuery = require('../modules/equipos/queries/obtener-equipo.query');
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
 * @route   GET /api/equipos
 * @desc    Obtener todos los equipos del usuario con filtros
 * @access  Private
 */
router.get(
  '/',
  verifyToken,
  [
    query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('por_pagina').optional().isInt({ min: 1, max: 100 }).withMessage('Items por página debe ser entre 1 y 100'),
    query('proyecto_id').optional().isUUID().withMessage('ID de proyecto inválido'),
    query('lider_id').optional().isUUID().withMessage('ID de líder inválido'),
    query('ordenar_por').optional().isIn(['nombre', 'creado_en', 'actualizado_en']).withMessage('Campo de ordenamiento inválido'),
    query('orden').optional().isIn(['asc', 'desc']).withMessage('Orden debe ser asc o desc')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/equipos de usuario: ${req.user.id}`);
      
      // Construir objeto de filtros desde parámetros de consulta
      const filtros = {
        pagina: req.query.pagina ? parseInt(req.query.pagina) : 1,
        por_pagina: req.query.por_pagina ? parseInt(req.query.por_pagina) : 20,
        proyecto_id: req.query.proyecto_id,
        lider_id: req.query.lider_id,
        busqueda: req.query.busqueda,
        soy_miembro: req.query.soy_miembro,
        soy_lider: req.query.soy_lider,
        ordenar_por: req.query.ordenar_por,
        orden: req.query.orden || 'desc'
      };
      
      // Obtener equipos mediante la consulta
      const resultado = await obtenerEquiposQuery.execute(req.user.id, filtros);
      
      res.json(resultado);
    } catch (error) {
      logger.error(`Error en GET /api/equipos: ${error.message}`);
      res.status(500).json({ error: 'Error al obtener equipos' });
    }
  }
);

/**
 * @route   GET /api/equipos/:id
 * @desc    Obtener un equipo específico por ID
 * @access  Private
 */
router.get(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de equipo inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/equipos/${req.params.id} de usuario: ${req.user.id}`);
      
      const equipo = await obtenerEquipoQuery.execute(req.params.id, req.user.id);
      
      res.json(equipo);
    } catch (error) {
      logger.error(`Error en GET /api/equipos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener el equipo' });
    }
  }
);

/**
 * @route   POST /api/equipos
 * @desc    Crear un nuevo equipo
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('proyecto_id').notEmpty().withMessage('El ID del proyecto es obligatorio').isUUID().withMessage('ID de proyecto inválido'),
    body('lider_id').optional().isUUID().withMessage('ID de líder inválido'),
    body('miembros').optional().isArray().withMessage('Los miembros deben ser un array')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/equipos de usuario: ${req.user.id}`);
      
      const nuevoEquipo = await crearEquipoCommand.execute(req.body, req.user.id);
      
      res.status(201).json(nuevoEquipo);
    } catch (error) {
      logger.error(`Error en POST /api/equipos: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos') || 
          error.message.includes('no existe')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al crear el equipo' });
    }
  }
);

/**
 * @route   PUT /api/equipos/:id
 * @desc    Actualizar un equipo existente
 * @access  Private
 */
router.put(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de equipo inválido'),
    body('nombre').optional().isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('lider_id').optional().isUUID().withMessage('ID de líder inválido'),
    body('miembros').optional().isArray().withMessage('Los miembros deben ser un array')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/equipos/${req.params.id} de usuario: ${req.user.id}`);
      
      const equipoActualizado = await actualizarEquipoCommand.execute(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.json(equipoActualizado);
    } catch (error) {
      logger.error(`Error en PUT /api/equipos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos') || 
          error.message.includes('no existe')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al actualizar el equipo' });
    }
  }
);

/**
 * @route   DELETE /api/equipos/:id
 * @desc    Eliminar un equipo existente
 * @access  Private
 */
router.delete(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de equipo inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud DELETE /api/equipos/${req.params.id} de usuario: ${req.user.id}`);
      
      await eliminarEquipoCommand.execute(req.params.id, req.user.id);
      
      res.json({ message: 'Equipo eliminado exitosamente' });
    } catch (error) {
      logger.error(`Error en DELETE /api/equipos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('no se puede eliminar')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al eliminar el equipo' });
    }
  }
);

module.exports = router;
