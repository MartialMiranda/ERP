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
    
    // Verificar que el recurso existe y que el usuario tiene permisos para actualizarlo
    const recurso = await db.oneOrNone(`
      SELECT * 
      FROM recursos 
      WHERE id = $1 AND creado_por = $2
    `, [recursoId, usuarioId]);
    
    if (!recurso) {
      logger.warn(`Intento de actualizar recurso inexistente o sin permisos: ${recursoId}`);
      throw new Error('Recurso no encontrado o sin permisos para actualizar');
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
    
    // Tipo de recurso
    if (datosActualizados.tipo !== undefined) {
      // Verificar que el tipo es válido
      const tiposValidos = ['humano', 'material', 'tecnologico', 'financiero'];
      if (!tiposValidos.includes(datosActualizados.tipo)) {
        logger.warn(`Tipo de recurso inválido: ${datosActualizados.tipo}`);
        throw new Error(`Tipo de recurso inválido. Debe ser uno de: ${tiposValidos.join(', ')}`);
      }
      
      updateFields.push(`tipo = $${paramCount++}`);
      updateValues.push(datosActualizados.tipo);
    }
    
    // Costo del recurso
    if (datosActualizados.costo !== undefined) {
      updateFields.push(`costo = $${paramCount++}`);
      updateValues.push(datosActualizados.costo);
    }
    
    // Moneda del costo
    if (datosActualizados.moneda !== undefined) {
      updateFields.push(`moneda = $${paramCount++}`);
      updateValues.push(datosActualizados.moneda);
    }
    
    // Disponibilidad del recurso
    if (datosActualizados.disponibilidad !== undefined) {
      // Verificar que la disponibilidad es válida
      const disponibilidadesValidas = ['disponible', 'parcial', 'no disponible'];
      if (!disponibilidadesValidas.includes(datosActualizados.disponibilidad)) {
        logger.warn(`Disponibilidad inválida: ${datosActualizados.disponibilidad}`);
        throw new Error(`Disponibilidad inválida. Debe ser una de: ${disponibilidadesValidas.join(', ')}`);
      }
      
      updateFields.push(`disponibilidad = $${paramCount++}`);
      updateValues.push(datosActualizados.disponibilidad);
    }
    
    // Propiedades del recurso (como JSON)
    if (datosActualizados.propiedades !== undefined) {
      updateFields.push(`propiedades = $${paramCount++}`);
      updateValues.push(datosActualizados.propiedades);
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
      SELECT r.*, 
             u.nombre as creador_nombre
      FROM recursos r
      LEFT JOIN usuarios u ON r.creado_por = u.id
      WHERE r.id = $1
    `, [recursoId]);
    
    // Obtener asignaciones del recurso
    const asignaciones = await db.manyOrNone(`
      SELECT ra.*, 
             e.nombre as equipo_nombre
      FROM recurso_asignaciones ra
      JOIN equipos e ON ra.equipo_id = e.id
      WHERE ra.recurso_id = $1
    `, [recursoId]);
    
    // Construir objeto de respuesta completo
    const recursoCompleto = {
      ...recursoActualizado,
      asignaciones: asignaciones || []
    };
    
    return recursoCompleto;
  } catch (error) {
    logger.error(`Error al actualizar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
