/**
 * Consulta para obtener una tarea específica por ID
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
 * Obtiene una tarea específica por ID
 * @param {string} tareaId - ID de la tarea
 * @param {string} usuarioId - ID del usuario que solicita la información
 * @returns {Promise<Object>} - Datos de la tarea
 */
async function execute(tareaId, usuarioId) {
  try {
    logger.info(`Consultando tarea ID: ${tareaId} para usuario: ${usuarioId}`);
    
    // Verificar que el usuario tiene acceso a la tarea
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE t.id = $1 AND (
        t.asignado_a = $2 OR 
        (eu.usuario_id = $2 AND eu.rol = 'lider') OR 
        eu.usuario_id = $2
      )
      LIMIT 1
    `, [tareaId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso a la tarea ${tareaId}`);
      throw new Error('Tarea no encontrada o sin permisos para acceder');
    }
    
    // Obtener información completa de la tarea
    const tarea = await db.oneOrNone(`
      SELECT t.*,
             u_asignado.nombre as asignado_nombre,
             u_asignado.email as asignado_email,
             e.nombre as equipo_nombre,
             e.id as equipo_id,
             p.nombre as proyecto_nombre,
             p.id as proyecto_id
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN usuarios u_asignado ON t.asignado_a = u_asignado.id
      WHERE t.id = $1
    `, [tareaId]);
    
    if (!tarea) {
      logger.warn(`Tarea no encontrada: ${tareaId}`);
      throw new Error('Tarea no encontrada');
    }
    
    // Obtener información de la posición de la tarea en el tablero Kanban, si existe
    const kanbanInfo = await db.oneOrNone(`
      SELECT kt.*, kc.nombre as columna_nombre, kc.posicion as columna_posicion
      FROM kanban_tareas kt
      JOIN kanban_columnas kc ON kt.columna_id = kc.id
      WHERE kt.tarea_id = $1
    `, [tareaId]);
    
    // Calcular días hasta vencimiento
    let diasHastaVencimiento = null;
    let estaVencida = false;
    
    if (tarea.fecha_vencimiento) {
      const fechaVencimiento = new Date(tarea.fecha_vencimiento);
      const fechaActual = new Date();
      
      // Establecer las horas, minutos, segundos y milisegundos a 0 para comparar solo las fechas
      fechaActual.setHours(0, 0, 0, 0);
      fechaVencimiento.setHours(0, 0, 0, 0);
      
      const tiempoDiferencia = fechaVencimiento.getTime() - fechaActual.getTime();
      diasHastaVencimiento = Math.ceil(tiempoDiferencia / (1000 * 3600 * 24));
      
      // Determinar si la tarea está vencida
      estaVencida = diasHastaVencimiento < 0 && tarea.estado !== 'completada';
    }
    
    // Construir el objeto de respuesta
    const tareaDetallada = {
      ...tarea,
      kanban: kanbanInfo,
      dias_hasta_vencimiento: diasHastaVencimiento,
      esta_vencida: estaVencida
    };
    
    logger.info(`Tarea obtenida exitosamente: ID=${tareaId}`);
    
    return tareaDetallada;
  } catch (error) {
    logger.error(`Error al obtener tarea: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
