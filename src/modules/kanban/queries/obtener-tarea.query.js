/**
 * Consulta para obtener una tarea Kanban especu00edfica por ID
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
 * Obtiene una tarea Kanban especu00edfica por ID
 * @param {string} kanbanTareaId - ID de la tarea kanban
 * @param {string} usuarioId - ID del usuario que solicita la informaciu00f3n
 * @returns {Promise<Object>} - Datos detallados de la tarea
 */
async function execute(kanbanTareaId, usuarioId) {
  try {
    logger.info(`Consultando tarea kanban ID: ${kanbanTareaId} para usuario: ${usuarioId}`);
    
    // Obtener la tarea kanban con toda su informaciu00f3n relacionada
    const tarea = await db.oneOrNone(`
      SELECT kt.*, t.titulo, t.descripcion, t.prioridad, t.estado, t.fecha_vencimiento, 
             t.creado_en, t.actualizado_en, t.proyecto_id,
             u.nombre as asignado_nombre, u.email as asignado_email,
             kc.nombre as columna_nombre
      FROM kanban_tareas kt
      JOIN tareas t ON kt.tarea_id = t.id
      JOIN kanban_columnas kc ON kt.columna_id = kc.id
      LEFT JOIN usuarios u ON t.asignado_a = u.id
      WHERE kt.id = $1
    `, [kanbanTareaId]);
    
    if (!tarea) {
      logger.warn(`Tarea kanban no encontrada: ${kanbanTareaId}`);
      throw new Error('Tarea kanban no encontrada');
    }
    
    // Verificar que el usuario tiene acceso al proyecto
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM proyectos p
      LEFT JOIN proyecto_equipos pe ON pe.proyecto_id = p.id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON eu.equipo_id = e.id
      WHERE p.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
      LIMIT 1
    `, [tarea.proyecto_id, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto que contiene la tarea ${kanbanTareaId}`);
      throw new Error('Tarea kanban no encontrada o sin permisos para acceder');
    }
    
    // Construir el objeto de respuesta
    const tareaDetallada = {
      ...tarea,
    };
    
    logger.info(`Tarea kanban obtenida exitosamente: ID=${kanbanTareaId}`);
    
    return tareaDetallada;
  } catch (error) {
    logger.error(`Error al obtener tarea kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
