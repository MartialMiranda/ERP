/**
 * Comando para eliminar un equipo existente
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
 * Ejecuta el comando para eliminar un equipo existente
 * @param {string} equipoId - ID del equipo a eliminar
 * @param {string} usuarioId - ID del usuario que realiza la eliminación
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
async function execute(equipoId, usuarioId) {
  try {
    logger.info(`Eliminando equipo: ${equipoId} por usuario: ${usuarioId}`);
    
    // Verificar que el equipo existe y que el usuario tiene permisos para eliminarlo
    // Solo el creador del proyecto puede eliminar el equipo
    const equipo = await db.oneOrNone(`
      SELECT e.*, p.creado_por as proyecto_creador
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      WHERE e.id = $1 AND p.creado_por = $2
    `, [equipoId, usuarioId]);
    
    if (!equipo) {
      logger.warn(`Intento de eliminar equipo inexistente o sin permisos: ${equipoId}`);
      throw new Error('Equipo no encontrado o sin permisos para eliminar');
    }
    
    // Verificar si hay tareas asociadas al equipo
    const tareasEquipo = await db.oneOrNone(`
      SELECT COUNT(*) as total
      FROM tareas t
      JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      WHERE pe.equipo_id = $1
    `, [equipoId]);
    
    if (parseInt(tareasEquipo.total) > 0) {
      logger.warn(`No se puede eliminar equipo con tareas pendientes: ${equipoId}`);
      throw new Error(`No se puede eliminar el equipo porque tiene ${tareasEquipo.total} tareas asociadas. Reasigne o elimine las tareas primero.`);
    }
    
    // Comenzar una transacción para eliminar el equipo y sus registros relacionados
    await db.tx(async t => {
      // 1. Eliminar relación con proyectos
      await t.none(`
        DELETE FROM proyecto_equipos 
        WHERE equipo_id = $1
      `, [equipoId]);
      
      // 2. Eliminar miembros del equipo
      await t.none(`
        DELETE FROM equipo_usuarios 
        WHERE equipo_id = $1
      `, [equipoId]);
      
      // 3. Eliminar el equipo
      await t.none(`
        DELETE FROM equipos 
        WHERE id = $1
      `, [equipoId]);
    });
    
    logger.info(`Equipo eliminado exitosamente: ID=${equipoId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error al eliminar equipo: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
