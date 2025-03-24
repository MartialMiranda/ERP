/**
 * Rutas para el módulo de Proyectos
 * Maneja todas las operaciones REST relacionadas con proyectos
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const crearProyectoCommand = require('../modules/proyectos/commands/crear-proyecto.command');
const actualizarProyectoCommand = require('../modules/proyectos/commands/actualizar-proyecto.command');
const eliminarProyectoCommand = require('../modules/proyectos/commands/eliminar-proyecto.command');
const obtenerProyectosQuery = require('../modules/proyectos/queries/obtener-proyectos.query');
const obtenerProyectoQuery = require('../modules/proyectos/queries/obtener-proyecto.query');
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
 * @route   GET /api/proyectos
 * @desc    Obtener todos los proyectos del usuario
 * @access  Private
 */
router.get(
  '/',
  verifyToken,
  [
    query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('por_pagina').optional().isInt({ min: 1, max: 100 }).withMessage('Items por página debe ser entre 1 y 100'),
    query('estado').optional().isIn(['planificado', 'en progreso', 'completado', 'cancelado']).withMessage('Estado inválido'),
    query('ordenar_por').optional().isIn(['nombre', 'fecha_inicio', 'fecha_fin', 'estado', 'creado_en']).withMessage('Campo de ordenamiento inválido'),
    query('orden').optional().isIn(['asc', 'desc']).withMessage('Orden debe ser asc o desc')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/proyectos de usuario: ${req.user.id}`);
      
      // Construir objeto de filtros desde parámetros de consulta
      const filtros = {
        pagina: req.query.pagina ? parseInt(req.query.pagina) : 1,
        por_pagina: req.query.por_pagina ? parseInt(req.query.por_pagina) : 10,
        estado: req.query.estado,
        nombre: req.query.nombre,
        fecha_inicio_desde: req.query.fecha_inicio_desde,
        fecha_inicio_hasta: req.query.fecha_inicio_hasta,
        fecha_fin_desde: req.query.fecha_fin_desde,
        fecha_fin_hasta: req.query.fecha_fin_hasta,
        ordenar_por: req.query.ordenar_por,
        orden: req.query.orden || 'desc'
      };
      
      // Obtener proyectos mediante la consulta
      const resultado = await obtenerProyectosQuery.execute(req.user.id, filtros);
      
      res.json(resultado);
    } catch (error) {
      logger.error(`Error en GET /api/proyectos: ${error.message}`);
      res.status(500).json({ error: 'Error al obtener proyectos' });
    }
  }
);

/**
 * @route   GET /api/proyectos/:id
 * @desc    Obtener un proyecto específico por ID
 * @access  Private
 */
router.get(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de proyecto inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/proyectos/${req.params.id} de usuario: ${req.user.id}`);
      
      const proyecto = await obtenerProyectoQuery.execute(req.params.id, req.user.id);
      
      res.json(proyecto);
    } catch (error) {
      logger.error(`Error en GET /api/proyectos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener el proyecto' });
    }
  }
);

/**
 * @route   POST /api/proyectos
 * @desc    Crear un nuevo proyecto
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('fecha_inicio').notEmpty().withMessage('La fecha de inicio es obligatoria').isDate().withMessage('Formato de fecha inválido'),
    body('fecha_fin').optional().isDate().withMessage('Formato de fecha inválido'),
    body('estado').optional().isIn(['planificado', 'en progreso', 'completado', 'cancelado']).withMessage('Estado inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/proyectos de usuario: ${req.user.id}`);
      
      const nuevoProyecto = await crearProyectoCommand.execute(req.body, req.user.id);
      
      res.status(201).json(nuevoProyecto);
    } catch (error) {
      logger.error(`Error en POST /api/proyectos: ${error.message}`);
      res.status(500).json({ error: 'Error al crear el proyecto' });
    }
  }
);

/**
 * @route   PUT /api/proyectos/:id
 * @desc    Actualizar un proyecto existente
 * @access  Private
 */
router.put(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de proyecto inválido'),
    body('nombre').optional().isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('fecha_inicio').optional().isDate().withMessage('Formato de fecha inválido'),
    body('fecha_fin').optional().isDate().withMessage('Formato de fecha inválido'),
    body('estado').optional().isIn(['planificado', 'en progreso', 'completado', 'cancelado']).withMessage('Estado inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/proyectos/${req.params.id} de usuario: ${req.user.id}`);
      
      const proyectoActualizado = await actualizarProyectoCommand.execute(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.json(proyectoActualizado);
    } catch (error) {
      logger.error(`Error en PUT /api/proyectos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al actualizar el proyecto' });
    }
  }
);

/**
 * @route   DELETE /api/proyectos/:id
 * @desc    Eliminar un proyecto existente
 * @access  Private
 */
router.delete(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de proyecto inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud DELETE /api/proyectos/${req.params.id} de usuario: ${req.user.id}`);
      
      await eliminarProyectoCommand.execute(req.params.id, req.user.id);
      
      res.json({ message: 'Proyecto eliminado exitosamente' });
    } catch (error) {
      logger.error(`Error en DELETE /api/proyectos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al eliminar el proyecto' });
    }
  }
);

module.exports = router;
