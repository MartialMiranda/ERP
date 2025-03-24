/**
 * Seed: Kanban Tareas
 * Asigna tareas a las columnas kanban
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('kanban_tareas').delete();
  
  // Obtener todas las tareas existentes
  const tareas = await knex('tareas').select('id', 'estado', 'proyecto_id');
  
  if (tareas.length === 0) {
    console.log('No hay tareas para asignar a las columnas kanban');
    return;
  }
  
  const kanbanTareasData = [];
  
  // Para cada tarea, asignarla a una columna Kanban según su estado
  for (const tarea of tareas) {
    // Obtener columnas del proyecto de esta tarea
    const columnasProyecto = await knex('kanban_columnas')
      .where('proyecto_id', tarea.proyecto_id)
      .select('id', 'nombre');
    
    if (columnasProyecto.length === 0) {
      continue; // Si no hay columnas para este proyecto, saltamos esta tarea
    }
    
    // Determinar a qué columna va esta tarea según su estado
    let columnaDestino;
    
    switch (tarea.estado) {
      case 'pendiente':
        columnaDestino = columnasProyecto.find(c => c.nombre === 'Por hacer');
        break;
      case 'en progreso':
        columnaDestino = columnasProyecto.find(c => c.nombre === 'En progreso');
        break;
      case 'completada':
        columnaDestino = columnasProyecto.find(c => c.nombre === 'Completado');
        break;
      case 'bloqueada':
        // Intentar encontrar una columna "Bloqueado", si no existe usar "Por hacer"
        columnaDestino = columnasProyecto.find(c => c.nombre === 'Bloqueado') || 
                        columnasProyecto.find(c => c.nombre === 'Por hacer');
        break;
      default:
        columnaDestino = columnasProyecto.find(c => c.nombre === 'Por hacer');
    }
    
    // Si no se encontró una columna adecuada, usar la primera
    if (!columnaDestino) {
      columnaDestino = columnasProyecto[0];
    }
    
    // Contar cuántas tareas ya hay en esta columna para determinar la posición
    const tareasEnColumna = await knex('kanban_tareas')
      .where('columna_id', columnaDestino.id)
      .count('id as count')
      .first();
    
    const posicion = tareasEnColumna && tareasEnColumna.count ? parseInt(tareasEnColumna.count) + 1 : 1;
    
    kanbanTareasData.push({
      id: uuidv4(),
      tarea_id: tarea.id,
      columna_id: columnaDestino.id,
      posicion: posicion
    });
  }
  
  // Solo insertar si hay datos
  if (kanbanTareasData.length > 0) {
    await knex('kanban_tareas').insert(kanbanTareasData);
    console.log(`Creadas ${kanbanTareasData.length} asignaciones de tareas a columnas Kanban`);
  } else {
    console.log('No se pudieron crear asignaciones de tareas a columnas Kanban');
  }
};
