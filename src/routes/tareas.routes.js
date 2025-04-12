/**
 * Rutas para el módulo de Tareas
 * Maneja todas las operaciones REST relacionadas con tareas
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const crearTareaCommand = require('../modules/tareas/commands/crear-tarea.command');
const actualizarTareaCommand = require('../modules/tareas/commands/actualizar-tarea.command');
const eliminarTareaCommand = require('../modules/tareas/commands/eliminar-tarea.command');
const reportarProgresoCommand = require('../modules/tareas/commands/reportar-progreso.command');
const obtenerTareasQuery = require('../modules/tareas/queries/obtener-tareas.query');
const obtenerTareaQuery = require('../modules/tareas/queries/obtener-tarea.query');
const obtenerProgresoTareaQuery = require('../modules/tareas/queries/obtener-progreso-tarea.query');
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
 * @route   GET /api/tareas
 * @desc    Obtener todas las tareas del usuario con filtros
 * @access  Private
 */
router.get(
  '/',
  verifyToken,
  [
    query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('por_pagina').optional().isInt({ min: 1, max: 100 }).withMessage('Items por página debe ser entre 1 y 100'),
    query('estado').optional().isIn(['pendiente', 'en progreso', 'completada', 'cancelada']).withMessage('Estado inválido'),
    query('prioridad').optional().isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad inválida'),
    query('equipo_id').optional().isUUID().withMessage('ID de equipo inválido'),
    query('proyecto_id').optional().isUUID().withMessage('ID de proyecto inválido'),
    query('asignado_a').optional().isUUID().withMessage('ID de usuario inválido'),
    query('ordenar_por').optional().isIn(['titulo', 'fecha_vencimiento', 'prioridad', 'estado', 'creado_en']).withMessage('Campo de ordenamiento inválido'),
    query('orden').optional().isIn(['asc', 'desc']).withMessage('Orden debe ser asc o desc'),
    query('filtro').optional().isString().withMessage('Filtro debe ser una cadena de texto'),
    query('filtro_texto').optional().isString().withMessage('Texto de filtro debe ser una cadena de texto'),
    query('fecha_vencimiento_desde').optional().isISO8601().withMessage('Formato de fecha de inicio de vencimiento inválido'),
    query('fecha_vencimiento_hasta').optional().isISO8601().withMessage('Formato de fecha de fin de vencimiento inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/tareas de usuario: ${req.user.id}`);
      
      // Construir objeto de filtros desde parámetros de consulta
      const filtros = {
        pagina: req.query.pagina ? parseInt(req.query.pagina) : 1,
        por_pagina: req.query.por_pagina ? parseInt(req.query.por_pagina) : 20,
        filtro_texto: req.query.filtro || '',
        estado: req.query.estado,
        prioridad: req.query.prioridad,
        equipo_id: req.query.equipo_id,
        proyecto_id: req.query.proyecto_id,
        asignado_a: req.query.asignado_a,
        sin_asignar: req.query.sin_asignar,
        busqueda: req.query.busqueda,
        etiqueta: req.query.etiqueta,
        fecha_vencimiento_desde: req.query.fecha_vencimiento_desde,
        fecha_vencimiento_hasta: req.query.fecha_vencimiento_hasta,
        vencidas: req.query.vencidas,
        hoy: req.query.hoy,
        ordenar_por: req.query.ordenar_por,
        orden: req.query.orden || 'desc'
      };
      
      // Obtener tareas mediante la consulta
      const resultado = await obtenerTareasQuery.execute(req.user.id, filtros);
      
      res.json(resultado);
    } catch (error) {
      logger.error(`Error en GET /api/tareas: ${error.message}`);
      res.status(500).json({ error: 'Error al obtener tareas' });
    }
  }
);

/**
 * @route   GET /api/tareas/:id
 * @desc    Obtener una tarea específica por ID
 * @access  Private
 */
router.get(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/tareas/${req.params.id} de usuario: ${req.user.id}`);
      
      const tarea = await obtenerTareaQuery.execute(req.params.id, req.user.id);
      
      res.json(tarea);
    } catch (error) {
      logger.error(`Error en GET /api/tareas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener la tarea' });
    }
  }
);

/**
 * @route   POST /api/tareas
 * @desc    Crear una nueva tarea
 * @access  Private
 */
