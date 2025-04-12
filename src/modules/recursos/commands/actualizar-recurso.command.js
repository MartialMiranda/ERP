/**
 * Comando para actualizar un recurso existente
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
 * Ejecuta el comando para actualizar un recurso existente
 * @param {string} recursoId - ID del recurso a actualizar
 * @param {Object} datosActualizados - Datos a actualizar del recurso
 * @param {string} usuarioId - ID del usuario que realiza la actualización
 * @returns {Promise<Object>} - Recurso actualizado
 */
async function execute(recursoId, datosActualizados, usuarioId) {
  try {
    logger.info(`Actualizando recurso: ${recursoId} por usuario: ${usuarioId}`);
    
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
        logger.warn(`Usuario ${usuarioId} sin permisos para actualizar el recurso ${recursoId}`);
        throw new Error('Sin permisos para actualizar este recurso');
      }
    }
    
    // Preparar los campos a actualizar
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    // Nombre del recurso
    if (datosActualizados.nombre !== undefined) {
      updateFields.push(`nombre = $${paramCount++}`);
      updateValues.push(datosActualizados.nombre);
    }
    
    // Descripción del recurso
    if (datosActualizados.descripcion !== undefined) {
      updateFields.push(`descripcion = $${paramCount++}`);
      updateValues.push(datosActualizados.descripcion);
    }
    
    // Cantidad del recurso
    if (datosActualizados.cantidad !== undefined) {
      updateFields.push(`cantidad = $${paramCount++}`);
      updateValues.push(datosActualizados.cantidad);
    }
    
    // Proyecto al que pertenece el recurso
    if (datosActualizados.proyecto_id !== undefined) {
      // Verificar que el proyecto existe
      const proyectoExiste = await db.oneOrNone(`
        SELECT id FROM proyectos WHERE id = $1
      `, [datosActualizados.proyecto_id]);
      
      if (!proyectoExiste && datosActualizados.proyecto_id !== null) {
        logger.warn(`Proyecto no encontrado: ${datosActualizados.proyecto_id}`);
        throw new Error('Proyecto especificado no encontrado');
      }
      
      updateFields.push(`proyecto_id = $${paramCount++}`);
      updateValues.push(datosActualizados.proyecto_id);
    }
    
    // Añadir siempre la fecha de actualización
    updateFields.push(`actualizado_en = $${paramCount++}`);
    updateValues.push(new Date());
    
    // Añadir el ID del recurso para el WHERE
    updateValues.push(recursoId);
    
    // Ejecutar la actualización
    if (updateFields.length > 0) {
      await db.none(`
        UPDATE recursos 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
      `, updateValues);
      
      logger.info(`Recurso actualizado exitosamente: ID=${recursoId}`);
    } else {
      logger.info(`No se realizaron cambios en el recurso: ID=${recursoId}`);
    }
    
    // Recuperar el recurso actualizado
    const recursoActualizado = await db.one(`
      SELECT r.*
      FROM recursos r
      WHERE r.id = $1
    `, [recursoId]);
    
    // Obtener información del proyecto (si existe)
    let proyecto = null;
    if (recursoActualizado.proyecto_id) {
      proyecto = await db.oneOrNone(`
        SELECT p.*, u.nombre as creador_nombre
        FROM proyectos p
        LEFT JOIN usuarios u ON p.creado_por = u.id
        WHERE p.id = $1
      `, [recursoActualizado.proyecto_id]);
      
      // Obtener equipos asociados al proyecto
      if (proyecto) {
        proyecto.equipos = await db.manyOrNone(`
          SELECT e.id, e.nombre, 
                 (
                   SELECT COUNT(eu.id) 
                   FROM equipo_usuarios eu 
                   WHERE eu.equipo_id = e.id
                 ) as total_miembros
          FROM equipos e
          JOIN proyecto_equipos pe ON e.id = pe.equipo_id
          WHERE pe.proyecto_id = $1
          ORDER BY e.nombre ASC
        `, [proyecto.id]);
      }
    }
    
    // Construir objeto de respuesta completo
    const recursoCompleto = {
      ...recursoActualizado,
      proyecto: proyecto,
      disponibilidad: recursoActualizado.cantidad > 0 ? 'disponible' : 'agotado'
    };
    
    return recursoCompleto;
  } catch (error) {
    logger.error(`Error al actualizar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
