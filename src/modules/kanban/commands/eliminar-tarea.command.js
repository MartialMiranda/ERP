/**
 * Comando para eliminar una tarea Kanban
 * Siguiendo el patru00f3n CQRS para separar operaciones de escritura
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
 * Ejecuta el comando para eliminar una tarea Kanban
 * @param {string} kanbanTareaId - ID de la tarea kanban a eliminar
 * @param {boolean} eliminarTareaCompleta - Si es true, elimina tambiu00e9n la tarea asociada, no solo su referencia en el kanban
 * @param {string} usuarioId - ID del usuario que elimina la tarea
 * @returns {Promise<object>} - objeto con informaciu00f3n sobre la eliminaciu00f3n
 */
async function execute(kanbanTareaId, eliminarTareaCompleta, usuarioId) {
  try {
    logger.info(`Eliminando tarea kanban ID: ${kanbanTareaId} por usuario: ${usuarioId}. Eliminar tarea completa: ${eliminarTareaCompleta}`);
    
    // Verificar que la tarea kanban existe
    const tareaKanban = await db.oneOrNone(`
      SELECT kt.*, t.proyecto_id
      FROM kanban_tareas kt
      JOIN tareas t ON kt.tarea_id = t.id
      WHERE kt.id = $1
    `, [kanbanTareaId]);
    
    if (!tareaKanban) {
      logger.warn(`Tarea kanban no encontrada: ${kanbanTareaId}`);
      throw new Error('Tarea kanban no encontrada');
    }
    
    // Verificar que el usuario tiene permisos en el proyecto
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM proyectos p
      LEFT JOIN proyecto_equipos pe ON pe.proyecto_id = p.id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON eu.equipo_id = e.id
      WHERE p.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
      LIMIT 1
    `, [tareaKanban.proyecto_id, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto que contiene la tarea ${kanbanTareaId}`);
      throw new Error('Sin permisos para eliminar esta tarea');
    }
    
    // Obtener la columna y guardar su ID para reordenar despuu00e9s
    const columnaId = tareaKanban.columna_id;
    const tareaId = tareaKanban.tarea_id;
    
    // Iniciar una transacciu00f3n para asegurar consistencia en la eliminaciu00f3n
    return await db.tx(async (t) => {
      // Eliminar la referencia en kanban_tareas
      await t.none('DELETE FROM kanban_tareas WHERE id = $1', [kanbanTareaId]);
      
      // Si se solicitu00f3 eliminar la tarea completa, eliminarla de la tabla tareas
      if (eliminarTareaCompleta) {
        await t.none('DELETE FROM tareas WHERE id = $1', [tareaId]);
        logger.info(`Tarea eliminada completamente: ID=${tareaId}`);
      }
      
      // Reordenar las posiciones de las tareas restantes en la columna
      await t.none(`
        WITH tareas_ordenadas AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY posicion) - 1 as nueva_posicion
          FROM kanban_tareas
          WHERE columna_id = $1
        )
        UPDATE kanban_tareas kt
        SET posicion = tord.nueva_posicion
        FROM tareas_ordenadas tord
        WHERE kt.id = tord.id
      `, [columnaId]);
      
      logger.info(`Tarea kanban eliminada exitosamente: ID=${kanbanTareaId}`);
      return {
        success: true,
        message: eliminarTareaCompleta 
          ? "Tarea eliminada completamente" 
          : "Tarea eliminada del tablero Kanban",
        id: kanbanTareaId,
        tarea_id: tareaId
      };
    });
  } catch (error) {
    logger.error(`Error al eliminar tarea kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
