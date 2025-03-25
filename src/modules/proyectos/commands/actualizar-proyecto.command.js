/**
 * Comando para actualizar un proyecto existente
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
 * Ejecuta el comando para actualizar un proyecto existente
 * @param {string} proyectoId - ID del proyecto a actualizar
 * @param {Object} datosActualizados - Datos a actualizar del proyecto
 * @param {string} usuarioId - ID del usuario que realiza la actualización
 * @returns {Promise<Object>} - Proyecto actualizado
 */
async function execute(proyectoId, datosActualizados, usuarioId) {
  try {
    logger.info(`Actualizando proyecto: ${proyectoId} por usuario: ${usuarioId}`);
    
    // Verificar que el proyecto existe y que el usuario tiene permisos
    const proyecto = await db.oneOrNone(`
      SELECT p.* 
      FROM proyectos p
      LEFT JOIN equipo_usuarios eu ON eu.id IN (
        SELECT id FROM equipos WHERE id = p.id
      )
      WHERE p.id = $1 AND (p.creado_por = $2 OR eu.id = $2)
    `, [proyectoId, usuarioId]);
    
    if (!proyecto) {
      logger.warn(`Intento de actualizar proyecto inexistente o sin permisos: ${proyectoId}`);
      throw new Error('Proyecto no encontrado o sin permisos para actualizar');
    }
    
    // Preparar los campos a actualizar
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    // Nombre del proyecto
    if (datosActualizados.nombre !== undefined) {
      updateFields.push(`nombre = $${paramCount++}`);
      updateValues.push(datosActualizados.nombre);
    }
    
    // Descripción del proyecto
    if (datosActualizados.descripcion !== undefined) {
      updateFields.push(`descripcion = $${paramCount++}`);
      updateValues.push(datosActualizados.descripcion);
    }
    
    // Fecha de inicio
    if (datosActualizados.fecha_inicio !== undefined) {
      updateFields.push(`fecha_inicio = $${paramCount++}`);
      updateValues.push(datosActualizados.fecha_inicio);
    }
    
    // Fecha de fin
    if (datosActualizados.fecha_fin !== undefined) {
      updateFields.push(`fecha_fin = $${paramCount++}`);
      updateValues.push(datosActualizados.fecha_fin);
    }
    
    // Estado del proyecto
    if (datosActualizados.estado !== undefined) {
      // Validar que el estado es uno de los permitidos
      const estadosValidos = ['planificado', 'en progreso', 'completado', 'cancelado'];
      if (!estadosValidos.includes(datosActualizados.estado)) {
        logger.warn(`Estado inválido para proyecto: ${datosActualizados.estado}`);
        throw new Error(`Estado de proyecto inválido. Debe ser uno de: ${estadosValidos.join(', ')}`);
      }
      
      updateFields.push(`estado = $${paramCount++}`);
      updateValues.push(datosActualizados.estado);
    }
    
    // Añadir siempre la fecha de actualización
    updateFields.push(`actualizado_en = $${paramCount++}`);
    updateValues.push(new Date());
    
    // Añadir el ID del proyecto para el WHERE
    updateValues.push(proyectoId);
    
    // Ejecutar la actualización
    if (updateFields.length > 0) {
      await db.none(`
        UPDATE proyectos 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
      `, updateValues);
      
      logger.info(`Proyecto actualizado exitosamente: ID=${proyectoId}`);
    } else {
      logger.info(`No se realizaron cambios en el proyecto: ID=${proyectoId}`);
    }
    
    // Recuperar el proyecto actualizado
    const proyectoActualizado = await db.one('SELECT * FROM proyectos WHERE id = $1', [proyectoId]);
    
    return proyectoActualizado;
  } catch (error) {
    logger.error(`Error al actualizar proyecto: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
