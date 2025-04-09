/**
 * Consulta para obtener un equipo específico por ID
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
 * Obtiene un equipo específico por ID
 * @param {string} equipoId - ID del equipo
 * @param {string} usuarioId - ID del usuario que solicita la información
 * @returns {Promise<Object>} - Datos del equipo
 */
async function execute(equipoId, usuarioId) {
  try {
    logger.info(`Consultando equipo ID: ${equipoId} para usuario: ${usuarioId}`);
    
    // Verificar que el usuario tiene acceso al equipo
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE e.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
      LIMIT 1
    `, [equipoId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al equipo ${equipoId}`);
      throw new Error('Equipo no encontrado o sin permisos para acceder');
    }
    
    // Obtener información completa del equipo
    const equipo = await db.oneOrNone(`
      SELECT e.*, 
             p.nombre as proyecto_nombre,
             p.id as proyecto_id,
             p.creado_por as proyecto_creador_id,
             (
               SELECT u.nombre
               FROM equipo_usuarios eu_lider
               JOIN usuarios u ON eu_lider.usuario_id = u.id
               WHERE eu_lider.equipo_id = e.id AND eu_lider.rol = 'lider'
               LIMIT 1
             ) as lider_nombre,
             (
               SELECT u.email
               FROM equipo_usuarios eu_lider
               JOIN usuarios u ON eu_lider.usuario_id = u.id
               WHERE eu_lider.equipo_id = e.id AND eu_lider.rol = 'lider'
               LIMIT 1
             ) as lider_email,
             u_creador.nombre as creador_nombre,
             u_creador.email as creador_email,
             (
               SELECT COUNT(*) 
               FROM tareas t 
               JOIN proyecto_equipos pe2 ON t.proyecto_id = pe2.proyecto_id AND pe2.equipo_id = e.id
             ) as total_tareas,
             (
               SELECT COUNT(*) 
               FROM tareas t 
               JOIN proyecto_equipos pe3 ON t.proyecto_id = pe3.proyecto_id AND pe3.equipo_id = e.id
               WHERE t.estado = 'completada'
             ) as tareas_completadas
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      LEFT JOIN usuarios u_creador ON p.creado_por = u_creador.id
      WHERE e.id = $1
    `, [equipoId]);
    
    if (!equipo) {
      logger.warn(`Equipo no encontrado: ${equipoId}`);
      throw new Error('Equipo no encontrado');
    }
    
    // Obtener todos los miembros del equipo
    const miembros = await db.manyOrNone(`
      SELECT eu.*, 
             u.nombre, 
             u.email
      FROM equipo_usuarios eu
      JOIN usuarios u ON eu.usuario_id = u.id
      WHERE eu.equipo_id = $1
      ORDER BY 
        CASE WHEN eu.rol = 'lider' THEN 0 ELSE 1 END,
        u.nombre ASC
    `, [equipoId]);
    
    // Obtener estadísticas de tareas por estado
    const estadisticasTareas = await db.manyOrNone(`
      SELECT t.estado, COUNT(*) as total
      FROM tareas t
      JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      WHERE pe.equipo_id = $1
      GROUP BY t.estado
    `, [equipoId]);
    
    // Construir el objeto de respuesta
    const equipoDetallado = {
      ...equipo,
      miembros: miembros || [],
      recursos: [], // No hay tabla de asignación de recursos en el esquema
      estadisticas_tareas: {
        total: parseInt(equipo.total_tareas) || 0,
        completadas: parseInt(equipo.tareas_completadas) || 0,
        por_estado: estadisticasTareas || []
      }
    };
    
    // Calcular progreso del equipo (porcentaje de tareas completadas)
    if (parseInt(equipo.total_tareas) > 0) {
      equipoDetallado.progreso = Math.round(
        (parseInt(equipo.tareas_completadas) / parseInt(equipo.total_tareas)) * 100
      );
    } else {
      equipoDetallado.progreso = 0;
    }
    
    logger.info(`Equipo obtenido exitosamente: ID=${equipoId}`);
    
    return equipoDetallado;
  } catch (error) {
    logger.error(`Error al obtener equipo: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
