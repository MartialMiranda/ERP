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
      JOIN proyectos p ON e.proyecto_id = p.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE e.id = $1 AND (e.creado_por = $2 OR e.lider_id = $2 OR eu.usuario_id = $2 OR p.creado_por = $2)
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
             u_lider.nombre as lider_nombre,
             u_lider.email as lider_email,
             u_lider.avatar_url as lider_avatar,
             u_creador.nombre as creador_nombre,
             u_creador.email as creador_email,
             (
               SELECT COUNT(*) 
               FROM tareas t 
               WHERE t.equipo_id = e.id
             ) as total_tareas,
             (
               SELECT COUNT(*) 
               FROM tareas t 
               WHERE t.equipo_id = e.id AND t.estado = 'completada'
             ) as tareas_completadas
      FROM equipos e
      JOIN proyectos p ON e.proyecto_id = p.id
      LEFT JOIN usuarios u_lider ON e.lider_id = u_lider.id
      LEFT JOIN usuarios u_creador ON e.creado_por = u_creador.id
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
             u.email,
             u.avatar_url
      FROM equipo_usuarios eu
      JOIN usuarios u ON eu.usuario_id = u.id
      WHERE eu.equipo_id = $1
      ORDER BY 
        CASE WHEN eu.rol = 'lider' THEN 0 ELSE 1 END,
        u.nombre ASC
    `, [equipoId]);
    
    // Obtener estadísticas de tareas por estado
    const estadisticasTareas = await db.manyOrNone(`
      SELECT estado, COUNT(*) as total
      FROM tareas
      WHERE equipo_id = $1
      GROUP BY estado
    `, [equipoId]);
    
    // Obtener recursos asignados al equipo
    const recursos = await db.manyOrNone(`
      SELECT ra.*, 
             r.nombre as recurso_nombre,
             r.tipo as recurso_tipo,
             r.descripcion as recurso_descripcion
      FROM recurso_asignaciones ra
      JOIN recursos r ON ra.recurso_id = r.id
      WHERE ra.equipo_id = $1
    `, [equipoId]);
    
    // Construir el objeto de respuesta
    const equipoDetallado = {
      ...equipo,
      miembros: miembros || [],
      recursos: recursos || [],
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
