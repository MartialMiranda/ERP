/**
 * Seed: Tareas
 * Crea tareas para los proyectos y las asigna a usuarios
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Cargar datos de seeds anteriores
  const { adminId, userIds, proyectoIds, equipoIds } = await knex('equipo_usuarios')
    .first()
    .then(() => require('./04_equipos').seed(knex));
  
  // Deletes ALL existing entries
  await knex('tareas').delete();
  
  // Array para almacenar los IDs de las tareas
  const tareaIds = [];
  
  // Crear 10 tareas para cada proyecto (100 tareas en total)
  const tareasData = [];
  const prioridades = ['baja', 'media', 'alta'];
  const estados = ['pendiente', 'en progreso', 'completada', 'bloqueada'];
  
  for (const proyectoId of proyectoIds) {
    // Obtener usuarios asignados a equipos asociados al proyecto
    const equipoUsuarios = await knex('equipo_usuarios')
      .select('usuario_id')
      .distinct();
    
    const usuariosDisponibles = equipoUsuarios.length > 0 
      ? equipoUsuarios.map(eu => eu.usuario_id) 
      : userIds;
    
    // Crear 10 tareas por proyecto
    for (let i = 0; i < 10; i++) {
      const tareaId = uuidv4();
      tareaIds.push(tareaId);
      
      // Asignar la tarea a un usuario aleatorio
      const usuarioAsignado = usuariosDisponibles[Math.floor(Math.random() * usuariosDisponibles.length)];
      
      // Definir fecha de vencimiento (entre hoy y 3 meses en el futuro)
      const fechaActual = new Date();
      const fechaVencimiento = faker.date.between({ 
        from: fechaActual, 
        to: new Date(fechaActual.getFullYear(), fechaActual.getMonth() + 3, fechaActual.getDate()) 
      });
      
      // Para tareas completadas, la fecha de vencimiento es pasada
      const estado = estados[Math.floor(Math.random() * estados.length)];
      const ajustarFechaVencimiento = estado === 'completada' 
        ? faker.date.past() 
        : fechaVencimiento;
      
      tareasData.push({
        id: tareaId,
        titulo: faker.lorem.sentence(4),
        descripcion: faker.lorem.paragraph(),
        prioridad: prioridades[Math.floor(Math.random() * prioridades.length)],
        estado: estado,
        fecha_vencimiento: ajustarFechaVencimiento,
        proyecto_id: proyectoId,
        asignado_a: usuarioAsignado,
        creado_en: faker.date.past(),
        actualizado_en: new Date()
      });
    }
  }
  
  await knex('tareas').insert(tareasData);
  
  console.log(`Creadas ${tareasData.length} tareas`);
  
  // Return data for reference in other seeds
  return { adminId, userIds, proyectoIds, equipoIds, tareaIds };
};
