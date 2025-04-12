/**
 * Comando para desasignar un recurso de un proyecto
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
 * Ejecuta el comando para desasignar un recurso de un proyecto
 * @param {string} recursoId - ID del recurso a desasignar
 * @param {Object} datos - Datos adicionales (motivo, notas, etc.)
 * @param {string} usuarioId - ID del usuario que realiza la desasignación
 * @returns {Promise<Object>} - Recurso desasignado
 */
async function execute(recursoId, datos, usuarioId) {
  try {
    logger.info(`Desasignando recurso: ${recursoId} por usuario: ${usuarioId}`);
    
    // Verificar que el recurso existe y está asignado a un proyecto
    const recurso = await db.oneOrNone(`
      SELECT r.*, p.id as proyecto_id, p.nombre as proyecto_nombre, p.creado_por as proyecto_creador
      FROM recursos r
      LEFT JOIN proyectos p ON r.proyecto_id = p.id
      WHERE r.id = $1
    `, [recursoId]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${recursoId}`);
      throw new Error('Recurso no encontrado');
    }
    
    if (!recurso.proyecto_id) {
      logger.warn(`Recurso ${recursoId} no está asignado a ningún proyecto`);
      throw new Error('Este recurso no está asignado a ningún proyecto');
    }
    
    // Verificar permisos - el usuario debe ser creador del proyecto o miembro de un equipo asociado
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
    `, [recurso.proyecto_id, usuarioId]);
    
    if (!tienePermiso) {
      logger.warn(`Usuario ${usuarioId} sin permisos para desasignar recurso ${recursoId} del proyecto ${recurso.proyecto_id}`);
      throw new Error('Sin permisos para desasignar este recurso');
    }
    
    // Verificar si hay tareas pendientes que usan este recurso
    const tareasActivas = await db.oneOrNone(`
      SELECT COUNT(*) as total 
      FROM tareas
      WHERE proyecto_id = $1 AND estado NOT IN ('completada', 'cancelada')
    `, [recurso.proyecto_id]);
    
    if (parseInt(tareasActivas.total) > 0 && !datos.forzar) {
      logger.warn(`Hay ${tareasActivas.total} tareas activas en el proyecto que podrían estar usando este recurso`);
      throw new Error(`Hay ${tareasActivas.total} tareas activas en el proyecto. Use la opción 'forzar' para desasignar de todos modos.`);
    }
    
    // Guardar historial de desasignación (opcional, si se requiere para reportes)
    if (datos.guardar_historial) {
      await db.none(`
        INSERT INTO historial_proyectos (
          id, proyecto_id, tipo_accion, recurso_id, 
          notas, realizado_por, realizado_en
        ) VALUES (
          uuid_generate_v4(), $1, 'desasignacion_recurso', $2, $3, $4, CURRENT_TIMESTAMP
        )
      `, [recurso.proyecto_id, recursoId, datos.notas || 'Recurso desasignado del proyecto', usuarioId]);
    }
    
    // Actualizar el recurso (eliminar asignación al proyecto)
    await db.none(`
      UPDATE recursos
      SET proyecto_id = NULL,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [recursoId]);
    
    // Recuperar el recurso actualizado
    const recursoActualizado = await db.one(`
      SELECT r.*
      FROM recursos r
      WHERE r.id = $1
    `, [recursoId]);
    
    logger.info(`Recurso desasignado exitosamente: ID=${recursoId}`);
    
    // Construir respuesta
    const resultado = {
      ...recursoActualizado,
      disponibilidad: recursoActualizado.cantidad > 0 ? 'disponible' : 'agotado',
      proyecto_anterior: {
        id: recurso.proyecto_id,
        nombre: recurso.proyecto_nombre
      }
    };
    
    return resultado;
  } catch (error) {
    logger.error(`Error al desasignar recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
