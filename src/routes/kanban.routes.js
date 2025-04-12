/**
 * Rutas para el mu00f3dulo de Kanban
 * Maneja todas las operaciones REST relacionadas con columnas y tareas kanban
 */
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');

// Importar comandos y consultas para columnas
const crearColumnaCommand = require('../modules/kanban/commands/crear-columna.command');
const actualizarColumnaCommand = require('../modules/kanban/commands/actualizar-columna.command');
const eliminarColumnaCommand = require('../modules/kanban/commands/eliminar-columna.command');
const obtenerColumnaQuery = require('../modules/kanban/queries/obtener-columna.query');
const obtenerColumnasProyectoQuery = require('../modules/kanban/queries/obtener-columnas-proyecto.query');

// Importar comandos y consultas para tareas
const crearTareaCommand = require('../modules/kanban/commands/crear-tarea.command');
const actualizarTareaCommand = require('../modules/kanban/commands/actualizar-tarea.command');
const eliminarTareaCommand = require('../modules/kanban/commands/eliminar-tarea.command');
const obtenerTareaQuery = require('../modules/kanban/queries/obtener-tarea.query');

const { verifyToken } = require('../middleware/auth.middleware');
const winston = require('winston');

// Crear router
const router = express.Router();

// Configuraciu00f3n del logger
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
    logger.warn(`Errores de validaciu00f3n: ${JSON.stringify(errors.array())}`);
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// ===== RUTAS PARA COLUMNAS KANBAN =====

/**
 * @route   GET /api/kanban/columnas/proyecto/:proyectoId
 * @desc    Obtener todas las columnas de un proyecto con sus tareas
 * @access  Private
 */
router.get(
  '/columnas/proyecto/:proyectoId',
  verifyToken,
  [
    param('proyectoId').isUUID().withMessage('ID de proyecto invu00e1lido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/kanban/columnas/proyecto/${req.params.proyectoId} de usuario: ${req.user.id}`);
      
      const columnas = await obtenerColumnasProyectoQuery.execute(req.params.proyectoId, req.user.id);
      
      res.json(columnas);
    } catch (error) {
      logger.error(`Error en GET /api/kanban/columnas/proyecto/${req.params.proyectoId}: ${error.message}`);
      
      if (error.message.includes('no encontrado') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener las columnas del proyecto' });
    }
  }
);

/**
 * @route   GET /api/kanban/columnas/:id
 * @desc    Obtener una columna específica por ID con sus tareas
 * @access  Private
 */
router.get(
  '/columnas/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de columna invu00e1lido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/kanban/columnas/${req.params.id} de usuario: ${req.user.id}`);
      
      const columna = await obtenerColumnaQuery.execute(req.params.id, req.user.id);
      
      res.json(columna);
    } catch (error) {
      logger.error(`Error en GET /api/kanban/columnas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener la columna' });
    }
  }
);

/**
 * @route   POST /api/kanban/columnas
 * @desc    Crear una nueva columna kanban
 * @access  Private
 */
router.post(
  '/columnas',
  verifyToken,
  [
    body('nombre').notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('proyecto_id').isUUID().withMessage('ID de proyecto invu00e1lido'),
    body('posicion').optional().isInt({ min: 0 }).withMessage('La posiciu00f3n debe ser un nu00famero entero no negativo')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/kanban/columnas de usuario: ${req.user.id}`);
      
      const nuevaColumna = await crearColumnaCommand.execute(
        {
          nombre: req.body.nombre,
          posicion: req.body.posicion
        },
        req.body.proyecto_id,
        req.user.id
      );
      
      res.status(201).json(nuevaColumna);
    } catch (error) {
      logger.error(`Error en POST /api/kanban/columnas: ${error.message}`);
      
      if (error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al crear la columna' });
    }
  }
);

/**
 * @route   PUT /api/kanban/columnas/:id
 * @desc    Actualizar una columna kanban existente
 * @access  Private
 */
router.put(
  '/columnas/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de columna invalido'),
    body('nombre').optional().isLength({ max: 255 }).withMessage('El nombre no puede exceder 255 caracteres'),
    body('posicion').optional().isInt({ min: 0 }).withMessage('La posicion debe ser un numero entero no negativo')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/kanban/columnas/${req.params.id} de usuario: ${req.user.id}`);
      
      const columnaActualizada = await actualizarColumnaCommand.execute(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.json(columnaActualizada);
    } catch (error) {
      logger.error(`Error en PUT /api/kanban/columnas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al actualizar la columna' });
    }
  }
);

/**
 * @route   DELETE /api/kanban/columnas/:id
 * @desc    Eliminar una columna kanban existente
 * @access  Private
 */
