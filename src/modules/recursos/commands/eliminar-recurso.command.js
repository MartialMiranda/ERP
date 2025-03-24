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
    
    // Verificar que el recurso existe y que el usuario tiene permisos para eliminarlo
    const recurso = await db.oneOrNone(`
      SELECT * 
      FROM recursos 
      WHERE id = $1 AND creado_por = $2
    `, [recursoId, usuarioId]);
    
    if (!recurso) {
      logger.warn(`Intento de eliminar recurso inexistente o sin permisos: ${recursoId}`);
      throw new Error('Recurso no encontrado o sin permisos para eliminar');
    }
    
    // Verificar si el recurso está asignado a algún equipo actualmente
    const asignacionesActivas = await db.oneOrNone(`
      SELECT COUNT(*) as total
      FROM recurso_asignaciones
      WHERE recurso_id = $1 AND (fecha_fin IS NULL OR fecha_fin > CURRENT_DATE)
    `, [recursoId]);
    
    if (parseInt(asignacionesActivas.total) > 0) {
      logger.warn(`No se puede eliminar recurso con asignaciones activas: ${recursoId}`);
      throw new Error(`No se puede eliminar el recurso porque tiene ${asignacionesActivas.total} asignaciones activas. Finalice las asignaciones primero.`);
    }
    
    // Comenzar una transacción para eliminar el recurso y sus registros relacionados
    await db.tx(async t => {
      // 1. Eliminar todas las asignaciones históricas del recurso
      await t.none(`
        DELETE FROM recurso_asignaciones 
        WHERE recurso_id = $1
      `, [recursoId]);
      
      // 2. Eliminar el recurso
      await t.none(`
        DELETE FROM recursos 
        WHERE id = $1
      `, [recursoId]);
    });
    
    logger.info(`Recurso eliminado exitosamente: ID=${recursoId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error al eliminar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
