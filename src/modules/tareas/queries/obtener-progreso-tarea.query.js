/**
 * Consulta para obtener el historial de progreso de una tarea
 * Siguiendo el patrón CQRS para separar operaciones de lectura
 */
const { db } = require('../../../config/database');
const winston = require('winston');
const { NotFoundError, ForbiddenError } = require('../../../utils/errors');

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
 * Obtiene el historial de progreso de una tarea específica
 * @param {string} tareaId - ID de la tarea
 * @param {string} usuarioId - ID del usuario que solicita el historial
 * @param {Object} opciones - Opciones de paginación y filtrado
 * @returns {Promise<Object>} - Historial de progreso de la tarea
 */
async function execute(tareaId, usuarioId, opciones = {}) {
  try {
    logger.info(`Obteniendo historial de progreso para tarea: ${tareaId} por usuario: ${usuarioId}`);
    
    // Valores por defecto para las opciones
    const pagina = opciones.pagina || 1;
    const porPagina = opciones.por_pagina || 10;
    const offset = (pagina - 1) * porPagina;
    
    // Verificar que la tarea existe
    const tarea = await db.oneOrNone(`
      SELECT t.*, p.nombre as proyecto_nombre, p.id as proyecto_id
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      WHERE t.id = $1
    `, [tareaId]);
    
    if (!tarea) {
      logger.warn(`Tarea no encontrada: ${tareaId}`);
      throw new NotFoundError('Tarea no encontrada');
    }
    
    // Verificar que el usuario tiene acceso a esta tarea
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON p.id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE t.id = $1 AND (
        t.asignado_a = $2 OR 
        p.creado_por = $2 OR 
        eu.usuario_id = $2
      )
      LIMIT 1
    `, [tareaId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso para ver progreso de tarea ${tareaId}`);
      throw new ForbiddenError('No tienes permisos para ver el progreso de esta tarea');
    }
    
    // Obtener el total de registros de progreso para esta tarea
    const totalRegistros = await db.one(`
      SELECT COUNT(*) as total
      FROM reportes_progreso
      WHERE tarea_id = $1
    `, [tareaId]);
    
    // Obtener el historial de progreso con paginación
    const historialProgreso = await db.manyOrNone(`
      SELECT 
        rp.id,
        rp.tarea_id,
        rp.usuario_id,
        rp.comentario,
        rp.progreso_porcentaje,
        rp.creado_en,
        u.nombre as usuario_nombre,
        u.email as usuario_email
      FROM reportes_progreso rp
      JOIN usuarios u ON rp.usuario_id = u.id
      WHERE rp.tarea_id = $1
      ORDER BY rp.creado_en DESC
      LIMIT $2 OFFSET $3
    `, [tareaId, porPagina, offset]);
    
    // Calcular el último progreso reportado
    const ultimoProgreso = historialProgreso.length > 0 ? historialProgreso[0].progreso_porcentaje : 0;
    
    logger.info(`Historial de progreso obtenido para tarea: ${tareaId}, total registros: ${totalRegistros.total}`);
    
    // Construir la respuesta
    return {
      tarea: {
        id: tarea.id,
        titulo: tarea.titulo,
        estado: tarea.estado,
        proyecto_id: tarea.proyecto_id,
        proyecto_nombre: tarea.proyecto_nombre
      },
      progreso_actual: ultimoProgreso,
      total_registros: parseInt(totalRegistros.total),
      pagina: pagina,
      por_pagina: porPagina,
      total_paginas: Math.ceil(parseInt(totalRegistros.total) / porPagina),
      historial: historialProgreso
    };
  } catch (error) {
    logger.error(`Error al obtener historial de progreso para tarea ${tareaId}: ${error.message}`);
    throw error;
  }
}

module.exports = { execute }; 