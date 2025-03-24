/**
 * Seed: Reportes de Progreso
 * Crea reportes de progreso para las tareas
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('reportes_progreso').delete();
  
  // Obtener datos directamente de la base de datos
  const usuarios = await knex('usuarios').select('id');
  const tareas = await knex('tareas').select('id', 'estado', 'asignado_a');
  
  if (tareas.length === 0) {
    console.log('No hay tareas para crear reportes de progreso');
    return;
  }
  
  if (usuarios.length === 0) {
    console.log('No hay usuarios para asignar a los reportes de progreso');
    return;
  }
  
  const userIds = usuarios.map(u => u.id);
  const reportesData = [];
  
  // Para cada tarea, crear entre 1-3 reportes de progreso
  for (const tarea of tareas) {
    const numReportes = faker.number.int({ min: 1, max: 3 });
    
    // Si la tarea está completada, asegurar que el último reporte sea del 100%
    const estaCompletada = tarea.estado === 'completada';
    
    for (let i = 0; i < numReportes; i++) {
      const esUltimoReporte = i === numReportes - 1;
      let progresoPorcentaje;
      
      if (estaCompletada && esUltimoReporte) {
        progresoPorcentaje = 100;
      } else if (estaCompletada) {
        // Para tareas completadas, reportes intermedios tienen progreso alto
        progresoPorcentaje = faker.number.int({ min: 50, max: 90 });
      } else if (tarea.estado === 'bloqueada') {
        // Para tareas bloqueadas, progreso estancado
        progresoPorcentaje = faker.number.int({ min: 10, max: 70 });
      } else if (tarea.estado === 'en progreso') {
        // Para tareas en progreso, progreso medio
        progresoPorcentaje = faker.number.int({ min: 20, max: 80 });
      } else {
        // Para tareas pendientes, progreso bajo
        progresoPorcentaje = faker.number.int({ min: 0, max: 30 });
      }
      
      // Determinar quién crea el reporte (generalmente el asignado a la tarea)
      const usuarioId = tarea.asignado_a || userIds[Math.floor(Math.random() * userIds.length)];
      
      // Generar comentario basado en el progreso
      let comentario;
      
      if (progresoPorcentaje === 0) {
        comentario = 'Aún no se ha iniciado la tarea.';
      } else if (progresoPorcentaje === 100) {
        comentario = 'Tarea completada satisfactoriamente.';
      } else if (progresoPorcentaje < 30) {
        comentario = `Iniciando la tarea. ${faker.lorem.sentence()}`;
      } else if (progresoPorcentaje < 70) {
        comentario = `Avanzando en el desarrollo. ${faker.lorem.sentence()}`;
      } else {
        comentario = `Finalizando la tarea. ${faker.lorem.sentence()}`;
      }
      
      reportesData.push({
        id: uuidv4(),
        tarea_id: tarea.id,
        usuario_id: usuarioId,
        comentario: comentario,
        progreso_porcentaje: progresoPorcentaje,
        creado_en: faker.date.past()
      });
    }
  }
  
  // Solo insertar si hay datos
  if (reportesData.length > 0) {
    await knex('reportes_progreso').insert(reportesData);
    console.log(`Creados ${reportesData.length} reportes de progreso`);
  } else {
    console.log('No se pudieron crear reportes de progreso');
  }
};
