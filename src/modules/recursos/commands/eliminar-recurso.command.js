/**
 * Comando para eliminar un recurso existente
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
 * Ejecuta el comando para eliminar un recurso existente
 * @param {string} recursoId - ID del recurso a eliminar
 * @param {string} usuarioId - ID del usuario que realiza la eliminación
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
async function execute(recursoId, usuarioId) {
  try {
    logger.info(`Eliminando recurso: ${recursoId} por usuario: ${usuarioId}`);
    
    // Verificar que el recurso existe
    const recurso = await db.oneOrNone(`
      SELECT r.* 
      FROM recursos r
      WHERE r.id = $1
    `, [recursoId]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${recursoId}`);
      throw new Error('Recurso no encontrado');
    }
    
    // Verificar permisos - el usuario debe ser creador del proyecto o miembro de un equipo asociado
    if (recurso.proyecto_id) {
      const tienePermiso = await db.oneOrNone(`
        SELECT 1
        FROM proyectos p
        WHERE p.id = $1 AND (
          p.creado_por = $2 OR
          EXISTS (
            SELECT 1 
            FROM proyecto_equipos pe
            JOIN equipo_usuarios eu ON pe.equipo_id = eu.equipo_id
            WHERE pe.proyecto_id = p.id AND eu.usuario_id = $2
          )
        )
        LIMIT 1
      `, [recurso.proyecto_id, usuarioId]);
      
      if (!tienePermiso) {
        logger.warn(`Usuario ${usuarioId} sin permisos para eliminar el recurso ${recursoId}`);
        throw new Error('Sin permisos para eliminar este recurso');
      }
    }
    
    // Verificar si hay tareas que dependen de este recurso (esto es una validación opcional, ajustar según necesidades)
    const tareasRelacionadas = await db.oneOrNone(`
      SELECT COUNT(*) as total
      FROM tareas
      WHERE proyecto_id = $1 AND estado != 'completada' AND estado != 'cancelada'
    `, [recurso.proyecto_id || '00000000-0000-0000-0000-000000000000']);
    
    if (parseInt(tareasRelacionadas.total) > 0) {
      logger.warn(`No se puede eliminar recurso con tareas pendientes: ${recursoId}`);
      throw new Error(`No se puede eliminar el recurso porque el proyecto tiene ${tareasRelacionadas.total} tareas sin completar. Finalice las tareas primero.`);
    }
    
    // Eliminar el recurso
    await db.none(`
      DELETE FROM recursos 
      WHERE id = $1
    `, [recursoId]);
    
    logger.info(`Recurso eliminado exitosamente: ID=${recursoId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error al eliminar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
