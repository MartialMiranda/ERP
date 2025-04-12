/**
 * Consulta para obtener informes de rendimiento de equipos
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
 * Obtiene un informe de rendimiento de equipos
 * @param {Object} filtros - Filtros para el informe
 * @param {string} usuarioId - ID del usuario que solicita el informe
 * @returns {Promise<Object>} - Datos del informe de rendimiento
 */
async function execute(filtros, usuarioId) {
  try {
    logger.info(`Generando informe de rendimiento de equipos para usuario: ${usuarioId}`);
    
    // Verificar permisos del usuario (debe tener acceso a los proyectos/equipos que consulta)
    if (filtros.proyecto_id) {
      const tieneAcceso = await db.oneOrNone(`
        SELECT 1
        FROM proyectos p
        LEFT JOIN proyecto_equipos pe ON pe.proyecto_id = p.id
        LEFT JOIN equipos e ON e.id = pe.equipo_id
        LEFT JOIN equipo_usuarios eu ON eu.equipo_id = e.id
        WHERE p.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
        LIMIT 1
      `, [filtros.proyecto_id, usuarioId]);
      
      if (!tieneAcceso) {
        logger.warn(`Usuario ${usuarioId} sin acceso al proyecto ${filtros.proyecto_id}`);
        throw new Error('Sin permisos para acceder a este proyecto');
      }
    }
    
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
    
    // Consulta base para el informe según si se filtra por un proyecto específico o todos
    let queryParams = [fechaInicio, fechaFin, usuarioId];
    let proyectoCondicion = '';
    
    if (filtros.proyecto_id) {
      queryParams.push(filtros.proyecto_id);
      proyectoCondicion = 'AND p.id = $4';
    }
    
    // Consulta para obtener métricas por equipo
    const equiposData = await db.manyOrNone(`
      SELECT 
        e.id as equipo_id,
        e.nombre as equipo_nombre,
        COUNT(DISTINCT eu.usuario_id) as total_miembros,
        COUNT(DISTINCT t.id) as total_tareas,
        COUNT(DISTINCT CASE WHEN t.estado = 'completada' THEN t.id END) as tareas_completadas,
        COUNT(DISTINCT CASE WHEN t.estado = 'en_progreso' THEN t.id END) as tareas_en_progreso,
        COUNT(DISTINCT CASE WHEN t.estado = 'pendiente' THEN t.id END) as tareas_pendientes,
        ROUND(AVG(CASE WHEN t.estado = 'completada' THEN EXTRACT(EPOCH FROM (t.actualizado_en - t.creado_en))/86400.0 ELSE NULL END)::numeric, 2) as promedio_dias_tarea,
        COUNT(DISTINCT r.id) as total_recursos
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      LEFT JOIN equipo_usuarios eu ON eu.equipo_id = e.id
      LEFT JOIN tareas t ON t.proyecto_id = p.id AND t.creado_en >= $1 AND (t.actualizado_en <= $2 OR t.estado != 'completada')
      LEFT JOIN recursos r ON r.proyecto_id = p.id
      WHERE (p.creado_por = $3 OR eu.usuario_id = $3) ${proyectoCondicion}
      GROUP BY e.id, e.nombre
      ORDER BY tareas_completadas DESC
    `, queryParams);
    
    // Calcular métricas adicionales para cada equipo
    for (const equipo of equiposData) {
      // Calcular tasa de finalización de tareas
      equipo.tasa_finalizacion = equipo.total_tareas > 0 ? 
        Math.round((equipo.tareas_completadas / equipo.total_tareas) * 100) : 0;
    }
    
    // Obtener datos de rendimiento general
    const resumenGeneral = {
      total_equipos: equiposData.length,
      total_tareas: equiposData.reduce((sum, equipo) => sum + parseInt(equipo.total_tareas || 0), 0),
      tareas_completadas: equiposData.reduce((sum, equipo) => sum + parseInt(equipo.tareas_completadas || 0), 0),
      tasa_finalizacion_global: 0,
      promedio_dias_por_tarea: 0,
      total_recursos: equiposData.reduce((sum, equipo) => sum + parseInt(equipo.total_recursos || 0), 0)
    };
    
    // Calcular tasa de finalización global
    if (resumenGeneral.total_tareas > 0) {
      resumenGeneral.tasa_finalizacion_global = Math.round(
        (resumenGeneral.tareas_completadas / resumenGeneral.total_tareas) * 100
      );
    }
    
    // Calcular promedio de días por tarea
    const equiposConTareas = equiposData.filter(equipo => equipo.promedio_dias_tarea != null);
    if (equiposConTareas.length > 0) {
      resumenGeneral.promedio_dias_por_tarea = parseFloat(
        (equiposConTareas.reduce((sum, equipo) => sum + parseFloat(equipo.promedio_dias_tarea || 0), 0) / 
        equiposConTareas.length).toFixed(2)
      );
    }
    
    // Determinar el equipo más productivo (mayor tasa de finalización y menor tiempo promedio)
    if (equiposData.length > 0) {
      resumenGeneral.equipo_mas_productivo = equiposData
        .filter(equipo => equipo.total_tareas > 0 && equipo.promedio_dias_tarea != null)
        .sort((a, b) => {
          // Ordenar primero por tasa de finalización (mayor a menor)
          const tasaComparacion = b.tasa_finalizacion - a.tasa_finalizacion;
          if (tasaComparacion !== 0) return tasaComparacion;
          
          // Si la tasa es igual, ordenar por tiempo promedio (menor a mayor)
          return a.promedio_dias_tarea - b.promedio_dias_tarea;
        })[0] || null;
    }
    
    // Resultados del informe
    const resultado = {
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin,
        descripcion: filtros.periodo || 'personalizado'
      },
      resumen: resumenGeneral,
      equipos: equiposData,
      generado_en: new Date()
    };
    
    logger.info(`Informe de rendimiento generado exitosamente para ${equiposData.length} equipos`);
    
    return resultado;
  } catch (error) {
    logger.error(`Error al generar informe de rendimiento: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
