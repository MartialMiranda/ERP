/**
 * Comando para crear una nueva tarea
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
 * Ejecuta el comando para crear una nueva tarea
 * @param {Object} tarea - Datos de la tarea a crear
 * @param {string} usuarioId - ID del usuario que crea la tarea
 * @returns {Promise<Object>} - Tarea creada
 */
async function execute(tarea, usuarioId) {
  try {
    logger.info(`Creando nueva tarea: ${tarea.titulo} por usuario: ${usuarioId}`);
    
    // Verificar que el equipo existe y que el usuario tiene acceso al equipo
    const equipo = await db.oneOrNone(`
      SELECT e.*, pe.proyecto_id 
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE e.id = $1 AND (
        eu.usuario_id = $2 AND eu.rol = 'lider'
        OR eu.usuario_id = $2
      )
    `, [tarea.equipo_id, usuarioId]);
    
    if (!equipo) {
      logger.warn(`Equipo no encontrado o sin permisos para crear tarea: ${tarea.equipo_id}`);
      throw new Error('Equipo no encontrado o sin permisos para crear tarea');
    }
    
    // Verificar que el usuario asignado pertenece al equipo (si se especifica)
    if (tarea.asignado_a) {
      const miembroEquipo = await db.oneOrNone(`
        SELECT 1 FROM equipo_usuarios 
        WHERE equipo_id = $1 AND usuario_id = $2
      `, [tarea.equipo_id, tarea.asignado_a]);
      
      if (!miembroEquipo) {
        logger.warn(`El usuario asignado no pertenece al equipo: ${tarea.asignado_a}`);
        throw new Error('El usuario asignado no pertenece al equipo');
      }
    }
    
    // Genera un nuevo UUID para la tarea
    const tareaId = uuidv4();
    
    // Prepara los datos para inserción
    const tareaData = {
      id: tareaId,
      titulo: tarea.titulo,
      descripcion: tarea.descripcion || null,
      estado: tarea.estado || 'pendiente',
      prioridad: tarea.prioridad || 'media',
      fecha_vencimiento: tarea.fecha_vencimiento || null,
      proyecto_id: equipo.proyecto_id,
      asignado_a: tarea.asignado_a || null,
      creado_en: new Date(),
      actualizado_en: new Date()
    };
    
    // Inserta la nueva tarea en la base de datos
    await db.none(`
      INSERT INTO tareas (
        id, titulo, descripcion, estado, prioridad, 
        fecha_vencimiento, proyecto_id, 
        asignado_a, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `, [
      tareaData.id, 
      tareaData.titulo, 
      tareaData.descripcion, 
      tareaData.estado, 
      tareaData.prioridad,
      tareaData.fecha_vencimiento, 
      tareaData.proyecto_id,
      tareaData.asignado_a, 
      tareaData.creado_en, 
      tareaData.actualizado_en
    ]);
    
    // Si el proyecto usa Kanban, añadir la tarea a la primera columna
    const columnasKanban = await db.manyOrNone(`
      SELECT kc.* FROM kanban_columnas kc
      JOIN proyecto_equipos pe ON pe.proyecto_id = kc.proyecto_id
      WHERE pe.equipo_id = $1
      ORDER BY kc.posicion ASC
    `, [tarea.equipo_id]);
    
    if (columnasKanban && columnasKanban.length > 0) {
      const primeraColumna = columnasKanban[0];
      
      // Contar tareas en la columna para determinar la posición
      const totalTareasEnColumna = await db.one(`
        SELECT COUNT(*) FROM kanban_tareas 
        WHERE columna_id = $1
      `, [primeraColumna.id]);
      
      // Insertar en tabla kanban_tareas
      await db.none(`
        INSERT INTO kanban_tareas (
          id, tarea_id, columna_id, posicion
        ) VALUES (
          $1, $2, $3, $4
        )
      `, [
        uuidv4(),
        tareaId,
        primeraColumna.id,
        parseInt(totalTareasEnColumna.count) + 1
      ]);
      
      logger.info(`Tarea ${tareaId} añadida a columna Kanban: ${primeraColumna.id}`);
    }
    
    // Recupera la tarea recién creada para devolverla
    const nuevaTarea = await db.one(`
      SELECT t.*, 
             u_asignado.nombre as asignado_nombre
      FROM tareas t
      LEFT JOIN usuarios u_asignado ON t.asignado_a = u_asignado.id
      WHERE t.id = $1
    `, [tareaId]);
    
    logger.info(`Tarea creada exitosamente: ID=${tareaId}`);
    
    return nuevaTarea;
  } catch (error) {
    logger.error(`Error al crear tarea: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
