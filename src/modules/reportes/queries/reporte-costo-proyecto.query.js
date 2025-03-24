/**
 * Query: Reporte de Costo de Proyecto
 * Siguiendo el patrón CQRS - Esta consulta proporciona datos sobre los costos asociados a un proyecto
 */
const { db } = require('../../../config/database');
const { NotFoundError } = require('../../../utils/errors');

/**
 * Ejecuta la consulta para obtener el reporte de costo de un proyecto específico
 * 
 * @param {Object} params - Parámetros de la consulta
 * @param {string} params.proyectoId - ID del proyecto a analizar
 * @param {string} params.incluirRecursos - Si se deben incluir los costos de recursos (true/false)
 * @param {string} params.incluirPersonal - Si se deben incluir los costos de personal (true/false)
 * @returns {Promise<Object>} Reporte de costo del proyecto
 */
async function execute(params) {
  const { proyectoId, incluirRecursos = true, incluirPersonal = true } = params;
  
  // Verificar que el proyecto existe
  const proyecto = await db.oneOrNone(
    'SELECT id, nombre, fecha_inicio, fecha_fin FROM proyectos WHERE id = $1',
    [proyectoId]
  );
  
  if (!proyecto) {
    throw new NotFoundError(`Proyecto con ID ${proyectoId} no encontrado`);
  }
  
  // Datos base del reporte
  const reporte = {
    proyecto: proyecto,
    fecha_generacion: new Date(),
    costo_total: 0,
    desglose: {
      recursos: [],
      personal: []
    },
    resumen: {
      costo_recursos: 0,
      costo_personal: 0,
      costo_total: 0
    }
  };
  
  // Calcular costos de recursos si se solicita
  if (incluirRecursos === true || incluirRecursos === 'true') {
    // Obtener recursos del proyecto y sus costos asociados
    const recursos = await db.manyOrNone(`
      SELECT r.id, r.nombre, r.descripcion, r.cantidad
      FROM recursos r
      WHERE r.proyecto_id = $1
    `, [proyectoId]);
    
    // Para cada recurso, asignar un costo simulado (en una base de datos real, esto vendría de una tabla de costos)
    for (const recurso of recursos) {
      // Simulación de costo basada en el nombre del recurso
      let costoUnitario = 0;
      
      if (recurso.nombre.includes('Ordenador') || recurso.nombre.includes('Portátil')) {
        costoUnitario = 1200;
      } else if (recurso.nombre.includes('Servidor')) {
        costoUnitario = 5000;
      } else if (recurso.nombre.includes('Licencia')) {
        costoUnitario = 300;
      } else if (recurso.nombre.includes('Monitor')) {
        costoUnitario = 350;
      } else {
        // Costo por defecto para otros recursos
        costoUnitario = 100;
      }
      
      const costoTotal = costoUnitario * recurso.cantidad;
      
      reporte.desglose.recursos.push({
        id: recurso.id,
        nombre: recurso.nombre,
        descripcion: recurso.descripcion,
        cantidad: recurso.cantidad,
        costo_unitario: costoUnitario,
        costo_total: costoTotal
      });
      
      reporte.resumen.costo_recursos += costoTotal;
    }
  }
  
  // Calcular costos de personal si se solicita
  if (incluirPersonal === true || incluirPersonal === 'true') {
    // Obtener miembros del equipo asignados a las tareas del proyecto
    const miembrosEquipo = await db.manyOrNone(`
      SELECT DISTINCT u.id, u.nombre, u.rol, eu.rol as rol_equipo
      FROM usuarios u
      JOIN tareas t ON t.asignado_a = u.id
      LEFT JOIN equipo_usuarios eu ON eu.usuario_id = u.id
      WHERE t.proyecto_id = $1
    `, [proyectoId]);
    
    // Para cada miembro, calcular su costo basado en rol, horas trabajadas, etc.
    for (const miembro of miembrosEquipo) {
      // Obtener horas trabajadas en el proyecto (simulado)
      const horasTrabajadas = await db.oneOrNone(`
        SELECT COUNT(*) as num_tareas,
               SUM(CASE WHEN estado = 'completada' THEN 1 ELSE 0 END) as tareas_completadas
        FROM tareas
        WHERE proyecto_id = $1 AND asignado_a = $2
      `, [proyectoId, miembro.id]);
      
      // Calcular tarifa por hora según el rol (simulado)
      let tarifaHora;
      
      switch (miembro.rol) {
        case 'admin':
          tarifaHora = 75;
          break;
        case 'gestor':
          tarifaHora = 60;
          break;
        case 'usuario':
          if (miembro.rol_equipo === 'lider') {
            tarifaHora = 50;
          } else {
            tarifaHora = 40;
          }
          break;
        default:
          tarifaHora = 35;
      }
      
      // Calcular horas simuladas basadas en número de tareas
      const numTareas = parseInt(horasTrabajadas.num_tareas) || 0;
      const tareasCompletadas = parseInt(horasTrabajadas.tareas_completadas) || 0;
      const horasEstimadas = numTareas * 8; // Asumimos 8 horas por tarea
      
      const costoTotal = horasEstimadas * tarifaHora;
      
      reporte.desglose.personal.push({
        id: miembro.id,
        nombre: miembro.nombre,
        rol: miembro.rol,
        rol_equipo: miembro.rol_equipo,
        tarifa_hora: tarifaHora,
        horas_estimadas: horasEstimadas,
        tareas_asignadas: numTareas,
        tareas_completadas: tareasCompletadas,
        costo_total: costoTotal
      });
      
      reporte.resumen.costo_personal += costoTotal;
    }
  }
  
  // Calcular costo total
  reporte.resumen.costo_total = reporte.resumen.costo_recursos + reporte.resumen.costo_personal;
  reporte.costo_total = reporte.resumen.costo_total;
  
  return reporte;
}

module.exports = { execute };
