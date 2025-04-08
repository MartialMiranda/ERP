/**
 * Consulta para obtener un proyecto específico por ID
 * Siguiendo el patrón CQRS para separar operaciones de lectura
 */
const { db } = require('../../../config/database');
const winston = require('winston');

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
 * Obtiene un proyecto específico por ID
 * @param {string} proyectoId - ID del proyecto
 * @param {string} usuarioId - ID del usuario que solicita la información
 * @returns {Promise<Object>} - Datos del proyecto
 */
async function execute(proyectoId, usuarioId) {
  try {
    logger.info(`Consultando proyecto ID: ${proyectoId} para usuario: ${usuarioId}`);
    
    // Verificar que el usuario tiene acceso al proyecto
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM proyectos p
      LEFT JOIN tareas t ON t.proyecto_id = p.id
      LEFT JOIN equipo_usuarios eu ON eu.usuario_id = $2
      LEFT JOIN equipos e ON e.id = eu.equipo_id
      WHERE p.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
      LIMIT 1
    `, [proyectoId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto ${proyectoId}`);
      throw new Error('Proyecto no encontrado o sin permisos para acceder');
    }
    
    // Obtener información completa del proyecto
    const proyecto = await db.oneOrNone(`
      SELECT p.*, 
             u.nombre as creador_nombre, 
             u.email as creador_email
      FROM proyectos p
      JOIN usuarios u ON p.creado_por = u.id
      WHERE p.id = $1
    `, [proyectoId]);
    
    if (!proyecto) {
      logger.warn(`Proyecto no encontrado: ${proyectoId}`);
      throw new Error('Proyecto no encontrado');
    }
    
    // Obtener equipos asociados al proyecto
    const equipos = await db.manyOrNone(`
      SELECT DISTINCT e.*, COUNT(eu.id) as total_miembros
      FROM equipos e
      JOIN equipo_usuarios eu ON eu.equipo_id = e.id
      JOIN tareas t ON t.proyecto_id = $1
      WHERE e.id IN (
        SELECT eu2.equipo_id 
        FROM equipo_usuarios eu2
        WHERE eu2.equipo_id = e.id
      )
      GROUP BY e.id
    `, [proyectoId]);
    
    // Obtener estadísticas de tareas del proyecto
    const estadisticasTareas = await db.oneOrNone(`
      SELECT 
        COUNT(t.id) as total_tareas,
        COUNT(CASE WHEN t.estado = 'pendiente' THEN 1 END) as tareas_pendientes,
        COUNT(CASE WHEN t.estado = 'en progreso' THEN 1 END) as tareas_en_progreso,
        COUNT(CASE WHEN t.estado = 'completada' THEN 1 END) as tareas_completadas,
        COUNT(CASE WHEN t.estado = 'cancelada' THEN 1 END) as tareas_canceladas
      FROM tareas t
      WHERE t.proyecto_id = $1
    `, [proyectoId]);
    
    // Calcular el progreso general del proyecto
    const progreso = estadisticasTareas.total_tareas > 0 ? 
      Math.round((estadisticasTareas.tareas_completadas / estadisticasTareas.total_tareas) * 100) : 0;
    
    // Obtener recursos asociados al proyecto
    const recursos = await db.manyOrNone(`
      SELECT * FROM recursos WHERE proyecto_id = $1
    `, [proyectoId]);
    
    // Obtener columnas kanban del proyecto
    const columnasKanban = await db.manyOrNone(`
      SELECT * FROM kanban_columnas WHERE proyecto_id = $1 ORDER BY posicion ASC
    `, [proyectoId]);
    
    // Construir el objeto de respuesta
    const proyectoDetallado = {
      ...proyecto,
      equipos,
      estadisticas_tareas: estadisticasTareas,
      progreso,
      recursos,
      columnas_kanban: columnasKanban
    };
    
    logger.info(`Proyecto obtenido exitosamente: ID=${proyectoId}`);
    
    return proyectoDetallado;
  } catch (error) {
    logger.error(`Error al obtener proyecto: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
