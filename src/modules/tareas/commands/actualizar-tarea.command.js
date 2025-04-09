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
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE t.id = $1 AND (
        t.asignado_a = $2 OR 
        (eu.usuario_id = $2 AND eu.rol = 'lider') OR 
        eu.usuario_id = $2
      )
    `, [tareaId, usuarioId]);
    
    if (!tarea) {
      logger.warn(`Intento de actualizar tarea inexistente o sin permisos: ${tareaId}`);
      throw new Error('Tarea no encontrada o sin permisos para actualizar');
    }
    
    // Si se está cambiando el usuario asignado, verificar que pertenece al equipo
    if (datosActualizados.asignado_a && datosActualizados.asignado_a !== tarea.asignado_a) {
      // Obtener los equipos del proyecto
      const equiposProyecto = await db.manyOrNone(`
        SELECT e.id
        FROM equipos e
        JOIN proyecto_equipos pe ON e.id = pe.equipo_id
        WHERE pe.proyecto_id = $1
      `, [tarea.proyecto_id]);
      
      if (equiposProyecto && equiposProyecto.length > 0) {
        const equipoIds = equiposProyecto.map(e => e.id);
        
        const miembroEquipo = await db.oneOrNone(`
          SELECT 1 FROM equipo_usuarios eu
          WHERE eu.equipo_id IN ($1:csv) AND eu.usuario_id = $2
        `, [equipoIds, datosActualizados.asignado_a]);
        
        if (!miembroEquipo) {
          logger.warn(`El usuario asignado no pertenece a ningún equipo del proyecto: ${datosActualizados.asignado_a}`);
          throw new Error('El usuario asignado no pertenece a ningún equipo del proyecto');
        }
      }
    }
    
    // Determinar qué campos se van a actualizar
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    if (datosActualizados.titulo !== undefined) {
      updateFields.push(`titulo = $${paramCount++}`);
      updateValues.push(datosActualizados.titulo);
    }
    
    if (datosActualizados.descripcion !== undefined) {
      updateFields.push(`descripcion = $${paramCount++}`);
      updateValues.push(datosActualizados.descripcion);
    }
    
    if (datosActualizados.estado !== undefined) {
      updateFields.push(`estado = $${paramCount++}`);
      updateValues.push(datosActualizados.estado);
    }
    
    if (datosActualizados.prioridad !== undefined) {
      updateFields.push(`prioridad = $${paramCount++}`);
      updateValues.push(datosActualizados.prioridad);
    }
    
    if (datosActualizados.fecha_vencimiento !== undefined) {
      updateFields.push(`fecha_vencimiento = $${paramCount++}`);
      updateValues.push(datosActualizados.fecha_vencimiento);
    }
    
    if (datosActualizados.asignado_a !== undefined) {
      updateFields.push(`asignado_a = $${paramCount++}`);
      updateValues.push(datosActualizados.asignado_a);
    }
    
    // Actualizar fecha de modificación
    updateFields.push(`actualizado_en = $${paramCount++}`);
    updateValues.push(new Date());
    
    // Si no hay campos para actualizar, salir
    if (updateFields.length === 0) {
      logger.warn(`Solicitud de actualización sin cambios para tarea: ${tareaId}`);
      throw new Error('No se especificaron campos para actualizar');
    }
    
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
          WHERE kc.proyecto_id = $1 AND kc.nombre ILIKE '%completad%'
          ORDER BY kc.posicion DESC
          LIMIT 1
        `, [tarea.proyecto_id]);
        
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
              SET columna_id = $1
              WHERE tarea_id = $2
            `, [columnaCompletadas.id, tareaId]);
            
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
             u_asignado.nombre as asignado_nombre
      FROM tareas t
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
