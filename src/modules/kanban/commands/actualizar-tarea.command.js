/**
 * Comando para actualizar una tarea Kanban existente
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
 * Ejecuta el comando para actualizar una tarea Kanban existente
 * @param {string} kanbanTareaId - ID de la tarea kanban a actualizar
 * @param {Object} datosActualizados - Datos actualizados de la tarea
 * @param {string} usuarioId - ID del usuario que actualiza la tarea
 * @returns {Promise<Object>} - Tarea actualizada
 */
async function execute(kanbanTareaId, datosActualizados, usuarioId) {
  try {
    logger.info(`Actualizando tarea kanban ID: ${kanbanTareaId} por usuario: ${usuarioId}`);
    
    // Verificar que la tarea kanban existe
    const tareaKanban = await db.oneOrNone(`
      SELECT kt.*, t.proyecto_id
      FROM kanban_tareas kt
      JOIN tareas t ON kt.tarea_id = t.id
      WHERE kt.id = $1
    `, [kanbanTareaId]);
    
    if (!tareaKanban) {
      logger.warn(`Tarea kanban no encontrada: ${kanbanTareaId}`);
      throw new Error('Tarea kanban no encontrada');
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
    `, [tareaKanban.proyecto_id, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto que contiene la tarea ${kanbanTareaId}`);
      throw new Error('Sin permisos para modificar esta tarea');
    }
    
    return await db.tx(async (t) => {
      // Determinar si se estu00e1 moviendo la tarea a otra columna
      if (datosActualizados.columna_id && datosActualizados.columna_id !== tareaKanban.columna_id) {
        // Verificar que la nueva columna existe y pertenece al mismo proyecto
        const nuevaColumna = await t.oneOrNone(`
          SELECT kc.*, p.id as proyecto_id
          FROM kanban_columnas kc
          JOIN proyectos p ON kc.proyecto_id = p.id
          WHERE kc.id = $1
        `, [datosActualizados.columna_id]);
        
        if (!nuevaColumna) {
          logger.warn(`Columna destino no encontrada: ${datosActualizados.columna_id}`);
          throw new Error('Columna destino no encontrada');
        }
        
        if (nuevaColumna.proyecto_id !== tareaKanban.proyecto_id) {
          logger.warn(`La columna destino pertenece a otro proyecto`);
          throw new Error('No se puede mover la tarea a una columna de otro proyecto');
        }
        
        // Determinar la posiciu00f3n para la tarea en la nueva columna
        let nuevaPosicion = datosActualizados.posicion;
        
        if (nuevaPosicion === undefined) {
          const ultimaPosicion = await t.oneOrNone(`
            SELECT MAX(posicion) as max_posicion
            FROM kanban_tareas
            WHERE columna_id = $1
          `, [datosActualizados.columna_id]);
          
          nuevaPosicion = ultimaPosicion?.max_posicion ? ultimaPosicion.max_posicion + 1 : 0;
        }
        
        // Actualizar la tarea kanban con la nueva columna y posiciu00f3n
        await t.none(`
          UPDATE kanban_tareas 
          SET columna_id = $1, posicion = $2 
          WHERE id = $3
        `, [datosActualizados.columna_id, nuevaPosicion, kanbanTareaId]);
        
        // Reordenar las posiciones en la columna original
        await t.none(`
          WITH tareas_ordenadas AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY posicion) - 1 as nueva_posicion
            FROM kanban_tareas
            WHERE columna_id = $1
          )
          UPDATE kanban_tareas kt
          SET posicion = tord.nueva_posicion
          FROM tareas_ordenadas tord
          WHERE kt.id = tord.id
        `, [tareaKanban.columna_id]);
      } else if (datosActualizados.posicion !== undefined) {
        // Solo se estu00e1 cambiando la posiciu00f3n dentro de la misma columna
        await t.none(`
          UPDATE kanban_tareas 
          SET posicion = $1 
          WHERE id = $2
        `, [datosActualizados.posicion, kanbanTareaId]);
      }
      
      // Si hay actualizaciones para la tarea en su00ed (no solo su posiciu00f3n en el kanban)
      if (datosActualizados.titulo || datosActualizados.descripcion || 
          datosActualizados.prioridad || datosActualizados.estado || 
          datosActualizados.fecha_vencimiento || datosActualizados.asignado_a) {
        
        // Preparar campos a actualizar para la tarea
        const camposActualizables = {};
        
        if (datosActualizados.titulo !== undefined) {
          camposActualizables.titulo = datosActualizados.titulo;
        }
        
        if (datosActualizados.descripcion !== undefined) {
          camposActualizables.descripcion = datosActualizados.descripcion;
        }
        
        if (datosActualizados.prioridad !== undefined) {
          camposActualizables.prioridad = datosActualizados.prioridad;
        }
        
        if (datosActualizados.estado !== undefined) {
          camposActualizables.estado = datosActualizados.estado;
        }
        
        if (datosActualizados.fecha_vencimiento !== undefined) {
          camposActualizables.fecha_vencimiento = datosActualizados.fecha_vencimiento;
        }
        
        if (datosActualizados.asignado_a !== undefined) {
          camposActualizables.asignado_a = datosActualizados.asignado_a;
        }
        
        camposActualizables.actualizado_en = new Date();
        
        // Si hay campos para actualizar en la tarea
        if (Object.keys(camposActualizables).length > 0) {
          // Construir la consulta de actualizaciu00f3n dinu00e1micamente
          const updateFields = Object.keys(camposActualizables)
            .map((campo, index) => `${campo} = $${index + 2}`)
            .join(', ');
          
          const updateValues = [tareaKanban.tarea_id, ...Object.values(camposActualizables)];
          
          // Ejecutar la actualizaciu00f3n de la tarea
          await t.none(
            `UPDATE tareas SET ${updateFields} WHERE id = $1`,
            updateValues
          );
        }
      }
      
      // Recuperar la tarea actualizada con toda su informaciu00f3n
      const tareaActualizada = await t.one(`
        SELECT kt.*, t.titulo, t.descripcion, t.prioridad, t.estado, t.fecha_vencimiento,
               u.nombre as asignado_nombre, u.email as asignado_email
        FROM kanban_tareas kt
        JOIN tareas t ON kt.tarea_id = t.id
        LEFT JOIN usuarios u ON t.asignado_a = u.id
        WHERE kt.id = $1
      `, [kanbanTareaId]);
      
      logger.info(`Tarea kanban actualizada exitosamente: ID=${kanbanTareaId}`);
      
      return tareaActualizada;
    });
  } catch (error) {
    logger.error(`Error al actualizar tarea kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
