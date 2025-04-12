/**
 * Consulta para obtener un recurso específico por ID
 * Siguiendo el patrón CQRS para separar operaciones de lectura
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
 * Obtiene un recurso específico por ID
 * @param {string} recursoId - ID del recurso
 * @param {string} usuarioId - ID del usuario que solicita la información
 * @returns {Promise<Object>} - Datos del recurso
 */
async function execute(recursoId, usuarioId) {
  try {
    logger.info(`Consultando recurso ID: ${recursoId} para usuario: ${usuarioId}`);
    
    // Verificar que el recurso existe
    const recurso = await db.oneOrNone(`
      SELECT r.*
      FROM recursos r
      WHERE r.id = $1
    `, [recursoId]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${recursoId}`);
      throw new Error('Recurso no encontrado');
    }
    
    // Verificar que el usuario tiene acceso al recurso
    // Un usuario tiene acceso si es creador del proyecto o miembro de un equipo asociado al proyecto
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM recursos r
      JOIN proyectos p ON r.proyecto_id = p.id
      WHERE r.id = $1 AND 
      (
        p.creado_por = $2 OR
        EXISTS (
          SELECT 1 
          FROM proyecto_equipos pe
          JOIN equipo_usuarios eu ON pe.equipo_id = eu.equipo_id
          WHERE pe.proyecto_id = p.id AND eu.usuario_id = $2
        )
      )
      LIMIT 1
    `, [recursoId, usuarioId]);
    
    if (!tieneAcceso && recurso.proyecto_id) {
      logger.warn(`Usuario ${usuarioId} sin acceso al recurso ${recursoId}`);
      throw new Error('Sin permisos para acceder a este recurso');
    }
    
    // Obtener información del proyecto asociado (si existe)
    let proyecto = null;
    if (recurso.proyecto_id) {
      proyecto = await db.oneOrNone(`
        SELECT p.*, 
               u.nombre as creador_nombre, 
               u.email as creador_email
        FROM proyectos p
        LEFT JOIN usuarios u ON p.creado_por = u.id
        WHERE p.id = $1
      `, [recurso.proyecto_id]);
    }
    
    // Obtener equipos asociados al proyecto
    let equipos = [];
    if (recurso.proyecto_id) {
      equipos = await db.manyOrNone(`
        SELECT e.*, pe.creado_en as asignado_en,
               (
                 SELECT COUNT(eu.id) 
                 FROM equipo_usuarios eu 
                 WHERE eu.equipo_id = e.id
               ) as total_miembros
        FROM equipos e
        JOIN proyecto_equipos pe ON e.id = pe.equipo_id
        WHERE pe.proyecto_id = $1
        ORDER BY pe.creado_en DESC
      `, [recurso.proyecto_id]);
    }
    
    // Calcular métricas de uso
    const estadisticas = await db.oneOrNone(`
      SELECT 
        COUNT(t.id) as total_tareas,
        COUNT(CASE WHEN t.estado = 'completada' THEN 1 END) as tareas_completadas,
        COUNT(CASE WHEN t.estado = 'en progreso' THEN 1 END) as tareas_en_progreso,
        COUNT(CASE WHEN t.estado = 'pendiente' THEN 1 END) as tareas_pendientes
      FROM tareas t
      WHERE t.proyecto_id = $1
    `, [recurso.proyecto_id || '00000000-0000-0000-0000-000000000000']);
    
    // Construir el objeto de respuesta
    const recursoDetallado = {
      ...recurso,
      proyecto: proyecto,
      equipos: equipos || [],
      estadisticas: estadisticas || {
        total_tareas: 0,
        tareas_completadas: 0,
        tareas_en_progreso: 0,
        tareas_pendientes: 0
      }
    };
    
    // Calcular la disponibilidad basada en la cantidad
    if (recurso.cantidad > 0) {
      recursoDetallado.disponibilidad = 'disponible';
    } else {
      recursoDetallado.disponibilidad = 'agotado';
    }
    
    logger.info(`Recurso obtenido exitosamente: ID=${recursoId}`);
    
    return recursoDetallado;
  } catch (error) {
    logger.error(`Error al obtener recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
