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
    
    // Filtrar por tipo de recurso
    if (filtros.tipo) {
      condiciones.push(`r.tipo = $${paramCount}`);
      queryParams.push(filtros.tipo);
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
    
    // Obtener uso de recursos en equipos
    const recursosEnEquipos = await db.manyOrNone(`
      SELECT 
        r.id as recurso_id,
        r.nombre as recurso_nombre,
        r.tipo as recurso_tipo,
        r.costo as recurso_costo,
        r.moneda as recurso_moneda,
        COUNT(DISTINCT ra.id) as total_asignaciones,
        COUNT(DISTINCT ra.equipo_id) as equipos_asignados,
        SUM(CASE WHEN ra.fecha_fin IS NULL OR ra.fecha_fin > CURRENT_DATE THEN 1 ELSE 0 END) as asignaciones_activas,
        AVG(EXTRACT(EPOCH FROM (COALESCE(ra.fecha_fin, CURRENT_DATE) - ra.fecha_inicio))/86400.0)::numeric as promedio_dias_asignacion,
        SUM(ra.cantidad) as cantidad_total_asignada
      FROM recursos r
      JOIN recurso_asignaciones ra ON r.id = ra.recurso_id
      JOIN equipos e ON ra.equipo_id = e.id
      JOIN proyectos p ON e.proyecto_id = p.id
      WHERE ra.fecha_inicio >= $1 AND (ra.fecha_fin <= $2 OR ra.fecha_fin IS NULL)
      AND (r.creado_por = $3 OR e.lider_id = $3 OR p.lider_id = $3 OR
           EXISTS (SELECT 1 FROM equipo_usuarios eu WHERE eu.equipo_id = e.id AND eu.usuario_id = $3))
      ${condicionesSQL}
      GROUP BY r.id, r.nombre, r.tipo, r.costo, r.moneda
      ORDER BY total_asignaciones DESC
    `, queryParams);
    
    // Obtener uso de recursos en tareas
    const recursosEnTareas = await db.manyOrNone(`
      SELECT 
        r.id as recurso_id,
        r.nombre as recurso_nombre,
        r.tipo as recurso_tipo,
        r.costo as recurso_costo,
        r.moneda as recurso_moneda,
        COUNT(DISTINCT tr.id) as total_asignaciones,
        COUNT(DISTINCT tr.tarea_id) as tareas_asignadas,
        SUM(CASE WHEN tr.estado = 'activo' THEN 1 ELSE 0 END) as asignaciones_activas,
        AVG(EXTRACT(EPOCH FROM (COALESCE(tr.fecha_fin, CURRENT_DATE) - tr.fecha_inicio))/86400.0)::numeric as promedio_dias_asignacion,
        SUM(tr.cantidad) as cantidad_total_asignada,
        AVG(tr.evaluacion)::numeric as promedio_evaluacion
      FROM recursos r
      JOIN tarea_recursos tr ON r.id = tr.recurso_id
      JOIN tareas t ON tr.tarea_id = t.id
      JOIN proyectos p ON t.proyecto_id = p.id
      LEFT JOIN equipos e ON t.equipo_id = e.id
      WHERE tr.fecha_inicio >= $1 AND (tr.fecha_fin <= $2 OR tr.fecha_fin IS NULL)
      AND (r.creado_por = $3 OR e.lider_id = $3 OR p.lider_id = $3 OR t.asignado_a = $3 OR
           EXISTS (SELECT 1 FROM equipo_usuarios eu WHERE eu.equipo_id = e.id AND eu.usuario_id = $3))
      ${condicionesSQL}
      GROUP BY r.id, r.nombre, r.tipo, r.costo, r.moneda
      ORDER BY total_asignaciones DESC
    `, queryParams);
    
    // Consolidar datos y calcular métricas adicionales
    const recursosConsolidados = new Map();
    
    // Procesar recursos asignados a equipos
    for (const recurso of recursosEnEquipos) {
      recurso.tipo_asignacion = 'equipo';
      recurso.promedio_dias_asignacion = parseFloat(recurso.promedio_dias_asignacion).toFixed(2);
      
      if (!recursosConsolidados.has(recurso.recurso_id)) {
        recursosConsolidados.set(recurso.recurso_id, {
          ...recurso,
          asignaciones_equipos: parseInt(recurso.total_asignaciones),
          asignaciones_tareas: 0,
          costo_total: parseFloat(recurso.recurso_costo) * parseInt(recurso.cantidad_total_asignada)
        });
      }
    }
    
    // Procesar recursos asignados a tareas
    for (const recurso of recursosEnTareas) {
      recurso.tipo_asignacion = 'tarea';
      recurso.promedio_dias_asignacion = parseFloat(recurso.promedio_dias_asignacion).toFixed(2);
      recurso.promedio_evaluacion = recurso.promedio_evaluacion ? parseFloat(recurso.promedio_evaluacion).toFixed(1) : null;
      
      if (recursosConsolidados.has(recurso.recurso_id)) {
        const recursoConsolidado = recursosConsolidados.get(recurso.recurso_id);
        recursoConsolidado.asignaciones_tareas = parseInt(recurso.total_asignaciones);
        recursoConsolidado.tareas_asignadas = parseInt(recurso.tareas_asignadas);
        recursoConsolidado.promedio_evaluacion = recurso.promedio_evaluacion;
        recursoConsolidado.costo_total += parseFloat(recurso.recurso_costo) * parseInt(recurso.cantidad_total_asignada);
      } else {
        recursosConsolidados.set(recurso.recurso_id, {
          ...recurso,
          asignaciones_equipos: 0,
          asignaciones_tareas: parseInt(recurso.total_asignaciones),
          costo_total: parseFloat(recurso.recurso_costo) * parseInt(recurso.cantidad_total_asignada)
        });
      }
    }
    
    // Convertir Map a Array
    const recursos = Array.from(recursosConsolidados.values()).map(recurso => ({
      ...recurso,
      asignaciones_totales: recurso.asignaciones_equipos + recurso.asignaciones_tareas,
      costo_total: parseFloat(recurso.costo_total).toFixed(2)
    }));
    
    // Ordenar por total de asignaciones (descendente)
    recursos.sort((a, b) => b.asignaciones_totales - a.asignaciones_totales);
    
    // Calcular estadísticas por tipo de recurso
    const estadisticasPorTipo = {};
    
    for (const recurso of recursos) {
      if (!estadisticasPorTipo[recurso.recurso_tipo]) {
        estadisticasPorTipo[recurso.recurso_tipo] = {
          total_recursos: 0,
          total_asignaciones: 0,
          costo_total: 0,
          asignaciones_activas: 0
        };
      }
      
      estadisticasPorTipo[recurso.recurso_tipo].total_recursos++;
      estadisticasPorTipo[recurso.recurso_tipo].total_asignaciones += recurso.asignaciones_totales;
      estadisticasPorTipo[recurso.recurso_tipo].costo_total += parseFloat(recurso.costo_total);
      estadisticasPorTipo[recurso.recurso_tipo].asignaciones_activas += parseInt(recurso.asignaciones_activas || 0);
    }
    
    // Formatear costos totales
    Object.keys(estadisticasPorTipo).forEach(tipo => {
      estadisticasPorTipo[tipo].costo_total = parseFloat(estadisticasPorTipo[tipo].costo_total).toFixed(2);
    });
    
    // Calcular resumen general
    const resumenGeneral = {
      total_recursos: recursos.length,
      total_asignaciones: recursos.reduce((sum, r) => sum + r.asignaciones_totales, 0),
      recursos_mas_utilizados: recursos.slice(0, 5),
      costo_total: parseFloat(recursos.reduce((sum, r) => sum + parseFloat(r.costo_total), 0)).toFixed(2),
      recurso_mejor_evaluado: null
    };
    
    // Encontrar el recurso mejor evaluado
    const recursosConEvaluacion = recursos.filter(r => r.promedio_evaluacion);
    if (recursosConEvaluacion.length > 0) {
      resumenGeneral.recurso_mejor_evaluado = recursosConEvaluacion.sort(
        (a, b) => parseFloat(b.promedio_evaluacion) - parseFloat(a.promedio_evaluacion)
      )[0];
    }
    
    // Resultados del informe
    const resultado = {
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin,
        descripcion: filtros.periodo || 'personalizado'
      },
      resumen: resumenGeneral,
      estadisticas_por_tipo: estadisticasPorTipo,
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
