/**
 * Consulta para obtener informes de uso de recursos
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
 * Obtiene un informe de uso de recursos
 * @param {Object} filtros - Filtros para el informe
 * @param {string} usuarioId - ID del usuario que solicita el informe
 * @returns {Promise<Object>} - Datos del informe de uso de recursos
 */
async function execute(filtros, usuarioId) {
  try {
    logger.info(`Generando informe de uso de recursos para usuario: ${usuarioId}`);
    
    // Determinar el período para el informe
    let fechaInicio = new Date();
    let fechaFin = new Date();
    
    switch (filtros.periodo) {
      case 'semana':
        fechaInicio.setDate(fechaInicio.getDate() - 7);
        break;
      case 'mes':
        fechaInicio.setMonth(fechaInicio.getMonth() - 1);
        break;
      case 'trimestre':
        fechaInicio.setMonth(fechaInicio.getMonth() - 3);
        break;
      case 'semestre':
        fechaInicio.setMonth(fechaInicio.getMonth() - 6);
        break;
      case 'año':
        fechaInicio.setFullYear(fechaInicio.getFullYear() - 1);
        break;
      case 'personalizado':
        if (filtros.fecha_inicio) {
          fechaInicio = new Date(filtros.fecha_inicio);
        }
        if (filtros.fecha_fin) {
          fechaFin = new Date(filtros.fecha_fin);
        }
        break;
      default:
        // Por defecto, último mes
        fechaInicio.setMonth(fechaInicio.getMonth() - 1);
    }
    
    // Construir la consulta base según filtros
    let queryParams = [fechaInicio, fechaFin, usuarioId];
    let condiciones = [];
    let paramCount = 4;
    
    // Si se especifica un nombre de recurso para filtrar
    if (filtros.tipo) {
      condiciones.push(`r.nombre ILIKE $${paramCount}`);
      queryParams.push(`%${filtros.tipo}%`);
      paramCount++;
    }
    
    // Filtrar por proyecto
    if (filtros.proyecto_id) {
      condiciones.push(`p.id = $${paramCount}`);
      queryParams.push(filtros.proyecto_id);
      paramCount++;
    }
    
    // Combinar condiciones
    const condicionesSQL = condiciones.length > 0 ? `AND ${condiciones.join(' AND ')}` : '';
    
    // Obtener recursos y su uso
    const recursos = await db.manyOrNone(`
      SELECT 
        r.id,
        r.nombre,
        r.descripcion,
        r.cantidad,
        r.creado_en,
        r.actualizado_en,
        p.id as proyecto_id,
        p.nombre as proyecto_nombre,
        COUNT(DISTINCT t.id) as tareas_asociadas
      FROM recursos r
      JOIN proyectos p ON r.proyecto_id = p.id
      LEFT JOIN tareas t ON t.proyecto_id = p.id
      WHERE r.creado_en >= $1
      AND r.actualizado_en <= $2
      AND (p.creado_por = $3 OR
           EXISTS (SELECT 1 FROM equipo_usuarios eu 
                  JOIN equipos e ON eu.equipo_id = e.id
                  JOIN proyecto_equipos pe ON e.id = pe.equipo_id
                  WHERE pe.proyecto_id = p.id AND eu.usuario_id = $3))
      ${condicionesSQL}
      GROUP BY r.id, r.nombre, r.descripcion, r.cantidad, r.creado_en, r.actualizado_en, p.id, p.nombre
      ORDER BY tareas_asociadas DESC
    `, queryParams);
    
    // Calcular métricas generales
    const totalRecursos = recursos.length;
    const totalCantidad = recursos.reduce((sum, r) => sum + parseInt(r.cantidad || 1), 0);
    const recursosPorProyecto = {};
    
    // Agrupar recursos por proyecto
    for (const recurso of recursos) {
      if (!recursosPorProyecto[recurso.proyecto_id]) {
        recursosPorProyecto[recurso.proyecto_id] = {
          proyecto_id: recurso.proyecto_id,
          proyecto_nombre: recurso.proyecto_nombre,
          total_recursos: 0,
          recursos: []
        };
      }
      
      recursosPorProyecto[recurso.proyecto_id].total_recursos++;
      recursosPorProyecto[recurso.proyecto_id].recursos.push(recurso);
    }
    
    // Calcular resumen general
    const resumenGeneral = {
      total_recursos: totalRecursos,
      total_cantidad: totalCantidad,
      recursos_mas_utilizados: recursos.slice(0, 5),
      total_proyectos_con_recursos: Object.keys(recursosPorProyecto).length
    };
    
    // Resultados del informe
    const resultado = {
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin,
        descripcion: filtros.periodo || 'personalizado'
      },
      resumen: resumenGeneral,
      recursos_por_proyecto: Object.values(recursosPorProyecto),
      recursos: recursos,
      generado_en: new Date()
    };
    
    logger.info(`Informe de uso de recursos generado exitosamente para ${recursos.length} recursos`);
    
    return resultado;
  } catch (error) {
    logger.error(`Error al generar informe de uso de recursos: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
