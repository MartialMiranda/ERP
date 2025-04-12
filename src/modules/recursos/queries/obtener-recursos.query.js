/**
 * Consulta para obtener recursos
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
 * Obtiene todos los recursos a los que tiene acceso un usuario
 * @param {string} usuarioId - ID del usuario
 * @param {Object} filtros - Filtros para la consulta
 * @returns {Promise<Array>} - Lista de recursos
 */
async function execute(usuarioId, filtros = {}) {
  try {
    logger.info(`Consultando recursos para usuario: ${usuarioId}`);
    
    // Construir la consulta base
    let query = `
      SELECT r.*,
             p.nombre as proyecto_nombre,
             (
               SELECT COUNT(*) 
               FROM equipo_usuarios eu
               JOIN equipos e ON eu.equipo_id = e.id 
               JOIN proyecto_equipos pe ON e.id = pe.equipo_id
               WHERE pe.proyecto_id = r.proyecto_id
             ) as equipos_asignados
      FROM recursos r
      LEFT JOIN proyectos p ON r.proyecto_id = p.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 1;
    
    // Por defecto, mostrar recursos de proyectos donde el usuario es miembro de algún equipo
    const accesoBasico = `
      (
        p.creado_por = $${paramCount} OR
        EXISTS (
          SELECT 1 
          FROM proyecto_equipos pe
          JOIN equipo_usuarios eu ON pe.equipo_id = eu.equipo_id
          WHERE pe.proyecto_id = r.proyecto_id AND eu.usuario_id = $${paramCount}
        )
      )
    `;
    queryParams.push(usuarioId);
    paramCount++;
    
    // Agregar restricción de acceso según modo
    if (filtros.modo === 'todos') {
      // En modo 'todos', no aplicar restricción adicional
      // Solo administradores deberían poder usar este modo, verificar permisos en el controlador
    } else {
      // Modo por defecto: recursos de proyectos donde es miembro de algún equipo o creador
      query += ` AND ${accesoBasico}`;
    }
    
    // Aplicar filtros adicionales
    const whereClauses = [];
    
    // Filtro por nombre o descripción (búsqueda parcial)
    if (filtros.busqueda) {
      whereClauses.push(`(r.nombre ILIKE $${paramCount} OR r.descripcion ILIKE $${paramCount})`);
      queryParams.push(`%${filtros.busqueda}%`);
      paramCount++;
    }
    
    // Filtro por cantidad
    if (filtros.cantidad_minima !== undefined) {
      whereClauses.push(`r.cantidad >= $${paramCount++}`);
      queryParams.push(parseInt(filtros.cantidad_minima));
    }
    
    if (filtros.cantidad_maxima !== undefined) {
      whereClauses.push(`r.cantidad <= $${paramCount++}`);
      queryParams.push(parseInt(filtros.cantidad_maxima));
    }
    
    // Filtro por proyecto
    if (filtros.proyecto_id) {
      whereClauses.push(`r.proyecto_id = $${paramCount++}`);
      queryParams.push(filtros.proyecto_id);
    }
    
    // Filtro por equipo asignado al proyecto
    if (filtros.equipo_id) {
      whereClauses.push(`
        EXISTS (
          SELECT 1 
          FROM proyecto_equipos pe 
          WHERE pe.proyecto_id = r.proyecto_id AND pe.equipo_id = $${paramCount}
        )
      `);
      queryParams.push(filtros.equipo_id);
      paramCount++;
    }
    
    // Añadir cláusulas WHERE adicionales si hay filtros
    if (whereClauses.length > 0) {
      query += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    // Añadir ordenamiento
    query += ` ORDER BY `;
    
    if (filtros.ordenar_por) {
      const camposValidos = ['nombre', 'cantidad', 'creado_en'];
      const campoOrden = camposValidos.includes(filtros.ordenar_por) ? 
        `r.${filtros.ordenar_por}` : 'r.creado_en';
      
      query += `${campoOrden} ${filtros.orden === 'asc' ? 'ASC' : 'DESC'}`;
    } else {
      // Ordenamiento por defecto: por nombre ascendente
      query += `r.nombre ASC`;
    }
    
    // Paginación
    const pagina = filtros.pagina || 1;
    const porPagina = filtros.por_pagina || 20;
    const offset = (pagina - 1) * porPagina;
    
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    queryParams.push(porPagina, offset);
    
    // Ejecutar la consulta
    const recursos = await db.manyOrNone(query, queryParams);
    
    // Consulta para obtener el total de recursos (para la paginación)
    let countQuery = `
      SELECT COUNT(DISTINCT r.id)
      FROM recursos r
      LEFT JOIN proyectos p ON r.proyecto_id = p.id
      WHERE 1=1
    `;
    
    // Añadir restricción de acceso según modo
    if (filtros.modo !== 'todos') {
      countQuery += ` AND ${accesoBasico}`;
    }
    
    // Añadir las mismas cláusulas WHERE adicionales
    if (whereClauses.length > 0) {
      countQuery += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    const countParams = queryParams.slice(0, paramCount - 2); // Excluir parámetros de LIMIT y OFFSET
    const totalCount = await db.one(countQuery, countParams);
    
    logger.info(`Recursos encontrados: ${recursos.length}, Total: ${totalCount.count}`);
    
    // Para cada recurso, obtener una vista previa de equipos asociados al proyecto
    for (const recurso of recursos) {
      if (recurso.proyecto_id) {
        // Obtener equipos del proyecto
        recurso.equipos_preview = await db.manyOrNone(`
          SELECT e.id, e.nombre, pe.creado_en
          FROM equipos e
          JOIN proyecto_equipos pe ON e.id = pe.equipo_id
          WHERE pe.proyecto_id = $1
          ORDER BY pe.creado_en DESC
          LIMIT 3
        `, [recurso.proyecto_id]);
        
        // Obtener información del proyecto
        recurso.proyecto = await db.oneOrNone(`
          SELECT p.id, p.nombre, p.estado, p.fecha_inicio, p.fecha_fin
          FROM proyectos p
          WHERE p.id = $1
        `, [recurso.proyecto_id]);
      } else {
        recurso.equipos_preview = [];
        recurso.proyecto = null;
      }
    }
    
    return {
      recursos,
      paginacion: {
        total: parseInt(totalCount.count),
        pagina: pagina,
        por_pagina: porPagina,
        total_paginas: Math.ceil(parseInt(totalCount.count) / porPagina)
      }
    };
  } catch (error) {
    logger.error(`Error al obtener recursos: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
