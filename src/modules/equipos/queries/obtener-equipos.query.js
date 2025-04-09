/**
 * Consulta para obtener equipos
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
 * Obtiene todos los equipos a los que tiene acceso un usuario
 * @param {string} usuarioId - ID del usuario
 * @param {Object} filtros - Filtros para la consulta
 * @returns {Promise<Array>} - Lista de equipos
 */
async function execute(usuarioId, filtros = {}) {
  try {
    logger.info(`Consultando equipos para usuario: ${usuarioId}`);
    
    // Construir la consulta base
    let query = `
      SELECT DISTINCT e.*,
             p.nombre as proyecto_nombre,
             (
               SELECT COUNT(*) 
               FROM equipo_usuarios eu 
               WHERE eu.equipo_id = e.id
             ) as total_miembros,
             (
               SELECT COUNT(*) 
               FROM tareas t 
               JOIN proyecto_equipos pe2 ON t.proyecto_id = pe2.proyecto_id AND pe2.equipo_id = e.id
             ) as total_tareas,
             (
               SELECT u.nombre
               FROM equipo_usuarios eu 
               JOIN usuarios u ON eu.usuario_id = u.id
               WHERE eu.equipo_id = e.id AND eu.rol = 'lider'
               LIMIT 1
             ) as lider_nombre,
             p.creado_por as creador_id,
             u_creador.nombre as creador_nombre
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      LEFT JOIN usuarios u_creador ON p.creado_por = u_creador.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE (
        p.creado_por = $1 OR 
        eu.usuario_id = $1
      )
    `;
    
    const queryParams = [usuarioId];
    let paramCount = 2;
    
    // Aplicar filtros
    const whereClauses = [];
    
    // Filtro por proyecto
    if (filtros.proyecto_id) {
      whereClauses.push(`pe.proyecto_id = $${paramCount++}`);
      queryParams.push(filtros.proyecto_id);
    }
    
    // Filtro por líder
    if (filtros.lider_id) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM equipo_usuarios eu_lider 
        WHERE eu_lider.equipo_id = e.id 
        AND eu_lider.usuario_id = $${paramCount++} 
        AND eu_lider.rol = 'lider'
      )`);
      queryParams.push(filtros.lider_id);
    }
    
    // Filtro por nombre de equipo (búsqueda parcial)
    if (filtros.busqueda) {
      whereClauses.push(`(e.nombre ILIKE $${paramCount} OR e.descripcion ILIKE $${paramCount})`);
      queryParams.push(`%${filtros.busqueda}%`);
      paramCount++;
    }
    
    // Filtro por equipos donde es miembro
    if (filtros.soy_miembro === 'true') {
      whereClauses.push(`eu.usuario_id = $1`);
    }
    
    // Filtro por equipos donde es líder
    if (filtros.soy_lider === 'true') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM equipo_usuarios eu_lider 
        WHERE eu_lider.equipo_id = e.id 
        AND eu_lider.usuario_id = $1 
        AND eu_lider.rol = 'lider'
      )`);
    }
    
    // Añadir cláusulas WHERE adicionales si hay filtros
    if (whereClauses.length > 0) {
      query += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    // Añadir ordenamiento
    query += ` ORDER BY `;
    
    if (filtros.ordenar_por) {
      const camposValidos = ['nombre', 'creado_en', 'actualizado_en'];
      const campoOrden = camposValidos.includes(filtros.ordenar_por) ? 
        `e.${filtros.ordenar_por}` : 'e.creado_en';
      
      query += `${campoOrden} ${filtros.orden === 'asc' ? 'ASC' : 'DESC'}`;
    } else {
      // Ordenamiento por defecto: más recientes primero
      query += `e.creado_en DESC`;
    }
    
    // Paginación
    const pagina = filtros.pagina || 1;
    const porPagina = filtros.por_pagina || 20;
    const offset = (pagina - 1) * porPagina;
    
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    queryParams.push(porPagina, offset);
    
    // Ejecutar la consulta
    const equipos = await db.manyOrNone(query, queryParams);
    
    // Consulta para obtener el total de equipos (para la paginación)
    let countQuery = `
      SELECT COUNT(DISTINCT e.id) 
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
      WHERE (
        p.creado_por = $1 OR 
        eu.usuario_id = $1
      )
    `;
    
    // Aplicar los mismos filtros a la consulta de conteo
    if (whereClauses.length > 0) {
      countQuery += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    const countParams = queryParams.slice(0, paramCount - 2); // Excluir parámetros de LIMIT y OFFSET
    const totalCount = await db.one(countQuery, countParams);
    
    logger.info(`Equipos encontrados: ${equipos.length}, Total: ${totalCount.count}`);
    
    // Para cada equipo, obtener miembros básicos (limitados a 5 por eficiencia)
    for (const equipo of equipos) {
      equipo.miembros_basicos = await db.manyOrNone(`
        SELECT eu.usuario_id, eu.rol, u.nombre
        FROM equipo_usuarios eu
        JOIN usuarios u ON eu.usuario_id = u.id
        WHERE eu.equipo_id = $1
        LIMIT 5
      `, [equipo.id]);
    }
    
    return {
      equipos,
      paginacion: {
        total: parseInt(totalCount.count),
        pagina: pagina,
        por_pagina: porPagina,
        total_paginas: Math.ceil(parseInt(totalCount.count) / porPagina)
      }
    };
  } catch (error) {
    logger.error(`Error al obtener equipos: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
