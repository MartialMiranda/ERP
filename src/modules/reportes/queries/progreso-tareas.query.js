/**
 * Consulta para obtener informes de progreso de tareas
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
 * Obtiene un informe de progreso de tareas
 * @param {Object} filtros - Filtros para el informe
 * @param {string} usuarioId - ID del usuario que solicita el informe
 * @returns {Promise<Object>} - Datos del informe de progreso de tareas
 */
async function execute(filtros, usuarioId) {
  try {
    logger.info(`Generando informe de progreso de tareas para usuario: ${usuarioId}`);
    
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
    
    // Filtrar por tarea específica
    if (filtros.tarea_id) {
      condiciones.push(`rp.tarea_id = $${paramCount}`);
      queryParams.push(filtros.tarea_id);
      paramCount++;
    }
    
    // Filtrar por proyecto
    if (filtros.proyecto_id) {
      condiciones.push(`t.proyecto_id = $${paramCount}`);
      queryParams.push(filtros.proyecto_id);
      paramCount++;
    }
    
    // Combinar condiciones
    const condicionesSQL = condiciones.length > 0 ? `AND ${condiciones.join(' AND ')}` : '';
    
    // Obtener reportes de progreso
    const reportes = await db.manyOrNone(`
      SELECT 
        rp.id,
        rp.tarea_id,
        rp.usuario_id,
        rp.comentario,
        rp.progreso_porcentaje,
        rp.creado_en,
        t.titulo as tarea_titulo,
        t.estado as tarea_estado,
        t.proyecto_id,
        p.nombre as proyecto_nombre,
        u.nombre as usuario_nombre
      FROM reportes_progreso rp
      JOIN tareas t ON rp.tarea_id = t.id
      JOIN proyectos p ON t.proyecto_id = p.id
      JOIN usuarios u ON rp.usuario_id = u.id
      WHERE rp.creado_en >= $1
      AND rp.creado_en <= $2
      AND (
        t.asignado_a = $3 OR
        p.creado_por = $3 OR
        EXISTS (SELECT 1 FROM equipo_usuarios eu 
                JOIN equipos e ON eu.equipo_id = e.id
                JOIN proyecto_equipos pe ON e.id = pe.equipo_id
                WHERE pe.proyecto_id = p.id AND eu.usuario_id = $3)
      ) ${condicionesSQL}
      ORDER BY rp.creado_en DESC
    `, queryParams);
    
    // Organizar reportes por tarea
    const reportesPorTarea = {};
    const proyectos = {};
    
    for (const reporte of reportes) {
      if (!reportesPorTarea[reporte.tarea_id]) {
        reportesPorTarea[reporte.tarea_id] = {
          tarea_id: reporte.tarea_id,
          tarea_titulo: reporte.tarea_titulo,
          tarea_estado: reporte.tarea_estado,
          proyecto_id: reporte.proyecto_id,
          proyecto_nombre: reporte.proyecto_nombre,
          reportes: [],
          ultimo_progreso: 0,
          total_reportes: 0
        };
      }
      
      reportesPorTarea[reporte.tarea_id].reportes.push(reporte);
      reportesPorTarea[reporte.tarea_id].total_reportes++;
      
      // Actualizar último progreso (asumiendo que los reportes están ordenados por fecha DESC)
      if (reportesPorTarea[reporte.tarea_id].reportes.length === 1) {
        reportesPorTarea[reporte.tarea_id].ultimo_progreso = reporte.progreso_porcentaje;
      }
      
      // Registrar proyectos
      if (!proyectos[reporte.proyecto_id]) {
        proyectos[reporte.proyecto_id] = {
          id: reporte.proyecto_id,
          nombre: reporte.proyecto_nombre,
          total_tareas: 0,
          tareas_completadas: 0,
          promedio_progreso: 0,
          total_reportes: 0
        };
      }
    }
    
    // Calcular estadísticas por proyecto
    for (const tareaId in reportesPorTarea) {
      const tarea = reportesPorTarea[tareaId];
      const proyecto = proyectos[tarea.proyecto_id];
      
      proyecto.total_tareas++;
      proyecto.total_reportes += tarea.total_reportes;
      
      if (tarea.tarea_estado === 'completada' || tarea.ultimo_progreso === 100) {
        proyecto.tareas_completadas++;
      }
    }
    
    // Calcular promedios de progreso por proyecto
    for (const proyectoId in proyectos) {
      const proyecto = proyectos[proyectoId];
      
      if (proyecto.total_tareas > 0) {
        proyecto.promedio_progreso = Math.round((proyecto.tareas_completadas / proyecto.total_tareas) * 100);
      }
    }
    
    // Calcular estadísticas generales
    const totalTareas = Object.keys(reportesPorTarea).length;
    const totalReportes = reportes.length;
    let tareasCompletadas = 0;
    let promedioProgresoGeneral = 0;
    
    for (const tareaId in reportesPorTarea) {
      const tarea = reportesPorTarea[tareaId];
      
      if (tarea.tarea_estado === 'completada' || tarea.ultimo_progreso === 100) {
        tareasCompletadas++;
      }
      
      promedioProgresoGeneral += tarea.ultimo_progreso;
    }
    
    if (totalTareas > 0) {
      promedioProgresoGeneral = Math.round(promedioProgresoGeneral / totalTareas);
    }
    
    // Organizar datos para el informe
    const resultado = {
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin,
        descripcion: filtros.periodo || 'personalizado'
      },
      resumen: {
        total_tareas: totalTareas,
        tareas_completadas: tareasCompletadas,
        tasa_completado: totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0,
        promedio_progreso: promedioProgresoGeneral,
        total_reportes: totalReportes,
        total_proyectos: Object.keys(proyectos).length
      },
      por_proyecto: Object.values(proyectos),
      tareas: Object.values(reportesPorTarea),
      generado_en: new Date()
    };
    
    logger.info(`Informe de progreso de tareas generado exitosamente para ${totalTareas} tareas`);
    
    return resultado;
  } catch (error) {
    logger.error(`Error al generar informe de progreso de tareas: ${error.message}`);
    throw error;
  }
}

module.exports = { execute }; 