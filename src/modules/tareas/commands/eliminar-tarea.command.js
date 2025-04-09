/**
 * Comando para eliminar una tarea existente
 * Siguiendo el patrón CQRS para separar operaciones de escritura
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
 * Ejecuta el comando para eliminar una tarea existente
 * @param {string} tareaId - ID de la tarea a eliminar
 * @param {string} usuarioId - ID del usuario que realiza la eliminación
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
async function execute(tareaId, usuarioId) {
  try {
    logger.info(`Eliminando tarea: ${tareaId} por usuario: ${usuarioId}`);
    
    // Verificar que la tarea existe y que el usuario tiene permisos para eliminarla
    // Solo el líder del equipo puede eliminar tareas
    const tarea = await db.oneOrNone(`
      SELECT t.* 
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE t.id = $1 AND (
        (eu.usuario_id = $2 AND eu.rol = 'lider')
      )
    `, [tareaId, usuarioId]);
    
    if (!tarea) {
      logger.warn(`Intento de eliminar tarea inexistente o sin permisos: ${tareaId}`);
      throw new Error('Tarea no encontrada o sin permisos para eliminar');
    }
    
    // Comenzar una transacción para eliminar la tarea y sus registros relacionados
    await db.tx(async t => {
      // 1. Eliminar registros de kanban_tareas asociados a la tarea
      await t.none(`
        DELETE FROM kanban_tareas 
        WHERE tarea_id = $1
      `, [tareaId]);
      
      // 2. Eliminar la tarea
      await t.none(`
        DELETE FROM tareas 
        WHERE id = $1
      `, [tareaId]);
    });
    
    logger.info(`Tarea eliminada exitosamente: ID=${tareaId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error al eliminar tarea: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