router.post(
  '/',
  verifyToken,
  [
    body('titulo').notEmpty().withMessage('El título es obligatorio').isLength({ max: 255 }).withMessage('El título no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('estado').optional().isIn(['pendiente', 'en progreso', 'completada', 'cancelada']).withMessage('Estado inválido'),
    body('prioridad').optional().isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad inválida'),
    body('fecha_vencimiento').optional().isDate().withMessage('Formato de fecha inválido'),
    body('equipo_id').notEmpty().withMessage('El ID del equipo es obligatorio').isUUID().withMessage('ID de equipo inválido'),
    body('asignado_a').optional().isUUID().withMessage('ID de usuario inválido'),
    body('etiquetas').optional().isArray().withMessage('Las etiquetas deben ser un array')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/tareas de usuario: ${req.user.id}`);
      
      const nuevaTarea = await crearTareaCommand.execute(req.body, req.user.id);
      
      res.status(201).json(nuevaTarea);
    } catch (error) {
      logger.error(`Error en POST /api/tareas: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos') || 
          error.message.includes('no pertenece')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al crear la tarea' });
    }
  }
);

/**
 * @route   PUT /api/tareas/:id
 * @desc    Actualizar una tarea existente
 * @access  Private
 */
router.put(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea inválido'),
    body('titulo').optional().isLength({ max: 255 }).withMessage('El título no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('estado').optional().isIn(['pendiente', 'en progreso', 'completada', 'cancelada']).withMessage('Estado inválido'),
    body('prioridad').optional().isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad inválida'),
    body('fecha_vencimiento').optional().isDate().withMessage('Formato de fecha inválido'),
    body('asignado_a').optional().isUUID().withMessage('ID de usuario inválido'),
    body('etiquetas').optional().isArray().withMessage('Las etiquetas deben ser un array')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/tareas/${req.params.id} de usuario: ${req.user.id}`);
      
      const tareaActualizada = await actualizarTareaCommand.execute(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.json(tareaActualizada);
    } catch (error) {
      logger.error(`Error en PUT /api/tareas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos') || 
          error.message.includes('no pertenece')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al actualizar la tarea' });
    }
  }
);

/**
 * @route   DELETE /api/tareas/:id
 * @desc    Eliminar una tarea existente
 * @access  Private
 */
router.delete(
  '/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea inválido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud DELETE /api/tareas/${req.params.id} de usuario: ${req.user.id}`);
      
      await eliminarTareaCommand.execute(req.params.id, req.user.id);
      
      res.json({ message: 'Tarea eliminada exitosamente' });
    } catch (error) {
      logger.error(`Error en DELETE /api/tareas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al eliminar la tarea' });
    }
  }
);

/**
 * @route   POST /api/tareas/:id/progreso
 * @desc    Reportar progreso de una tarea
 * @access  Private
 */
router.post(
  '/:id/progreso',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea inválido'),
    body('comentario').notEmpty().withMessage('El comentario es obligatorio'),
    body('progreso_porcentaje').isInt({ min: 0, max: 100 }).withMessage('El porcentaje debe estar entre 0 y 100')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/tareas/${req.params.id}/progreso de usuario: ${req.user.id}`);
      
      const { comentario, progreso_porcentaje } = req.body;
      
      const reporte = await reportarProgresoCommand.execute(
        req.params.id,
        { comentario, progreso_porcentaje },
        req.user.id
      );
      
      res.status(201).json(reporte);
    } catch (error) {
      logger.error(`Error en POST /api/tareas/${req.params.id}/progreso: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('No tienes permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      if (error.message.includes('progreso debe estar entre')) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al reportar progreso de la tarea' });
    }
  }
);

/**
 * @route   GET /api/tareas/:id/progreso
 * @desc    Obtener historial de progreso de una tarea
 * @access  Private
 */
router.get(
  '/:id/progreso',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea inválido'),
    query('pagina').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('por_pagina').optional().isInt({ min: 1, max: 50 }).withMessage('Items por página debe ser entre 1 y 50')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/tareas/${req.params.id}/progreso de usuario: ${req.user.id}`);
      
      const opciones = {
        pagina: req.query.pagina ? parseInt(req.query.pagina) : 1,
        por_pagina: req.query.por_pagina ? parseInt(req.query.por_pagina) : 10
      };
      
      const historialProgreso = await obtenerProgresoTareaQuery.execute(
        req.params.id,
        req.user.id,
        opciones
      );
      
      res.json(historialProgreso);
    } catch (error) {
      logger.error(`Error en GET /api/tareas/${req.params.id}/progreso: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('No tienes permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener historial de progreso' });
    }
  }
);

module.exports = router;
