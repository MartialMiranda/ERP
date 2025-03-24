/**
 * Comando para actualizar una tarea existente
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
 * Ejecuta el comando para actualizar una tarea existente
 * @param {string} tareaId - ID de la tarea a actualizar
 * @param {Object} datosActualizados - Datos a actualizar de la tarea
 * @param {string} usuarioId - ID del usuario que realiza la actualización
 * @returns {Promise<Object>} - Tarea actualizada
 */
async function execute(tareaId, datosActualizados, usuarioId) {
  try {
    logger.info(`Actualizando tarea: ${tareaId} por usuario: ${usuarioId}`);
    
    // Verificar que la tarea existe y que el usuario tiene permisos para actualizarla
    const tarea = await db.oneOrNone(`
      SELECT t.* 
      FROM tareas t
      JOIN equipos e ON t.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE t.id = $1 AND (t.creado_por = $2 OR t.asignado_a = $2 OR e.lider_id = $2 OR eu.usuario_id = $2)
    `, [tareaId, usuarioId]);
    
    if (!tarea) {
      logger.warn(`Intento de actualizar tarea inexistente o sin permisos: ${tareaId}`);
      throw new Error('Tarea no encontrada o sin permisos para actualizar');
    }
    
    // Si se está cambiando el usuario asignado, verificar que pertenece al equipo
    if (datosActualizados.asignado_a && datosActualizados.asignado_a !== tarea.asignado_a) {
      const miembroEquipo = await db.oneOrNone(`
        SELECT 1 FROM equipo_usuarios 
        WHERE equipo_id = $1 AND usuario_id = $2
      `, [tarea.equipo_id, datosActualizados.asignado_a]);
      
      if (!miembroEquipo) {
        logger.warn(`El usuario asignado no pertenece al equipo: ${datosActualizados.asignado_a}`);
        throw new Error('El usuario asignado no pertenece al equipo');
      }
    }
    
    // Preparar los campos a actualizar
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    // Título de la tarea
    if (datosActualizados.titulo !== undefined) {
      updateFields.push(`titulo = $${paramCount++}`);
      updateValues.push(datosActualizados.titulo);
    }
    
    // Descripción de la tarea
    if (datosActualizados.descripcion !== undefined) {
      updateFields.push(`descripcion = $${paramCount++}`);
      updateValues.push(datosActualizados.descripcion);
    }
    
    // Estado de la tarea
    if (datosActualizados.estado !== undefined) {
      // Validar que el estado es uno de los permitidos
      const estadosValidos = ['pendiente', 'en progreso', 'completada', 'cancelada'];
      if (!estadosValidos.includes(datosActualizados.estado)) {
        logger.warn(`Estado inválido para tarea: ${datosActualizados.estado}`);
        throw new Error(`Estado de tarea inválido. Debe ser uno de: ${estadosValidos.join(', ')}`);
      }
      
      updateFields.push(`estado = $${paramCount++}`);
      updateValues.push(datosActualizados.estado);
    }
    
    // Prioridad de la tarea
    if (datosActualizados.prioridad !== undefined) {
      // Validar que la prioridad es una de las permitidas
      const prioridadesValidas = ['baja', 'media', 'alta', 'urgente'];
      if (!prioridadesValidas.includes(datosActualizados.prioridad)) {
        logger.warn(`Prioridad inválida para tarea: ${datosActualizados.prioridad}`);
        throw new Error(`Prioridad de tarea inválida. Debe ser una de: ${prioridadesValidas.join(', ')}`);
      }
      
      updateFields.push(`prioridad = $${paramCount++}`);
      updateValues.push(datosActualizados.prioridad);
    }
    
    // Fecha de inicio
    if (datosActualizados.fecha_inicio !== undefined) {
      updateFields.push(`fecha_inicio = $${paramCount++}`);
      updateValues.push(datosActualizados.fecha_inicio);
    }
    
    // Fecha de vencimiento
    if (datosActualizados.fecha_vencimiento !== undefined) {
      updateFields.push(`fecha_vencimiento = $${paramCount++}`);
      updateValues.push(datosActualizados.fecha_vencimiento);
    }
    
    // Usuario asignado
    if (datosActualizados.asignado_a !== undefined) {
      updateFields.push(`asignado_a = $${paramCount++}`);
      updateValues.push(datosActualizados.asignado_a);
    }
    
    // Etiquetas
    if (datosActualizados.etiquetas !== undefined) {
      updateFields.push(`etiquetas = $${paramCount++}`);
      updateValues.push(datosActualizados.etiquetas);
    }
    
    // Añadir siempre la fecha de actualización
    updateFields.push(`actualizado_en = $${paramCount++}`);
    updateValues.push(new Date());
    
    // Añadir el ID de la tarea para el WHERE
    updateValues.push(tareaId);
    
    // Ejecutar la actualización
    if (updateFields.length > 0) {
      await db.none(`
        UPDATE tareas 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
      `, updateValues);
      
      logger.info(`Tarea actualizada exitosamente: ID=${tareaId}`);
      
      // Si se actualizó el estado a 'completada', actualizar la posición en el tablero Kanban
      if (datosActualizados.estado === 'completada') {
        // Buscar columna de "completadas" en el tablero Kanban
        const columnaCompletadas = await db.oneOrNone(`
          SELECT kc.* FROM kanban_columnas kc
          JOIN equipos e ON e.proyecto_id = kc.proyecto_id
          WHERE e.id = $1 AND kc.nombre ILIKE '%completad%'
          ORDER BY kc.orden DESC
          LIMIT 1
        `, [tarea.equipo_id]);
        
        if (columnaCompletadas) {
          // Verificar si la tarea ya está en alguna columna
          const kanbanTarea = await db.oneOrNone(`
            SELECT * FROM kanban_tareas 
            WHERE tarea_id = $1
          `, [tareaId]);
          
          if (kanbanTarea) {
            // Actualizar la columna de la tarea
            await db.none(`
              UPDATE kanban_tareas 
              SET columna_id = $1, actualizado_en = $2
              WHERE tarea_id = $3
            `, [columnaCompletadas.id, new Date(), tareaId]);
            
            logger.info(`Tarea movida a columna 'Completadas' en Kanban: ${columnaCompletadas.id}`);
          }
        }
      }
    } else {
      logger.info(`No se realizaron cambios en la tarea: ID=${tareaId}`);
    }
    
    // Recuperar la tarea actualizada
    const tareaActualizada = await db.one(`
      SELECT t.*, 
             u_creador.nombre as creador_nombre,
             u_asignado.nombre as asignado_nombre
      FROM tareas t
      LEFT JOIN usuarios u_creador ON t.creado_por = u_creador.id
      LEFT JOIN usuarios u_asignado ON t.asignado_a = u_asignado.id
      WHERE t.id = $1
    `, [tareaId]);
    
    return tareaActualizada;
  } catch (error) {
    logger.error(`Error al actualizar tarea: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
