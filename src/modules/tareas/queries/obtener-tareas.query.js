/**
 * Consulta para obtener tareas
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
 * Obtiene todas las tareas a las que tiene acceso un usuario
 * @param {string} usuarioId - ID del usuario
 * @param {Object} filtros - Filtros para la consulta
 * @returns {Promise<Array>} - Lista de tareas
 */
async function execute(usuarioId, filtros = {}) {
  try {
    logger.info(`Consultando tareas para usuario: ${usuarioId}`);
    
    // Construir la consulta base
    let query = `
      SELECT t.*,
             u_asignado.nombre as asignado_nombre,
             e.nombre as equipo_nombre,
             p.nombre as proyecto_nombre,
             p.id as proyecto_id
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      LEFT JOIN usuarios u_asignado ON t.asignado_a = u_asignado.id
      WHERE (
        t.asignado_a = $1 OR 
        (eu.usuario_id = $1 AND eu.rol = 'lider') OR 
        eu.usuario_id = $1
      )
    `;
    
    const queryParams = [usuarioId];
    let paramCount = 2;
    
    // Aplicar filtros
    const whereClauses = [];
    
    // Filtro por equipo
    if (filtros.equipo_id) {
      whereClauses.push(`pe.equipo_id = $${paramCount++}`);
      queryParams.push(filtros.equipo_id);
    }
    
    // Filtro por proyecto
    if (filtros.proyecto_id) {
      whereClauses.push(`pe.proyecto_id = $${paramCount++}`);
      queryParams.push(filtros.proyecto_id);
    }
    
    // Filtro por estado
    if (filtros.estado) {
      whereClauses.push(`t.estado = $${paramCount++}`);
      queryParams.push(filtros.estado);
    }
    
    // Filtro por prioridad
    if (filtros.prioridad) {
      whereClauses.push(`t.prioridad = $${paramCount++}`);
      queryParams.push(filtros.prioridad);
    }
    
    // Filtro por usuario asignado
    if (filtros.asignado_a) {
      whereClauses.push(`t.asignado_a = $${paramCount++}`);
      queryParams.push(filtros.asignado_a);
    }
    
    // Filtro por tareas sin asignar
    if (filtros.sin_asignar === 'true') {
      whereClauses.push(`t.asignado_a IS NULL`);
    }
    
    // Filtro por título o descripción (búsqueda parcial)
    if (filtros.busqueda) {
      whereClauses.push(`(t.titulo ILIKE $${paramCount} OR t.descripcion ILIKE $${paramCount})`);
      queryParams.push(`%${filtros.busqueda}%`);
      paramCount++;
    }
    
    // Filtro por etiquetas
    if (filtros.etiqueta) {
      whereClauses.push(`$${paramCount} = ANY(t.etiquetas)`);
      queryParams.push(filtros.etiqueta);
      paramCount++;
    }
    
    // Filtro por fecha de vencimiento (rango)
    if (filtros.fecha_vencimiento_desde) {
      whereClauses.push(`t.fecha_vencimiento >= $${paramCount++}`);
      queryParams.push(filtros.fecha_vencimiento_desde);
    }
    
    if (filtros.fecha_vencimiento_hasta) {
      whereClauses.push(`t.fecha_vencimiento <= $${paramCount++}`);
      queryParams.push(filtros.fecha_vencimiento_hasta);
    }
    
    // Filtro por tareas vencidas
    if (filtros.vencidas === 'true') {
      whereClauses.push(`t.fecha_vencimiento < CURRENT_DATE AND t.estado != 'completada'`);
    }
    
    // Filtro por tareas para hoy
    if (filtros.hoy === 'true') {
      whereClauses.push(`DATE(t.fecha_vencimiento) = CURRENT_DATE`);
    }
    
    // Añadir cláusulas WHERE adicionales si hay filtros
    if (whereClauses.length > 0) {
      query += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    // Añadir ordenamiento
    query += ` ORDER BY `;
    
    if (filtros.ordenar_por) {
      const camposValidos = ['titulo', 'fecha_vencimiento', 'prioridad', 'estado', 'creado_en'];
      const campoOrden = camposValidos.includes(filtros.ordenar_por) ? 
        `t.${filtros.ordenar_por}` : 't.creado_en';
      
      query += `${campoOrden} ${filtros.orden === 'asc' ? 'ASC' : 'DESC'}`;
    } else {
      // Ordenamiento por defecto: primero por prioridad (alta a baja) y luego por fecha de vencimiento (más cercana primero)
      query += `CASE 
                  WHEN t.prioridad = 'urgente' THEN 1 
                  WHEN t.prioridad = 'alta' THEN 2 
                  WHEN t.prioridad = 'media' THEN 3 
                  WHEN t.prioridad = 'baja' THEN 4 
                  ELSE 5 
                END ASC, 
                t.fecha_vencimiento ASC NULLS LAST`;
    }
    
    // Paginación
    const pagina = filtros.pagina || 1;
    const porPagina = filtros.por_pagina || 20;
    const offset = (pagina - 1) * porPagina;
    
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    queryParams.push(porPagina, offset);
    
    // Ejecutar la consulta
    const tareas = await db.manyOrNone(query, queryParams);
    
    // Consulta para obtener el total de tareas (para la paginación)
    let countQuery = `
      SELECT COUNT(DISTINCT t.id) 
      FROM tareas t
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN proyecto_equipos pe ON t.proyecto_id = pe.proyecto_id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE (
        t.asignado_a = $1 OR 
        (eu.usuario_id = $1 AND eu.rol = 'lider') OR 
        eu.usuario_id = $1
      )
    `;
    
    // Aplicar los mismos filtros a la consulta de conteo
    if (whereClauses.length > 0) {
      countQuery += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    const countParams = queryParams.slice(0, paramCount - 2); // Excluir parámetros de LIMIT y OFFSET
    const totalCount = await db.one(countQuery, countParams);
    
    logger.info(`Tareas encontradas: ${tareas.length}, Total: ${totalCount.count}`);
    
    return {
      tareas,
      paginacion: {
        total: parseInt(totalCount.count),
        pagina: pagina,
        por_pagina: porPagina,
        total_paginas: Math.ceil(parseInt(totalCount.count) / porPagina)
      }
    };
  } catch (error) {
    logger.error(`Error al obtener tareas: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
