/**
 * Comando para eliminar una columna Kanban
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
 * Ejecuta el comando para eliminar una columna Kanban
 * @param {string} columnaId - ID de la columna a eliminar
 * @param {string} usuarioId - ID del usuario que elimina la columna
 * @returns {Promise<boolean>} - true si la eliminación fue exitosa
 */
async function execute(columnaId, usuarioId) {
  try {
    logger.info(`Eliminando columna kanban ID: ${columnaId} por usuario: ${usuarioId}`);
    
    // Verificar que la columna existe
    const columnaExistente = await db.oneOrNone('SELECT * FROM kanban_columnas WHERE id = $1', [columnaId]);
    
    if (!columnaExistente) {
      logger.warn(`Columna kanban no encontrada: ${columnaId}`);
      throw new Error('Columna kanban no encontrada');
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
    `, [columnaExistente.proyecto_id, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto que contiene la columna ${columnaId}`);
      throw new Error('Sin permisos para eliminar esta columna');
    }
    
    // Iniciar una transacción para asegurar consistencia en la eliminación
    return await db.tx(async (t) => {
      // Eliminar las tareas asociadas a la columna
      await t.none('DELETE FROM kanban_tareas WHERE columna_id = $1', [columnaId]);
      
      // Eliminar la columna
      await t.none('DELETE FROM kanban_columnas WHERE id = $1', [columnaId]);
      
      // Reordenar las posiciones de las columnas restantes
      await t.none(`
        WITH columnas_ordenadas AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY posicion) - 1 as nueva_posicion
          FROM kanban_columnas
          WHERE proyecto_id = $1
        )
        UPDATE kanban_columnas kc
        SET posicion = co.nueva_posicion
        FROM columnas_ordenadas co
        WHERE kc.id = co.id
      `, [columnaExistente.proyecto_id]);
      
      logger.info(`Columna kanban eliminada exitosamente: ID=${columnaId}`);
      return {
        success: true,
        message: `Columna "${columnaExistente.nombre}" eliminada exitosamente`,
        id: columnaId
      };
    });
  } catch (error) {
    logger.error(`Error al eliminar columna kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
