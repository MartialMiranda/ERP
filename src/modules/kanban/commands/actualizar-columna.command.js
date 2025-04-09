/**
 * Comando para actualizar una columna Kanban existente
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
 * Ejecuta el comando para actualizar una columna Kanban existente
 * @param {string} columnaId - ID de la columna a actualizar
 * @param {Object} datosActualizados - Datos actualizados de la columna
 * @param {string} usuarioId - ID del usuario que actualiza la columna
 * @returns {Promise<Object>} - Columna actualizada
 */
async function execute(columnaId, datosActualizados, usuarioId) {
  try {
    logger.info(`Actualizando columna kanban ID: ${columnaId} por usuario: ${usuarioId}`);
    
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
      throw new Error('Sin permisos para modificar esta columna');
    }
    
    // Preparar campos a actualizar
    const camposActualizables = {};
    
    if (datosActualizados.nombre !== undefined) {
      camposActualizables.nombre = datosActualizados.nombre;
    }
    
    if (datosActualizados.posicion !== undefined) {
      camposActualizables.posicion = datosActualizados.posicion;
    }
    
    // Si no hay campos para actualizar, retornar la columna sin cambios
    if (Object.keys(camposActualizables).length === 0) {
      logger.info(`No hay cambios para realizar en la columna ${columnaId}`);
      return columnaExistente;
    }
    
    // Construir la consulta de actualizaciu00f3n dinu00e1micamente
    const updateFields = Object.keys(camposActualizables)
      .map((campo, index) => `${campo} = $${index + 2}`)
      .join(', ');
    
    const updateValues = [columnaId, ...Object.values(camposActualizables)];
    
    // Ejecutar la actualizaciu00f3n
    await db.none(
      `UPDATE kanban_columnas SET ${updateFields} WHERE id = $1`,
      updateValues
    );
    
    // Recuperar la columna actualizada
    const columnaActualizada = await db.one('SELECT * FROM kanban_columnas WHERE id = $1', [columnaId]);
    
    logger.info(`Columna kanban actualizada exitosamente: ID=${columnaId}`);
    
    return columnaActualizada;
  } catch (error) {
    logger.error(`Error al actualizar columna kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
