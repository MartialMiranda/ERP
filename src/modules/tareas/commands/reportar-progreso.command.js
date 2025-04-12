/**
 * Comando para reportar progreso de una tarea
 * Siguiendo el patrón CQRS para separar operaciones de escritura
 */
const { db } = require('../../../config/database');
const winston = require('winston');
const { NotFoundError, ForbiddenError } = require('../../../utils/errors');

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
 * Ejecuta el comando para reportar progreso de una tarea
 * @param {string} tareaId - ID de la tarea
 * @param {Object} datosProgreso - Datos del progreso a reportar
 * @param {string} usuarioId - ID del usuario que reporta el progreso
 * @returns {Promise<Object>} - Detalles del progreso reportado
 */
async function execute(tareaId, datosProgreso, usuarioId) {
  const { comentario, progreso_porcentaje } = datosProgreso;
  
  try {
    logger.info(`Reportando progreso para tarea: ${tareaId} por usuario: ${usuarioId}`);
    
    // Verificar que la tarea existe y que el usuario tiene permisos para reportar progreso
    const tarea = await db.oneOrNone(`
      SELECT t.*, p.creado_por, p.id as proyecto_id, p.nombre as proyecto_nombre  
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      WHERE t.id = $1
    `, [tareaId]);
    
    if (!tarea) {
      logger.warn(`Tarea no encontrada: ${tareaId}`);
      throw new NotFoundError('Tarea no encontrada');
    }
    
    // Verificar que el usuario tiene acceso a esta tarea
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON p.id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE t.id = $1 AND (
        t.asignado_a = $2 OR 
        p.creado_por = $2 OR 
        eu.usuario_id = $2
      )
      LIMIT 1
    `, [tareaId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso para reportar progreso en tarea ${tareaId}`);
      throw new ForbiddenError('No tienes permisos para reportar progreso en esta tarea');
    }
    
    // Validar los datos del progreso
    if (progreso_porcentaje < 0 || progreso_porcentaje > 100) {
      throw new Error('El porcentaje de progreso debe estar entre 0 y 100');
    }
    
    if (!comentario || comentario.trim() === '') {
      throw new Error('El comentario es obligatorio');
    }
    
    // Insertar el reporte de progreso en la base de datos
    const reporteProgreso = await db.one(`
      INSERT INTO reportes_progreso (
        tarea_id, 
        usuario_id, 
        comentario, 
        progreso_porcentaje, 
        creado_en
      )
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, tarea_id, usuario_id, comentario, progreso_porcentaje, creado_en
    `, [tareaId, usuarioId, comentario, progreso_porcentaje]);
    
    logger.info(`Progreso reportado exitosamente para tarea: ${tareaId}, ID del reporte: ${reporteProgreso.id}`);
    
    // Si el progreso es 100%, actualizar el estado de la tarea a completada
    if (progreso_porcentaje === 100 && tarea.estado !== 'completada') {
      await db.none(`
        UPDATE tareas 
        SET estado = 'completada', actualizado_en = NOW() 
        WHERE id = $1
      `, [tareaId]);
      
      logger.info(`Tarea ${tareaId} marcada como completada debido a progreso 100%`);
    }
    
    // Obtener datos complementarios para la respuesta
    const usuarioReportante = await db.oneOrNone(`
      SELECT id, nombre, email 
      FROM usuarios 
      WHERE id = $1
    `, [usuarioId]);
    
    // Retornar el reporte de progreso con datos adicionales
    return {
      ...reporteProgreso,
      tarea: {
        id: tarea.id,
        titulo: tarea.titulo,
        proyecto_id: tarea.proyecto_id,
        proyecto_nombre: tarea.proyecto_nombre
      },
      usuario: usuarioReportante || { id: usuarioId }
    };
  } catch (error) {
    logger.error(`Error al reportar progreso para tarea ${tareaId}: ${error.message}`);
    throw error;
  }
}

module.exports = { execute }; 