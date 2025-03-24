/**
 * Comando para finalizar una asignación de recurso
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
 * Ejecuta el comando para finalizar una asignación de recurso
 * @param {string} asignacionId - ID de la asignación
 * @param {string} tipo - Tipo de asignación ('equipo' o 'tarea')
 * @param {Object} datos - Datos adicionales (motivo, evaluación, etc.)
 * @param {string} usuarioId - ID del usuario que finaliza la asignación
 * @returns {Promise<Object>} - Asignación finalizada
 */
async function execute(asignacionId, tipo, datos, usuarioId) {
  try {
    logger.info(`Finalizando asignación de recurso: ${asignacionId} (tipo: ${tipo}) por usuario: ${usuarioId}`);
    
    let asignacion;
    let recursoId;
    let tabla;
    let condicionPermisos;
    
    // Determinar la tabla y condiciones según el tipo de asignación
    if (tipo === 'equipo') {
      tabla = 'recurso_asignaciones';
      
      // Obtener datos de la asignación
      asignacion = await db.oneOrNone(`
        SELECT ra.*, e.lider_id, r.creado_por as recurso_creador, r.id as recurso_id, r.tipo
        FROM recurso_asignaciones ra
        JOIN equipos e ON ra.equipo_id = e.id
        JOIN recursos r ON ra.recurso_id = r.id
        WHERE ra.id = $1
      `, [asignacionId]);
      
      if (!asignacion) {
        logger.warn(`Asignación de equipo no encontrada: ${asignacionId}`);
        throw new Error('Asignación no encontrada');
      }
      
      // Verificar permisos (creador del recurso o líder del equipo)
      condicionPermisos = (asignacion.recurso_creador === usuarioId || asignacion.lider_id === usuarioId);
      recursoId = asignacion.recurso_id;
    } else if (tipo === 'tarea') {
      tabla = 'tarea_recursos';
      
      // Obtener datos de la asignación
      asignacion = await db.oneOrNone(`
        SELECT tr.*, t.creado_por as tarea_creador, t.asignado_a, 
               p.lider_id, r.creado_por as recurso_creador, r.id as recurso_id, r.tipo
        FROM tarea_recursos tr
        JOIN tareas t ON tr.tarea_id = t.id
        JOIN proyectos p ON t.proyecto_id = p.id
        JOIN recursos r ON tr.recurso_id = r.id
        WHERE tr.id = $1
      `, [asignacionId]);
      
      if (!asignacion) {
        logger.warn(`Asignación de tarea no encontrada: ${asignacionId}`);
        throw new Error('Asignación no encontrada');
      }
      
      // Verificar permisos (varios roles pueden finalizar la asignación)
      condicionPermisos = (
        asignacion.recurso_creador === usuarioId || 
        asignacion.tarea_creador === usuarioId || 
        asignacion.asignado_a === usuarioId || 
        asignacion.lider_id === usuarioId
      );
      recursoId = asignacion.recurso_id;
    } else {
      logger.warn(`Tipo de asignación inválido: ${tipo}`);
      throw new Error('Tipo de asignación inválido. Debe ser "equipo" o "tarea"');
    }
    
    // Verificar permisos
    if (!condicionPermisos) {
      logger.warn(`Usuario ${usuarioId} sin permisos para finalizar asignación ${asignacionId}`);
      throw new Error('Sin permisos para finalizar esta asignación');
    }
    
    // Verificar que la asignación no esté ya finalizada
    if (tipo === 'equipo' && asignacion.fecha_fin && new Date(asignacion.fecha_fin) <= new Date()) {
      logger.warn(`Asignación ${asignacionId} ya está finalizada`);
      throw new Error('Esta asignación ya está finalizada');
    } else if (tipo === 'tarea' && asignacion.estado === 'finalizado') {
      logger.warn(`Asignación ${asignacionId} ya está finalizada`);
      throw new Error('Esta asignación ya está finalizada');
    }
    
    // Actualizar la asignación
    if (tipo === 'equipo') {
      await db.none(`
        UPDATE recurso_asignaciones
        SET fecha_fin = CURRENT_DATE, 
            notas = CASE WHEN $1::text IS NOT NULL THEN $1 ELSE notas END,
            actualizado_en = CURRENT_TIMESTAMP,
            actualizado_por = $2
        WHERE id = $3
      `, [datos.notas || null, usuarioId, asignacionId]);
    } else {
      await db.none(`
        UPDATE tarea_recursos
        SET estado = 'finalizado', 
            fecha_fin = CURRENT_DATE,
            evaluacion = $1,
            notas = CASE WHEN $2::text IS NOT NULL THEN $2 ELSE notas END,
            actualizado_en = CURRENT_TIMESTAMP,
            actualizado_por = $3
        WHERE id = $4
      `, [datos.evaluacion || null, datos.notas || null, usuarioId, asignacionId]);
    }
    
    // Verificar si hay otras asignaciones activas para este recurso
    const asignacionesActivasEquipo = await db.oneOrNone(`
      SELECT COUNT(*) as total FROM recurso_asignaciones
      WHERE recurso_id = $1 AND (fecha_fin IS NULL OR fecha_fin > CURRENT_DATE)
    `, [recursoId]);
    
    const asignacionesActivasTarea = await db.oneOrNone(`
      SELECT COUNT(*) as total FROM tarea_recursos
      WHERE recurso_id = $1 AND estado = 'activo'
    `, [recursoId]);
    
    // Si no hay otras asignaciones activas, actualizar el recurso a disponible
    const totalAsignacionesEquipo = asignacionesActivasEquipo ? parseInt(asignacionesActivasEquipo.total) : 0;
    const totalAsignacionesTarea = asignacionesActivasTarea ? parseInt(asignacionesActivasTarea.total) : 0;
    
    if (totalAsignacionesEquipo + totalAsignacionesTarea === 0) {
      await db.none(`
        UPDATE recursos
        SET disponibilidad = 'disponible',
            actualizado_en = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [recursoId]);
      
      logger.info(`Recurso ${recursoId} marcado como disponible`);
    }
    
    // Obtener la asignación actualizada
    let asignacionFinalizada;
    if (tipo === 'equipo') {
      asignacionFinalizada = await db.one(`
        SELECT ra.*, 
               r.nombre as recurso_nombre, 
               e.nombre as equipo_nombre
        FROM recurso_asignaciones ra
        JOIN recursos r ON ra.recurso_id = r.id
        JOIN equipos e ON ra.equipo_id = e.id
        WHERE ra.id = $1
      `, [asignacionId]);
    } else {
      asignacionFinalizada = await db.one(`
        SELECT tr.*, 
               r.nombre as recurso_nombre, 
               t.nombre as tarea_nombre
        FROM tarea_recursos tr
        JOIN recursos r ON tr.recurso_id = r.id
        JOIN tareas t ON tr.tarea_id = t.id
        WHERE tr.id = $1
      `, [asignacionId]);
    }
    
    logger.info(`Asignación finalizada exitosamente: ID=${asignacionId}`);
    
    return asignacionFinalizada;
  } catch (error) {
    logger.error(`Error al finalizar asignación: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
