/**
 * Rutas para el módulo de Reportes
 * Maneja todas las operaciones relacionadas con generación de informes y estadísticas
 */
const express = require('express');
const { query, param, validationResult } = require('express-validator');
const rendimientoEquiposQuery = require('../modules/reportes/queries/rendimiento-equipos.query');
const usoRecursosQuery = require('../modules/reportes/queries/uso-recursos.query');
const progresoTareasQuery = require('../modules/reportes/queries/progreso-tareas.query');
const { verifyToken } = require('../middleware/auth.middleware');
const winston = require('winston');
const { ForbiddenError } = require('../utils/errors');

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
 * @route   GET /api/reportes/equipos
 * @desc    Generar informe de rendimiento de equipos
 * @access  Private
 */
router.get(
  '/equipos',
  verifyToken,
  [
    query('proyecto_id').optional().isUUID().withMessage('ID de proyecto inválido'),
    query('periodo').optional().isIn(['semana', 'mes', 'trimestre', 'semestre', 'año', 'personalizado']).withMessage('Período inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de inicio'),
    query('fecha_fin').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de fin')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/reportes/equipos de usuario: ${req.user.id}`);
      
      // Construir filtros desde parámetros de consulta
      const filtros = {
        proyecto_id: req.query.proyecto_id,
        periodo: req.query.periodo || 'mes',
        fecha_inicio: req.query.fecha_inicio,
        fecha_fin: req.query.fecha_fin
      };
      
      // Generar informe mediante la consulta
      const informe = await rendimientoEquiposQuery.execute(filtros, req.user.id);
      
      res.json(informe);
    } catch (error) {
      logger.error(`Error en GET /api/reportes/equipos: ${error.message}`);
      
      if (error.message.includes('Sin permisos') || error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al generar el informe de rendimiento de equipos' });
    }
  }
);

/**
 * @route   GET /api/reportes/recursos
 * @desc    Generar informe de uso de recursos
 * @access  Private
 */
router.get(
  '/recursos',
  verifyToken,
  [
    query('proyecto_id').optional().isUUID().withMessage('ID de proyecto inválido'),
    query('tipo').optional().isString().withMessage('Filtro de recurso inválido'),
    query('periodo').optional().isIn(['semana', 'mes', 'trimestre', 'semestre', 'año', 'personalizado']).withMessage('Período inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de inicio'),
    query('fecha_fin').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de fin')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/reportes/recursos de usuario: ${req.user.id}`);
      
      // Construir filtros desde parámetros de consulta
      const filtros = {
        proyecto_id: req.query.proyecto_id,
        tipo: req.query.tipo,
        periodo: req.query.periodo || 'mes',
        fecha_inicio: req.query.fecha_inicio,
        fecha_fin: req.query.fecha_fin
      };
      
      // Generar informe mediante la consulta
      const informe = await usoRecursosQuery.execute(filtros, req.user.id);
      
      res.json(informe);
    } catch (error) {
      logger.error(`Error en GET /api/reportes/recursos: ${error.message}`);
      
      if (error.message.includes('Sin permisos') || error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al generar el informe de uso de recursos' });
    }
  }
);

/**
 * @route   GET /api/reportes/progreso-tareas
 * @desc    Generar informe de progreso de tareas
 * @access  Private
 */
