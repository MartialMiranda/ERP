/**
 * Comando para asignar un recurso a un equipo
 * Siguiendo el patrón CQRS para separar operaciones de escritura
 */
const { db } = require('../../../config/database');
const { v4: uuidv4 } = require('uuid');
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
 * Ejecuta el comando para asignar un recurso a un equipo
 * @param {Object} asignacion - Datos de la asignación
 * @param {string} usuarioId - ID del usuario que realiza la asignación
 * @returns {Promise<Object>} - Asignación creada
 */
async function execute(asignacion, usuarioId) {
  try {
    logger.info(`Asignando recurso: ${asignacion.recurso_id} al equipo: ${asignacion.equipo_id} por usuario: ${usuarioId}`);
    
    // Verificar que el recurso existe
    const recurso = await db.oneOrNone(`
      SELECT * FROM recursos WHERE id = $1
    `, [asignacion.recurso_id]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${asignacion.recurso_id}`);
      throw new Error('Recurso no encontrado');
    }
    
    // Verificar que el equipo existe
    const equipo = await db.oneOrNone(`
      SELECT * FROM equipos WHERE id = $1
    `, [asignacion.equipo_id]);
    
    if (!equipo) {
      logger.warn(`Equipo no encontrado: ${asignacion.equipo_id}`);
      throw new Error('Equipo no encontrado');
    }
    
    // Verificar que el usuario tiene permiso para asignar recursos a este equipo
    // (debe ser el creador del recurso, el líder del equipo o un administrador)
    const tienePermiso = await db.oneOrNone(`
      SELECT 1 
      FROM equipos e 
      JOIN recursos r ON 1=1
      WHERE e.id = $1 AND r.id = $2 AND (e.lider_id = $3 OR r.creado_por = $3)
      LIMIT 1
    `, [asignacion.equipo_id, asignacion.recurso_id, usuarioId]);
    
    if (!tienePermiso) {
      logger.warn(`Usuario ${usuarioId} sin permiso para asignar recurso ${asignacion.recurso_id} al equipo ${asignacion.equipo_id}`);
      throw new Error('Sin permisos para asignar este recurso a este equipo');
    }
    
    // Verificar la disponibilidad del recurso si no es tipo 'material'
    if (recurso.tipo !== 'material') {
      const asignacionesActivas = await db.oneOrNone(`
        SELECT COUNT(*) as total 
        FROM recurso_asignaciones 
        WHERE recurso_id = $1 AND (fecha_fin IS NULL OR fecha_fin > CURRENT_DATE)
      `, [asignacion.recurso_id]);
      
      if (parseInt(asignacionesActivas.total) > 0) {
        logger.warn(`Recurso ${asignacion.recurso_id} ya asignado y no es de tipo material`);
        throw new Error('Este recurso ya está asignado y no es de tipo material que permita múltiples asignaciones');
      }
    }
    
    // Preparar los datos de la asignación
    const asignacionId = uuidv4();
    const fechaInicio = asignacion.fecha_inicio ? new Date(asignacion.fecha_inicio) : new Date();
    const fechaFin = asignacion.fecha_fin ? new Date(asignacion.fecha_fin) : null;
    
    // Validar las fechas
    if (fechaFin && fechaInicio > fechaFin) {
      logger.warn(`Fechas inválidas: inicio ${fechaInicio} posterior a fin ${fechaFin}`);
      throw new Error('La fecha de inicio no puede ser posterior a la fecha de fin');
    }
    
    // Crear la asignación
    await db.none(`
      INSERT INTO recurso_asignaciones (
        id, recurso_id, equipo_id, 
        cantidad, fecha_inicio, fecha_fin,
        notas, creado_por, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `, [
      asignacionId,
      asignacion.recurso_id,
      asignacion.equipo_id,
      asignacion.cantidad || 1,
      fechaInicio,
      fechaFin,
      asignacion.notas || null,
      usuarioId,
      new Date(),
      new Date()
    ]);
    
    // Actualizar la disponibilidad del recurso si es necesario
    if (recurso.tipo !== 'material' || (recurso.tipo === 'material' && asignacion.cantidad >= recurso.propiedades.cantidad_total)) {
      await db.none(`
        UPDATE recursos 
        SET disponibilidad = 'no disponible', actualizado_en = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [asignacion.recurso_id]);
      
      logger.info(`Actualizada disponibilidad del recurso ${asignacion.recurso_id} a 'no disponible'`);
    } else if (recurso.disponibilidad === 'disponible') {
      await db.none(`
        UPDATE recursos 
        SET disponibilidad = 'parcial', actualizado_en = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [asignacion.recurso_id]);
      
      logger.info(`Actualizada disponibilidad del recurso ${asignacion.recurso_id} a 'parcial'`);
    }
    
    // Recuperar la asignación creada para devolverla
    const asignacionCreada = await db.one(`
      SELECT ra.*, 
             r.nombre as recurso_nombre, r.tipo as recurso_tipo,
             e.nombre as equipo_nombre
      FROM recurso_asignaciones ra
      JOIN recursos r ON ra.recurso_id = r.id
      JOIN equipos e ON ra.equipo_id = e.id
      WHERE ra.id = $1
    `, [asignacionId]);
    
    logger.info(`Asignación creada exitosamente: ID=${asignacionId}`);
    
    return asignacionCreada;
  } catch (error) {
    logger.error(`Error al asignar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
