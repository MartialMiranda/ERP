/**
 * Consulta para obtener una columna Kanban específica por ID
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
 * Obtiene una columna Kanban específica por ID
 * @param {string} columnaId - ID de la columna
 * @param {string} usuarioId - ID del usuario que solicita la información
 * @returns {Promise<Object>} - Datos de la columna con sus tareas
 */
async function execute(columnaId, usuarioId) {
  try {
    logger.info(`Consultando columna kanban ID: ${columnaId} para usuario: ${usuarioId}`);
    
    // Verificar que la columna existe
    const columna = await db.oneOrNone('SELECT * FROM kanban_columnas WHERE id = $1', [columnaId]);
    
    if (!columna) {
      logger.warn(`Columna kanban no encontrada: ${columnaId}`);
      throw new Error('Columna kanban no encontrada');
    }
    
    // Verificar que el usuario tiene acceso al proyecto
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
      throw new Error('Columna kanban no encontrada o sin permisos para acceder');
    }
    
    // Obtener las tareas asociadas a la columna
    const tareas = await db.manyOrNone(`
      SELECT kt.*, t.titulo, t.descripcion, t.prioridad, t.estado, t.fecha_vencimiento,
             u.nombre as asignado_nombre, u.email as asignado_email
      FROM kanban_tareas kt
      JOIN tareas t ON kt.tarea_id = t.id
      LEFT JOIN usuarios u ON t.asignado_a = u.id
      WHERE kt.columna_id = $1
      ORDER BY kt.posicion ASC
    `, [columnaId]);
    
    // Construir el objeto de respuesta
    const columnaDetallada = {
      ...columna,
      tareas: tareas || []
    };
    
    logger.info(`Columna kanban obtenida exitosamente: ID=${columnaId}`);
    
    return columnaDetallada;
  } catch (error) {
    logger.error(`Error al obtener columna kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