router.delete(
  '/columnas/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de columna invu00e1lido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud DELETE /api/kanban/columnas/${req.params.id} de usuario: ${req.user.id}`);
      
      const resultado = await eliminarColumnaCommand.execute(req.params.id, req.user.id);
      
      res.status(200).json({ mensaje: resultado.message });
    } catch (error) {
      logger.error(`Error en DELETE /api/kanban/columnas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al eliminar la columna' });
    }
  }
);

// ===== RUTAS PARA TAREAS KANBAN =====

/**
 * @route   GET /api/kanban/tareas/:id
 * @desc    Obtener una tarea kanban especifica por ID
 * @access  Private
 */
router.get(
  '/tareas/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea invu00e1lido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/kanban/tareas/${req.params.id} de usuario: ${req.user.id}`);
      
      const tarea = await obtenerTareaQuery.execute(req.params.id, req.user.id);
      
      res.json(tarea);
    } catch (error) {
      logger.error(`Error en GET /api/kanban/tareas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al obtener la tarea' });
    }
  }
);

/**
 * @route   POST /api/kanban/tareas
 * @desc    Crear una nueva tarea kanban
 * @access  Private
 */
router.post(
  '/tareas',
  verifyToken,
  [
    body('columna_id').isUUID().withMessage('ID de columna invalido'),
    body('descripcion').optional(),
    body('prioridad').optional().isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad invalido'),
    body('estado').optional().isIn(['pendiente', 'en progreso', 'completada', 'cancelada']).withMessage('Estado invalido'),
    body('fecha_vencimiento').optional().isDate().withMessage('Formato de fecha invalido'),
    body('asignado_a').optional().isUUID().withMessage('ID de usuario invalido'),
    body('posicion').optional().isInt({ min: 0 }).withMessage('La posision debe ser un numero entero no negativo'),
    body('tarea_id').optional().isUUID().withMessage('ID de tarea invalido')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud POST /api/kanban/tareas de usuario: ${req.user.id}`);
      
      const nuevaTarea = await crearTareaCommand.execute(
        req.body,
        req.body.columna_id,
        req.user.id
      );
      
      res.status(201).json(nuevaTarea);
    } catch (error) {
      logger.error(`Error en POST /api/kanban/tareas: ${error.message}`);
      
      if (error.message.includes('no encontrada') || error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al crear la tarea' });
    }
  }
);

/**
 * @route   PUT /api/kanban/tareas/:id
 * @desc    Actualizar una tarea kanban existente
 * @access  Private
 */
router.put(
  '/tareas/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea invu00e1lido'),
    body('columna_id').optional().isUUID().withMessage('ID de columna invu00e1lido'),
    body('titulo').optional().isLength({ max: 255 }).withMessage('El tu00edtulo no puede exceder 255 caracteres'),
    body('descripcion').optional(),
    body('prioridad').optional().isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad invu00e1lida'),
    body('estado').optional().isIn(['pendiente', 'en progreso', 'completada', 'cancelada']).withMessage('Estado invu00e1lido'),
    body('fecha_vencimiento').optional().isDate().withMessage('Formato de fecha invu00e1lido'),
    body('asignado_a').optional().isUUID().withMessage('ID de usuario invu00e1lido'),
    body('posicion').optional().isInt({ min: 0 }).withMessage('La posiciu00f3n debe ser un nu00famero entero no negativo')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud PUT /api/kanban/tareas/${req.params.id} de usuario: ${req.user.id}`);
      
      const tareaActualizada = await actualizarTareaCommand.execute(
        req.params.id,
        req.body,
        req.user.id
      );
      
      res.json(tareaActualizada);
    } catch (error) {
      logger.error(`Error en PUT /api/kanban/tareas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al actualizar la tarea' });
    }
  }
);

/**
 * @route   DELETE /api/kanban/tareas/:id
 * @desc    Eliminar una tarea kanban existente
 * @access  Private
 */
router.delete(
  '/tareas/:id',
  verifyToken,
  [
    param('id').isUUID().withMessage('ID de tarea invu00e1lido'),
    query('eliminar_completa').optional().isBoolean().withMessage('eliminar_completa debe ser un valor booleano')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud DELETE /api/kanban/tareas/${req.params.id} de usuario: ${req.user.id}`);
      
      const eliminarCompleta = req.query.eliminar_completa === 'true';
      
      const resultado = await eliminarTareaCommand.execute(req.params.id, eliminarCompleta, req.user.id);
      
      res.status(200).json({ mensaje: resultado.message });
    } catch (error) {
      logger.error(`Error en DELETE /api/kanban/tareas/${req.params.id}: ${error.message}`);
      
      if (error.message.includes('no encontrada')) {
        return res.status(404).json({ error: error.message });
      }
      
      if (error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al eliminar la tarea' });
    }
  }
);

module.exports = router;
