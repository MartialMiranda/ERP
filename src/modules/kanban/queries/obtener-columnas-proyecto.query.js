/**
 * Consulta para obtener todas las columnas Kanban de un proyecto
 * Siguiendo el patru00f3n CQRS para separar operaciones de lectura
 */
const { db } = require('../../../config/database');
const winston = require('winston');

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
 * Obtiene todas las columnas Kanban de un proyecto con sus respectivas tareas
 * @param {string} proyectoId - ID del proyecto
 * @param {string} usuarioId - ID del usuario que solicita la informaciu00f3n
 * @returns {Promise<Array>} - Lista de columnas con sus tareas
 */
async function execute(proyectoId, usuarioId) {
  try {
    logger.info(`Consultando columnas kanban para proyecto: ${proyectoId}, usuario: ${usuarioId}`);
    
    // Verificar que el usuario tiene acceso al proyecto
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM proyectos p
      LEFT JOIN proyecto_equipos pe ON pe.proyecto_id = p.id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON eu.equipo_id = e.id
      WHERE p.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
      LIMIT 1
    `, [proyectoId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto ${proyectoId}`);
      throw new Error('Proyecto no encontrado o sin permisos para acceder');
    }
    
    // Obtener todas las columnas del proyecto ordenadas por posiciu00f3n
    const columnas = await db.manyOrNone(`
      SELECT *
      FROM kanban_columnas
      WHERE proyecto_id = $1
      ORDER BY posicion ASC
    `, [proyectoId]);
    
    if (!columnas || columnas.length === 0) {
      logger.info(`No se encontraron columnas kanban para el proyecto: ${proyectoId}`);
      return [];
    }
    
    // Obtener todas las tareas de las columnas en una sola consulta para optimizar
    const todasLasTareas = await db.manyOrNone(`
      SELECT kt.*, t.titulo, t.descripcion, t.prioridad, t.estado, t.fecha_vencimiento,
             u.nombre as asignado_nombre, u.email as asignado_email
      FROM kanban_tareas kt
      JOIN tareas t ON kt.tarea_id = t.id
      LEFT JOIN usuarios u ON t.asignado_a = u.id
      WHERE kt.columna_id IN (${columnas.map((_, i) => `$${i + 2}`).join(',')})
      ORDER BY kt.posicion ASC
    `, [proyectoId, ...columnas.map(c => c.id)]);
    
    // Agrupar las tareas por columna
    const tareasAgrupadas = todasLasTareas.reduce((acc, tarea) => {
      if (!acc[tarea.columna_id]) {
        acc[tarea.columna_id] = [];
      }
      acc[tarea.columna_id].push(tarea);
      return acc;
    }, {});
    
    // Construir el objeto de respuesta con columnas y sus tareas
    const columnasConTareas = columnas.map(columna => ({
      ...columna,
      tareas: tareasAgrupadas[columna.id] || []
    }));
    
    logger.info(`Columnas kanban obtenidas exitosamente para proyecto: ID=${proyectoId}, total=${columnasConTareas.length}`);
    
    return columnasConTareas;
  } catch (error) {
    logger.error(`Error al obtener columnas kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
