/**
 * Comando para crear una nueva tarea Kanban
 * Siguiendo el patru00f3n CQRS para separar operaciones de escritura
 */
const { db } = require('../../../config/database');
const { v4: uuidv4 } = require('uuid');
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
 * Ejecuta el comando para crear una nueva tarea Kanban
 * @param {Object} tarea - Datos de la tarea a crear
 * @param {string} columnaId - ID de la columna donde se ubicaru00e1 la tarea
 * @param {string} usuarioId - ID del usuario que crea la tarea
 * @returns {Promise<Object>} - Tarea creada
 */
async function execute(tarea, columnaId, usuarioId) {
  try {
    logger.info(`Creando nueva tarea kanban en columna: ${columnaId} por usuario: ${usuarioId}`);
    
    // Verificar que la columna existe
    const columna = await db.oneOrNone('SELECT * FROM kanban_columnas WHERE id = $1', [columnaId]);
    
    if (!columna) {
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
    `, [columna.proyecto_id, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto que contiene la columna ${columnaId}`);
      throw new Error('Sin permisos para modificar esta columna');
    }
    
    // Determinar la posiciu00f3n para la nueva tarea en la columna
    const ultimaPosicion = await db.oneOrNone(`
      SELECT MAX(posicion) as max_posicion
      FROM kanban_tareas
      WHERE columna_id = $1
    `, [columnaId]);
    
    const posicion = ultimaPosicion?.max_posicion ? ultimaPosicion.max_posicion + 1 : 0;
    
    return await db.tx(async (t) => {
      // Primero crear la tarea en la tabla de tareas si es una tarea nueva
      let tareaId = tarea.tarea_id;
      
      if (!tareaId) {
        // Genera un nuevo UUID para la tarea
        tareaId = uuidv4();
        
        // Prepara los datos para inserciu00f3n en tabla tareas
        await t.none(`
          INSERT INTO tareas (
            id, titulo, descripcion, prioridad, estado, fecha_vencimiento, proyecto_id,
            asignado_a, creado_en, actualizado_en
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )
        `, [
          tareaId, 
          tarea.titulo, 
          tarea.descripcion || null, 
          tarea.prioridad || 'media', 
          tarea.estado || 'pendiente', 
          tarea.fecha_vencimiento || null, 
          columna.proyecto_id,
          tarea.asignado_a || null,           
          new Date(), 
          new Date()
        ]);
      } else {
        // Verificar que la tarea existe
        const tareaExistente = await t.oneOrNone('SELECT * FROM tareas WHERE id = $1', [tareaId]);
        
        if (!tareaExistente) {
          logger.warn(`Tarea no encontrada: ${tareaId}`);
          throw new Error('Tarea no encontrada');
        }
      }
      
      // Ahora crear la entrada en kanban_tareas
      const kanbanTareaId = uuidv4();
      
      await t.none(`
        INSERT INTO kanban_tareas (
          id, tarea_id, columna_id, posicion
        ) VALUES (
          $1, $2, $3, $4
        )
      `, [
        kanbanTareaId,
        tareaId,
        columnaId,
        tarea.posicion !== undefined ? tarea.posicion : posicion
      ]);
      
      // Recuperar la tarea con toda su informaciu00f3n
      const nuevaTarea = await t.one(`
        SELECT kt.*, t.titulo, t.descripcion, t.prioridad, t.estado, t.fecha_vencimiento,
               u.nombre as asignado_nombre, u.email as asignado_email
        FROM kanban_tareas kt
        JOIN tareas t ON kt.tarea_id = t.id
        LEFT JOIN usuarios u ON t.asignado_a = u.id
        WHERE kt.id = $1
      `, [kanbanTareaId]);
      
      logger.info(`Tarea kanban creada exitosamente: ID=${kanbanTareaId}`);
      
      return nuevaTarea;
    });
  } catch (error) {
    logger.error(`Error al crear tarea kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
