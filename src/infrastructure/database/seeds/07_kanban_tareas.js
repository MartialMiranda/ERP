/**
 * Seed: Kanban Tareas
 * Asigna tareas a las columnas kanban
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  try {
    // Cargar datos de seeds anteriores para garantizar coherencia
    const proyectosData = await knex('proyectos')
      .select('id')
      .orderBy('creado_en');
    
    const proyectoIds = proyectosData.map(p => p.id);
    
    // Deletes ALL existing entries
    await knex('kanban_tareas').delete();
    
    // Diagnóstico: Verificar que existen tareas
    const totalTareas = await knex('tareas').count('id as count').first();

    // Diagnóstico: Verificar que existen columnas kanban
    const totalColumnas = await knex('kanban_columnas').count('id as count').first();
    
    // Si no hay columnas, ejecutar el seed de columnas kanban
    if (!totalColumnas || totalColumnas.count == 0) {
      
      // Ejecutamos el seed de kanban_columnas directamente pasando los proyectoIds
      await knex('kanban_columnas').delete();
      
      // Columnas estándar para Kanban
      const columnasEstandar = [
        { nombre: 'Por hacer', posicion: 1 },
        { nombre: 'En progreso', posicion: 2 },
        { nombre: 'Revisión', posicion: 3 },
        { nombre: 'Completado', posicion: 4 }
      ];
      
      const columnasData = [];
      
      // Crear columnas estándar para cada proyecto
      for (const proyectoId of proyectoIds) {
        // Añadir columnas estándar
        for (const columna of columnasEstandar) {
          columnasData.push({
            id: uuidv4(),
            nombre: columna.nombre,
            posicion: columna.posicion,
            proyecto_id: proyectoId
          });
        }
        
        // Añadir alguna columna personalizada al 50% de los proyectos
        if (Math.random() > 0.5) {
          columnasData.push({
            id: uuidv4(),
            nombre: faker.helpers.arrayElement(['Bloqueado', 'En espera', 'Validación cliente', 'Despliegue']),
            posicion: 5,
            proyecto_id: proyectoId
          });
        }
      }
      
      await knex('kanban_columnas').insert(columnasData);
    }
    
    // Obtener todas las tareas existentes
    const tareas = await knex('tareas').select('id', 'estado', 'proyecto_id');
    
    if (tareas.length === 0) {
      return;
    }
    
    // Obtener todas las columnas kanban
    const todasLasColumnas = await knex('kanban_columnas').select('id', 'nombre', 'proyecto_id');
    
    
    if (todasLasColumnas.length === 0) {
      return;
    }
    
    // Crear un diccionario de columnas por proyecto para acceso rápido
    const columnasPorProyecto = {};
    todasLasColumnas.forEach(columna => {
      if (!columnasPorProyecto[columna.proyecto_id]) {
        columnasPorProyecto[columna.proyecto_id] = [];
      }
      columnasPorProyecto[columna.proyecto_id].push(columna);
    });
    
    // Verificar qué proyectos tienen columnas
    for (const proyectoId of proyectoIds) {
    }
    
    const kanbanTareasData = [];
    const posicionesPorColumna = {};
    
    // Para cada tarea, asignarla a una columna Kanban según su estado
    for (const tarea of tareas) {
      let columnasProyecto = columnasPorProyecto[tarea.proyecto_id] || [];
      
      // Si no hay columnas para este proyecto, buscar en todos los proyectos
      if (columnasProyecto.length === 0) {
        
        // Usar el primer proyecto que tenga columnas
        for (const proyId in columnasPorProyecto) {
          if (columnasPorProyecto[proyId] && columnasPorProyecto[proyId].length > 0) {
            columnasProyecto = columnasPorProyecto[proyId];
            break;
          }
        }
      }
      
      if (columnasProyecto.length === 0) {
        continue;
      }
      
      // Determinar a qué columna va esta tarea según su estado
      let columnaDestino = null;
      
      // Mapear estado de tarea a nombre de columna (con variaciones posibles)
      const estadoAColumna = {
        'pendiente': ['Por hacer', 'Pendiente', 'Backlog', 'To Do'],
        'en progreso': ['En progreso', 'En Progreso', 'In Progress', 'Doing'],
        'completada': ['Completado', 'Completada', 'Done', 'Terminado'],
        'bloqueada': ['Bloqueado', 'Bloqueada', 'Blocked']
      };
      
      // Buscar columna adecuada, considerando variaciones de nombres
      const nombresPosibles = estadoAColumna[tarea.estado] || ['Por hacer'];
      
      for (const nombre of nombresPosibles) {
        columnaDestino = columnasProyecto.find(c => 
          c.nombre.toLowerCase() === nombre.toLowerCase());
        if (columnaDestino) break;
      }
      
      // Si no se encontró una columna adecuada, usar la primera
      if (!columnaDestino && columnasProyecto.length > 0) {
        columnaDestino = columnasProyecto[0];
      }
      
      // Inicializar contador de posición si no existe
      if (!posicionesPorColumna[columnaDestino.id]) {
        posicionesPorColumna[columnaDestino.id] = 1;
      }
      
      kanbanTareasData.push({
        id: uuidv4(),
        tarea_id: tarea.id,
        columna_id: columnaDestino.id,
        posicion: posicionesPorColumna[columnaDestino.id]++
      });
    }
    
    // Solo insertar si hay datos
    if (kanbanTareasData.length > 0) {
      // Insertar en lotes para evitar problemas con grandes cantidades de datos
      const chunkSize = 100;
      for (let i = 0; i < kanbanTareasData.length; i += chunkSize) {
        const chunk = kanbanTareasData.slice(i, i + chunkSize);
        await knex('kanban_tareas').insert(chunk);
      }
    } else {
      console.log('No se pudieron crear asignaciones de tareas a columnas Kanban');
    }
  } catch (error) {
    console.error('Error al crear asignaciones de tareas a columnas Kanban:', error.message);
    console.error(error.stack);
  }
};
