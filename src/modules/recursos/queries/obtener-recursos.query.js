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
             u.nombre as creador_nombre,
             (
               SELECT COUNT(*) 
               FROM recurso_asignaciones ra 
               WHERE ra.recurso_id = r.id AND (ra.fecha_fin IS NULL OR ra.fecha_fin > CURRENT_DATE)
             ) as asignaciones_activas
      FROM recursos r
      LEFT JOIN usuarios u ON r.creado_por = u.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 1;
    
    // Por defecto, mostrar recursos propios o los que están asignados a equipos donde el usuario es miembro
    const accesoBasico = `
      (r.creado_por = $${paramCount} OR 
       EXISTS (
         SELECT 1 
         FROM recurso_asignaciones ra
         JOIN equipos e ON ra.equipo_id = e.id
         LEFT JOIN equipo_usuarios eu ON e.id = eu.equipo_id
         WHERE ra.recurso_id = r.id AND (e.lider_id = $${paramCount} OR eu.usuario_id = $${paramCount})
       ))
    `;
    queryParams.push(usuarioId);
    paramCount++;
    
    // Agregar restricción de acceso según modo
    if (filtros.modo === 'todos') {
      // En modo 'todos', no aplicar restricción adicional
      // Solo administradores deberían poder usar este modo, verificar permisos en el controlador
    } else if (filtros.modo === 'creados') {
      // Solo recursos creados por el usuario
      query += ` AND r.creado_por = $${paramCount - 1}`;
    } else {
      // Modo por defecto: recursos propios o asignados a equipos donde es miembro
      query += ` AND ${accesoBasico}`;
    }
    
    // Aplicar filtros adicionales
    const whereClauses = [];
    
    // Filtro por tipo
    if (filtros.tipo) {
      whereClauses.push(`r.tipo = $${paramCount++}`);
      queryParams.push(filtros.tipo);
    }
    
    // Filtro por disponibilidad
    if (filtros.disponibilidad) {
      whereClauses.push(`r.disponibilidad = $${paramCount++}`);
      queryParams.push(filtros.disponibilidad);
    }
    
    // Filtro por nombre o descripción (búsqueda parcial)
    if (filtros.busqueda) {
      whereClauses.push(`(r.nombre ILIKE $${paramCount} OR r.descripcion ILIKE $${paramCount})`);
      queryParams.push(`%${filtros.busqueda}%`);
      paramCount++;
    }
    
    // Filtro por rango de costo
    if (filtros.costo_minimo !== undefined) {
      whereClauses.push(`r.costo >= $${paramCount++}`);
      queryParams.push(parseFloat(filtros.costo_minimo));
    }
    
    if (filtros.costo_maximo !== undefined) {
      whereClauses.push(`r.costo <= $${paramCount++}`);
      queryParams.push(parseFloat(filtros.costo_maximo));
    }
    
    // Filtro por moneda
    if (filtros.moneda) {
      whereClauses.push(`r.moneda = $${paramCount++}`);
      queryParams.push(filtros.moneda);
    }
    
    // Filtro por equipo asignado
    if (filtros.equipo_id) {
      whereClauses.push(`
        EXISTS (
          SELECT 1 
          FROM recurso_asignaciones ra 
          WHERE ra.recurso_id = r.id AND ra.equipo_id = $${paramCount} AND 
                (ra.fecha_fin IS NULL OR ra.fecha_fin > CURRENT_DATE)
        )
      `);
      queryParams.push(filtros.equipo_id);
      paramCount++;
    }
    
    // Filtro por recursos disponibles (sin asignaciones activas)
    if (filtros.disponibles === 'true') {
      whereClauses.push(`
        NOT EXISTS (
          SELECT 1 
          FROM recurso_asignaciones ra 
          WHERE ra.recurso_id = r.id AND 
                (ra.fecha_fin IS NULL OR ra.fecha_fin > CURRENT_DATE)
        )
      `);
    }
    
    // Añadir cláusulas WHERE adicionales si hay filtros
    if (whereClauses.length > 0) {
      query += ` AND ${whereClauses.join(' AND ')}`;
    }
    
    // Añadir ordenamiento
    query += ` ORDER BY `;
    
    if (filtros.ordenar_por) {
      const camposValidos = ['nombre', 'tipo', 'costo', 'disponibilidad', 'creado_en'];
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
    let countQuery = query.replace(/SELECT r\.\*,[\s\S]*FROM/, 'SELECT COUNT(DISTINCT r.id) FROM');
    countQuery = countQuery.substring(0, countQuery.indexOf('ORDER BY'));
    
    const countParams = queryParams.slice(0, paramCount - 2); // Excluir parámetros de LIMIT y OFFSET
    const totalCount = await db.one(countQuery, countParams);
    
    logger.info(`Recursos encontrados: ${recursos.length}, Total: ${totalCount.count}`);
    
    // Para cada recurso, obtener una vista previa de asignaciones activas (limitado por eficiencia)
    for (const recurso of recursos) {
      recurso.asignaciones_preview = await db.manyOrNone(`
        SELECT ra.id, ra.equipo_id, e.nombre as equipo_nombre, ra.fecha_inicio, ra.fecha_fin, ra.cantidad
        FROM recurso_asignaciones ra
        JOIN equipos e ON ra.equipo_id = e.id
        WHERE ra.recurso_id = $1 AND (ra.fecha_fin IS NULL OR ra.fecha_fin > CURRENT_DATE)
        ORDER BY ra.fecha_inicio DESC
        LIMIT 3
      `, [recurso.id]);
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
