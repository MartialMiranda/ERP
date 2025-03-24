/**
 * Comando para asignar un recurso a una tarea específica
 * Implementa el patrón CQRS para separar operaciones de escritura
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
 * Ejecuta el comando para asignar un recurso a una tarea específica
 * @param {Object} asignacion - Datos de la asignación
 * @param {string} usuarioId - ID del usuario que realiza la asignación
 * @returns {Promise<Object>} - Asignación creada
 */
async function execute(asignacion, usuarioId) {
  try {
    logger.info(`Asignando recurso: ${asignacion.recurso_id} a la tarea: ${asignacion.tarea_id} por usuario: ${usuarioId}`);
    
    // Verificar que el recurso existe
    const recurso = await db.oneOrNone(`
      SELECT * FROM recursos WHERE id = $1
    `, [asignacion.recurso_id]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${asignacion.recurso_id}`);
      throw new Error('Recurso no encontrado');
    }
    
    // Verificar que la tarea existe
    const tarea = await db.oneOrNone(`
      SELECT t.*, p.id as proyecto_id 
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      WHERE t.id = $1
    `, [asignacion.tarea_id]);
    
    if (!tarea) {
      logger.warn(`Tarea no encontrada: ${asignacion.tarea_id}`);
      throw new Error('Tarea no encontrada');
    }
    
    // Verificar que el usuario tiene permiso para asignar recursos a esta tarea
    // (debe ser el creador de la tarea, el recurso, o el líder del proyecto)
    const tienePermiso = await db.oneOrNone(`
      SELECT 1 
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      JOIN recursos r ON 1=1
      WHERE t.id = $1 AND r.id = $2 
      AND (t.asignado_a = $3 OR t.creado_por = $3 OR r.creado_por = $3 OR p.lider_id = $3)
      LIMIT 1
    `, [asignacion.tarea_id, asignacion.recurso_id, usuarioId]);
    
    if (!tienePermiso) {
      logger.warn(`Usuario ${usuarioId} sin permiso para asignar recurso a la tarea ${asignacion.tarea_id}`);
      throw new Error('Sin permisos para asignar este recurso a esta tarea');
    }
    
    // Verificar la disponibilidad del recurso si no es tipo 'material'
    if (recurso.tipo !== 'material' && recurso.disponibilidad === 'no disponible') {
      // Verificar si el recurso ya está asignado a esta tarea
      const yaAsignado = await db.oneOrNone(`
        SELECT 1 FROM tarea_recursos 
        WHERE recurso_id = $1 AND tarea_id = $2 AND estado = 'activo'
        LIMIT 1
      `, [asignacion.recurso_id, asignacion.tarea_id]);
      
      if (!yaAsignado) {
        logger.warn(`Recurso ${asignacion.recurso_id} no disponible`);
        throw new Error('Este recurso no está disponible para asignación');
      }
    }
    
    // Preparar los datos de la asignación
    const asignacionId = uuidv4();
    const fechaInicio = asignacion.fecha_inicio ? new Date(asignacion.fecha_inicio) : new Date();
    const fechaFin = asignacion.fecha_fin || null;
    
    // Validar las fechas
    if (fechaFin && new Date(fechaInicio) > new Date(fechaFin)) {
      logger.warn(`Fechas inválidas: inicio ${fechaInicio} posterior a fin ${fechaFin}`);
      throw new Error('La fecha de inicio no puede ser posterior a la fecha de fin');
    }
    
    // Crear la asignación en la tabla tarea_recursos
    await db.none(`
      INSERT INTO tarea_recursos (
        id, tarea_id, recurso_id, 
        cantidad, fecha_inicio, fecha_fin,
        estado, notas, creado_por, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
    `, [
      asignacionId,
      asignacion.tarea_id,
      asignacion.recurso_id,
      asignacion.cantidad || 1,
      fechaInicio,
      fechaFin,
      'activo',
      asignacion.notas || null,
      usuarioId,
      new Date(),
      new Date()
    ]);
    
    // Actualizar el estado de la tarea si se solicita
    if (asignacion.actualizar_estado_tarea) {
      await db.none(`
        UPDATE tareas 
        SET estado = 'en_progreso', actualizado_en = CURRENT_TIMESTAMP 
        WHERE id = $1 AND estado = 'pendiente'
      `, [asignacion.tarea_id]);
      
      logger.info(`Actualizado estado de la tarea ${asignacion.tarea_id} a 'en_progreso'`);
    }
    
    // Actualizar la disponibilidad del recurso si es necesario
    if (recurso.tipo !== 'material' && recurso.disponibilidad === 'disponible') {
      await db.none(`
        UPDATE recursos 
        SET disponibilidad = 'parcial', actualizado_en = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [asignacion.recurso_id]);
      
      logger.info(`Actualizada disponibilidad del recurso ${asignacion.recurso_id} a 'parcial'`);
    }
    
    // Recuperar la asignación creada para devolverla
    const asignacionCreada = await db.one(`
      SELECT tr.*, 
             r.nombre as recurso_nombre, r.tipo as recurso_tipo,
             t.nombre as tarea_nombre, t.estado as tarea_estado
      FROM tarea_recursos tr
      JOIN recursos r ON tr.recurso_id = r.id
      JOIN tareas t ON tr.tarea_id = t.id
      WHERE tr.id = $1
    `, [asignacionId]);
    
    logger.info(`Asignación de recurso a tarea creada exitosamente: ID=${asignacionId}`);
    
    return asignacionCreada;
  } catch (error) {
    logger.error(`Error al asignar recurso a tarea: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
