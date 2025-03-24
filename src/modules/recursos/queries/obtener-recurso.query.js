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
      SELECT r.*, 
             u.nombre as creador_nombre,
             u.email as creador_email
      FROM recursos r
      LEFT JOIN usuarios u ON r.creado_por = u.id
      WHERE r.id = $1
    `, [recursoId]);
    
    if (!recurso) {
      logger.warn(`Recurso no encontrado: ${recursoId}`);
      throw new Error('Recurso no encontrado');
    }
    
    // Verificar que el usuario tiene acceso al recurso
    // Un usuario tiene acceso si: 
    // 1. Es el creador del recurso, o
    // 2. Es miembro o líder de un equipo al que el recurso está asignado
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM recursos r
      WHERE r.id = $1 AND 
      (
        r.creado_por = $2 OR
        EXISTS (
          SELECT 1 
          FROM recurso_asignaciones ra
          JOIN equipos e ON ra.equipo_id = e.id
          LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
          WHERE ra.recurso_id = r.id AND (e.lider_id = $2 OR eu.usuario_id = $2)
        )
      )
      LIMIT 1
    `, [recursoId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al recurso ${recursoId}`);
      throw new Error('Sin permisos para acceder a este recurso');
    }
    
    // Obtener todas las asignaciones del recurso
    const asignaciones = await db.manyOrNone(`
      SELECT ra.*, 
             e.nombre as equipo_nombre,
             p.nombre as proyecto_nombre,
             p.id as proyecto_id
      FROM recurso_asignaciones ra
      JOIN equipos e ON ra.equipo_id = e.id
      JOIN proyectos p ON e.proyecto_id = p.id
      WHERE ra.recurso_id = $1
      ORDER BY 
        CASE 
          WHEN ra.fecha_fin IS NULL OR ra.fecha_fin > CURRENT_DATE THEN 0 
          ELSE 1 
        END,
        ra.fecha_inicio DESC
    `, [recursoId]);
    
    // Calcular métricas de uso
    const metricas = await db.oneOrNone(`
      SELECT 
        COUNT(*) as total_asignaciones,
        COUNT(CASE WHEN fecha_fin IS NULL OR fecha_fin > CURRENT_DATE THEN 1 END) as asignaciones_activas,
        COUNT(CASE WHEN fecha_fin IS NOT NULL AND fecha_fin <= CURRENT_DATE THEN 1 END) as asignaciones_completadas,
        SUM(CASE WHEN fecha_fin IS NULL OR fecha_fin > CURRENT_DATE THEN cantidad ELSE 0 END) as cantidad_asignada,
        (SELECT COUNT(DISTINCT equipo_id) FROM recurso_asignaciones WHERE recurso_id = $1) as equipos_diferentes
      FROM recurso_asignaciones
      WHERE recurso_id = $1
    `, [recursoId]);
    
    // Construir el objeto de respuesta
    const recursoDetallado = {
      ...recurso,
      asignaciones: asignaciones || [],
      metricas: metricas || {
        total_asignaciones: 0,
        asignaciones_activas: 0,
        asignaciones_completadas: 0,
        cantidad_asignada: 0,
        equipos_diferentes: 0
      }
    };
    
    // Calcular la disponibilidad efectiva basada en asignaciones activas
    if (parseInt(metricas.asignaciones_activas) > 0) {
      recursoDetallado.disponibilidad_efectiva = 'parcial';
      if (parseInt(metricas.cantidad_asignada) >= 1 && recurso.tipo !== 'material') {
        recursoDetallado.disponibilidad_efectiva = 'no disponible';
      }
    } else {
      recursoDetallado.disponibilidad_efectiva = 'disponible';
    }
    
    logger.info(`Recurso obtenido exitosamente: ID=${recursoId}`);
    
    return recursoDetallado;
  } catch (error) {
    logger.error(`Error al obtener recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
