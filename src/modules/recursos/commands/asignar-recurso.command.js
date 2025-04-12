/**
 * Comando para asignar un recurso a un proyecto
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
 * Ejecuta el comando para asignar un recurso a un proyecto
 * @param {Object} asignacion - Datos de la asignación (proyecto_id, recurso_id, cantidad)
 * @param {string} usuarioId - ID del usuario que realiza la asignación
 * @returns {Promise<Object>} - Recurso actualizado
 */
async function execute(asignacion, usuarioId) {
  try {
    logger.info(`Asignando recurso: ${asignacion.recurso_id} al proyecto: ${asignacion.proyecto_id} por usuario: ${usuarioId}`);
    
    // Verificar que el recurso existe
    const recurso = await db.oneOrNone(`
      SELECT * FROM recursos WHERE id = $1
    `, [asignacion.recurso_id]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${asignacion.recurso_id}`);
      throw new Error('Recurso no encontrado');
    }
    
    // Verificar que el proyecto existe
    const proyecto = await db.oneOrNone(`
      SELECT * FROM proyectos WHERE id = $1
    `, [asignacion.proyecto_id]);
    
    if (!proyecto) {
      logger.warn(`Proyecto no encontrado: ${asignacion.proyecto_id}`);
      throw new Error('Proyecto no encontrado');
    }
    
    // Verificar que el usuario tiene permiso para asignar recursos a este proyecto
    // (debe ser el creador del proyecto o miembro de algún equipo asociado)
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
    `, [asignacion.proyecto_id, usuarioId]);
    
    if (!tienePermiso) {
      logger.warn(`Usuario ${usuarioId} sin permiso para asignar recursos al proyecto ${asignacion.proyecto_id}`);
      throw new Error('Sin permisos para asignar recursos a este proyecto');
    }
    
    // Verificar si el recurso ya está asignado a otro proyecto
    if (recurso.proyecto_id && recurso.proyecto_id !== asignacion.proyecto_id) {
      const proyectoActual = await db.oneOrNone(`
        SELECT nombre FROM proyectos WHERE id = $1
      `, [recurso.proyecto_id]);
      
      logger.warn(`Recurso ${asignacion.recurso_id} ya asignado al proyecto ${recurso.proyecto_id}`);
      throw new Error(`Este recurso ya está asignado al proyecto "${proyectoActual.nombre}". Desasigne primero.`);
    }
    
    // Actualizar la asignación del recurso al proyecto
    await db.none(`
      UPDATE recursos 
      SET proyecto_id = $1, 
          cantidad = $2, 
          actualizado_en = CURRENT_TIMESTAMP 
      WHERE id = $3
    `, [
      asignacion.proyecto_id,
      asignacion.cantidad || recurso.cantidad,
      asignacion.recurso_id
    ]);
    
    // Recuperar el recurso actualizado
    const recursoActualizado = await db.one(`
      SELECT r.*, p.nombre as proyecto_nombre
      FROM recursos r
      JOIN proyectos p ON r.proyecto_id = p.id
      WHERE r.id = $1
    `, [asignacion.recurso_id]);
    
    // Obtener equipos asociados al proyecto
    const equiposProyecto = await db.manyOrNone(`
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
    `, [asignacion.proyecto_id]);
    
    logger.info(`Recurso asignado exitosamente al proyecto: ${asignacion.proyecto_id}`);
    
    // Construir respuesta
    const resultado = {
      ...recursoActualizado,
      disponibilidad: recursoActualizado.cantidad > 0 ? 'disponible' : 'agotado',
      equipos_proyecto: equiposProyecto || []
    };
    
    return resultado;
  } catch (error) {
    logger.error(`Error al asignar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