router.get(
  '/progreso-tareas',
  verifyToken,
  [
    query('proyecto_id').optional().isUUID().withMessage('ID de proyecto inválido'),
    query('tarea_id').optional().isUUID().withMessage('ID de tarea inválido'),
    query('periodo').optional().isIn(['semana', 'mes', 'trimestre', 'semestre', 'año', 'personalizado']).withMessage('Período inválido'),
    query('fecha_inicio').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de inicio'),
    query('fecha_fin').optional().isISO8601().withMessage('Formato de fecha inválido para fecha de fin')
  ],
  validarErrores,
  async (req, res) => {
    try {
      logger.info(`Solicitud GET /api/reportes/progreso-tareas de usuario: ${req.user.id}`);
      
      // Construir filtros desde parámetros de consulta
      const filtros = {
        proyecto_id: req.query.proyecto_id,
        tarea_id: req.query.tarea_id,
        periodo: req.query.periodo || 'mes',
        fecha_inicio: req.query.fecha_inicio,
        fecha_fin: req.query.fecha_fin
      };
      
      // Generar informe mediante la consulta
      const informe = await progresoTareasQuery.execute(filtros, req.user.id);
      
      res.json(informe);
    } catch (error) {
      logger.error(`Error en GET /api/reportes/progreso-tareas: ${error.message}`);
      
      if (error.message.includes('Sin permisos') || error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      if (error.message.includes('no encontrado')) {
        return res.status(404).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al generar el informe de progreso de tareas' });
    }
  }
);

/**
 * @route   GET /api/reportes/exportar/:tipo
 * @desc    Exportar informe en formato CSV o Excel
 * @access  Private
 */
router.get(
  '/exportar/:tipo',
  verifyToken,
  async (req, res) => {
    try {
      const tipoInforme = req.params.tipo;
      const formatoExportacion = req.query.formato || 'csv';
      
      logger.info(`Solicitud GET /api/reportes/exportar/${tipoInforme} en formato ${formatoExportacion} de usuario: ${req.user.id}`);
      
      // Validar tipo de informe
      if (!['equipos', 'recursos', 'progreso-tareas'].includes(tipoInforme)) {
        return res.status(400).json({ error: 'Tipo de informe inválido. Debe ser "equipos", "recursos" o "progreso-tareas"' });
      }
      
      // Validar formato de exportación
      if (!['csv', 'excel'].includes(formatoExportacion)) {
        return res.status(400).json({ error: 'Formato de exportación inválido. Debe ser "csv" o "excel"' });
      }
      
      // Redirigir a la generación del informe correspondiente primero
      let informe;
      const filtros = {
        proyecto_id: req.query.proyecto_id,
        tarea_id: req.query.tarea_id,
        tipo: req.query.tipo,
        periodo: req.query.periodo || 'mes',
        fecha_inicio: req.query.fecha_inicio,
        fecha_fin: req.query.fecha_fin
      };
      
      if (tipoInforme === 'equipos') {
        informe = await rendimientoEquiposQuery.execute(filtros, req.user.id);
      } else if (tipoInforme === 'recursos') {
        informe = await usoRecursosQuery.execute(filtros, req.user.id);
      } else if (tipoInforme === 'progreso-tareas') {
        informe = await progresoTareasQuery.execute(filtros, req.user.id);
      }
      
      // Implementación simple de exportación a CSV
      if (formatoExportacion === 'csv') {
        // Función para convertir datos a CSV
        const convertirACSV = (data) => {
          // Determinar qué datos exportar según el tipo de informe
          let items = [];
          
          if (tipoInforme === 'equipos') {
            items = data.equipos || [];
          } else if (tipoInforme === 'recursos') {
            items = data.recursos || [];
          } else if (tipoInforme === 'progreso-tareas') {
            // Para progreso de tareas, exportar cada reporte de progreso
            const todasLasTareas = data.tareas || [];
            items = todasLasTareas.reduce((acc, tarea) => {
              const reportesTarea = (tarea.reportes || []).map(reporte => ({
                tarea_id: tarea.tarea_id,
                tarea_titulo: tarea.tarea_titulo,
                proyecto_id: tarea.proyecto_id,
                proyecto_nombre: tarea.proyecto_nombre,
                ...reporte
              }));
              return [...acc, ...reportesTarea];
            }, []);
          }
          
          if (!items || items.length === 0) {
            return 'No hay datos disponibles';
          }
          
          // Obtener las cabeceras del primer elemento
          const headers = Object.keys(items[0] || {}).join(',');
          
          // Generar las filas
          const rows = items.map(item => {
            return Object.values(item).map(val => {
              // Manejar valores especiales
              if (val === null || val === undefined) return '';
              if (typeof val === 'object') return JSON.stringify(val);
              return val;
            }).join(',');
          }).join('\n');
          
          return `${headers}\n${rows}`;
        };
        
        const csvData = convertirACSV(informe);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=informe_${tipoInforme}_${Date.now()}.csv`);
        return res.send(csvData);
      }
      
      // Si es excel, por ahora solo devolvemos JSON
      res.json({
        mensaje: `Exportación de informe de ${tipoInforme} en formato ${formatoExportacion} generada correctamente`,
        datos: informe
      });
    } catch (error) {
      logger.error(`Error en GET /api/reportes/exportar/${req.params.tipo}: ${error.message}`);
      
      if (error.message.includes('Sin permisos') || error.message.includes('sin permisos')) {
        return res.status(403).json({ error: error.message });
      }
      
      res.status(500).json({ error: 'Error al exportar el informe' });
    }
  }
);

module.exports = router;
