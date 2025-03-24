/**
 * Rutas para el módulo de Recursos
 * Maneja todas las operaciones REST relacionadas con recursos
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const crearRecursoCommand = require('../modules/recursos/commands/crear-recurso.command');
const actualizarRecursoCommand = require('../modules/recursos/commands/actualizar-recurso.command');
const eliminarRecursoCommand = require('../modules/recursos/commands/eliminar-recurso.command');
const obtenerRecursosQuery = require('../modules/recursos/queries/obtener-recursos.query');
const obtenerRecursoQuery = require('../modules/recursos/queries/obtener-recurso.query');
const { verifyToken, checkRole } = require('../middleware/auth.middleware');
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
 * @route   GET /api/recursos
 * @desc    Obtener todos los recursos con filtros
 * @access  Private
 */
router.get(
  '/',
  verifyToken,
  [
    query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('por_pagina').optional().isInt({ min: 1, max: 100 }).withMessage('Items por página debe ser entre 1 y 100'),
    query('tipo').optional().isIn(['humano', 'material', 'tecnologico', 'financiero']).withMessage('Tipo de recurso inválido'),
    query('disponibilidad').optional().isIn(['disponible', 'parcial', 'no disponible']).withMessage('Disponibilidad inválida'),
    query('costo_minimo').optional().isFloat({ min: 0 }).withMessage('Costo mínimo debe ser un número positivo'),
    query('costo_maximo').optional().isFloat({ min: 0 }).withMessage('Costo máximo debe ser un número positivo'),
    query('moneda').optional().isString().withMessage('Moneda inválida'),
    query('equipo_id').optional().isUUID().withMessage('ID de equipo inválido'),
    query('modo').optional().isIn(['todos', 'creados', 'asignados']).withMessage('Modo de visualización inválido'),
    query('ordenar_por').optional().isIn(['nombre', 'tipo', 'costo', 'disponibilidad', 'creado_en']).withMessage('Campo de ordenamiento inválido'),
    query('orden').optional().isIn(['asc', 'desc']).withMessage('Orden debe ser asc o desc')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/recursos de usuario: ${req.user.id}`);
      
      // Verificar si el usuario intenta ver todos los recursos (solo administradores)
      if (req.query.modo === 'todos' && req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'No tiene permisos para ver todos los recursos del sistema' });
      }
      
      // Construir objeto de filtros desde parámetros de consulta
      const filtros = {
        pagina: req.query.pagina ? parseInt(req.query.pagina) : 1,
        por_pagina: req.query.por_pagina ? parseInt(req.query.por_pagina) : 20,
        tipo: req.query.tipo,
        disponibilidad: req.query.disponibilidad,
        busqueda: req.query.busqueda,
        costo_minimo: req.query.costo_minimo,
        costo_maximo: req.query.costo_maximo,
        moneda: req.query.moneda,
        equipo_id: req.query.equipo_id,
        disponibles: req.query.disponibles,
        modo: req.query.modo || 'asignados',
        ordenar_por: req.query.ordenar_por,
        orden: req.query.orden || 'asc'
      };
      
      // Obtener recursos mediante la consulta
      const resultado = await obtenerRecursosQuery.execute(req.user.id, filtros);
      
      res.json(resultado);
    } catch (error) {
      logger.error(`Error en GET /api/recursos: ${error.message}`);
      res.status(500).json({ error: 'Error al obtener recursos' });
    }
  }
);

/**
 * @route   GET /api/recursos/:id
 * @desc    Obtener un recurso específico por ID
 * @access  Private
 */
router.get(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de recurso inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/recursos/${req.params.id} de usuario: ${req.user.id}`);
      
      const recurso = await obtenerRecursoQuery.execute(req.params.id, req.user.id);
      
      res.json(recurso);
    } catch (error) {
      logger.error(`Error en GET /api/recursos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener el recurso' });
    }
  }
);

/**
 * @route   POST /api/recursos
 * @desc    Crear un nuevo recurso
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('tipo').notEmpty().withMessage('El tipo es obligatorio').isIn(['humano', 'material', 'tecnologico', 'financiero']).withMessage('Tipo de recurso inválido'),
    body('costo').optional().isFloat({ min: 0 }).withMessage('El costo debe ser un número positivo'),
    body('moneda').optional().isString().withMessage('Moneda inválida'),
    body('disponibilidad').optional().isIn(['disponible', 'parcial', 'no disponible']).withMessage('Disponibilidad inválida'),
    body('propiedades').optional().isObject().withMessage('Las propiedades deben ser un objeto'),
    body('asignaciones').optional().isArray().withMessage('Las asignaciones deben ser un array')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/recursos de usuario: ${req.user.id}`);
      
      const nuevoRecurso = await crearRecursoCommand.execute(req.body, req.user.id);
      
      res.status(201).json(nuevoRecurso);
    } catch (error) {
      logger.error(`Error en POST /api/recursos: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos') || 
          error.message.includes('inválido')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al crear el recurso' });
    }
  }
);

/**
 * @route   PUT /api/recursos/:id
 * @desc    Actualizar un recurso existente
 * @access  Private
 */
router.put(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de recurso inválido'),
    body('nombre').optional().isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('tipo').optional().isIn(['humano', 'material', 'tecnologico', 'financiero']).withMessage('Tipo de recurso inválido'),
    body('costo').optional().isFloat({ min: 0 }).withMessage('El costo debe ser un número positivo'),
    body('moneda').optional().isString().withMessage('Moneda inválida'),
    body('disponibilidad').optional().isIn(['disponible', 'parcial', 'no disponible']).withMessage('Disponibilidad inválida'),
    body('propiedades').optional().isObject().withMessage('Las propiedades deben ser un objeto')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/recursos/${req.params.id} de usuario: ${req.user.id}`);
      
      const recursoActualizado = await actualizarRecursoCommand.execute(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.json(recursoActualizado);
    } catch (error) {
      logger.error(`Error en PUT /api/recursos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('inválido')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al actualizar el recurso' });
    }
  }
);

/**
 * @route   DELETE /api/recursos/:id
 * @desc    Eliminar un recurso existente
 * @access  Private
 */
router.delete(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de recurso inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud DELETE /api/recursos/${req.params.id} de usuario: ${req.user.id}`);
      
      await eliminarRecursoCommand.execute(req.params.id, req.user.id);
      
      res.json({ message: 'Recurso eliminado exitosamente' });
    } catch (error) {
      logger.error(`Error en DELETE /api/recursos/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('no se puede eliminar') || error.message.includes('asignaciones activas')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al eliminar el recurso' });
    }
  }
);

module.exports = router;
