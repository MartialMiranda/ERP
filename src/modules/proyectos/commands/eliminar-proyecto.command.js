/**
 * Comando para eliminar un proyecto existente
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
 * Ejecuta el comando para eliminar un proyecto existente
 * @param {string} proyectoId - ID del proyecto a eliminar
 * @param {string} usuarioId - ID del usuario que realiza la eliminación
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 */
async function execute(proyectoId, usuarioId) {
  try {
    logger.info(`Eliminando proyecto: ${proyectoId} por usuario: ${usuarioId}`);
    
    // Verificar que el proyecto existe y que el usuario es el creador
    // Solo el creador puede eliminar un proyecto para mayor seguridad
    const proyecto = await db.oneOrNone(
      'SELECT * FROM proyectos WHERE id = $1 AND creado_por = $2',
      [proyectoId, usuarioId]
    );
    
    if (!proyecto) {
      logger.warn(`Intento de eliminar proyecto inexistente o sin permisos: ${proyectoId}`);
      throw new Error('Proyecto no encontrado o sin permisos para eliminar');
    }
    
    // Comenzar una transacción para eliminar todas las dependencias
    await db.tx(async t => {
      // 1. Eliminar tareas asociadas al proyecto (a través de equipos)
      await t.none(`
        DELETE FROM tareas 
        WHERE id IN (SELECT id FROM equipos WHERE id = $1)
      `, [proyectoId]);
      
      // 2. Eliminar registros de kanban_tareas asociados al proyecto
      await t.none(`
        DELETE FROM kanban_tareas 
        WHERE tarea_id IN (
          SELECT t.id FROM tareas t
          JOIN equipos e ON t.id = e.id
          WHERE e.id = $1
        )
      `, [proyectoId]);
      
      // 3. Eliminar recursos asociados al proyecto
      await t.none(`
        DELETE FROM recursos 
        WHERE id = $1
      `, [proyectoId]);
      
      // 4. Eliminar miembros de equipos asociados al proyecto
      await t.none(`
        DELETE FROM equipo_usuarios 
        WHERE id IN (SELECT id FROM equipos WHERE id = $1)
      `, [proyectoId]);
      
      // 5. Eliminar equipos asociados al proyecto
      await t.none(`
        DELETE FROM equipos 
        WHERE id = $1
      `, [proyectoId]);
      
      // 6. Eliminar reportes asociados al proyecto
      await t.none(`
        DELETE FROM reportes_progreso 
        WHERE id = $1
      `, [proyectoId]);
      
      // 7. Finalmente, eliminar el proyecto
      await t.none(`
        DELETE FROM proyectos 
        WHERE id = $1
      `, [proyectoId]);
    });
    
    logger.info(`Proyecto eliminado exitosamente: ID=${proyectoId}`);
    
    return true;
  } catch (error) {
    logger.error(`Error al eliminar proyecto: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
