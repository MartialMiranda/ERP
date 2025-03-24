/**
 * Seed: Proyectos
 * Crea proyectos iniciales y los relaciona con el usuario administrador
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Obtener el adminId del seed anterior
  const { adminId, userIds } = await knex('usuarios')
    .first()
    .then(() => require('./01_usuarios').seed(knex));
  
  // Deletes ALL existing entries
  await knex('proyectos').delete();
  
  // Array para almacenar los IDs de los proyectos
  const proyectoIds = [];
  
  // Crear 10 proyectos
  const proyectosData = [];
  const estadosProyecto = ['planificado', 'en progreso', 'completado', 'cancelado'];
  const fechaInicio = new Date();
  
  for (let i = 0; i < 10; i++) {
    const proyectoId = uuidv4();
    proyectoIds.push(proyectoId);
    
    // Calcular fecha de inicio (entre 1 y 6 meses en el pasado)
    const fechaInicioProyecto = new Date(fechaInicio);
    fechaInicioProyecto.setMonth(fechaInicioProyecto.getMonth() - faker.number.int({ min: 1, max: 6 }));
    
    // Calcular fecha fin (entre 3 y 12 meses desde la fecha de inicio)
    const fechaFin = new Date(fechaInicioProyecto);
    fechaFin.setMonth(fechaFin.getMonth() + faker.number.int({ min: 3, max: 12 }));
    
    // Para proyectos completados, la fecha de fin debe ser anterior a la actual
    const estado = estadosProyecto[i % 4];
    const fechaFinAjustada = estado === 'completado' ? 
      faker.date.between({ from: fechaInicioProyecto, to: new Date() }) : 
      estado === 'cancelado' ? 
        faker.date.between({ from: fechaInicioProyecto, to: new Date() }) : 
        fechaFin;
    
    proyectosData.push({
      id: proyectoId,
      nombre: faker.company.catchPhrase(),
      descripcion: faker.lorem.paragraph(),
      fecha_inicio: fechaInicioProyecto,
      fecha_fin: estado === 'planificado' || estado === 'en progreso' ? null : fechaFinAjustada,
      estado: estado,
      creado_por: userIds[Math.floor(Math.random() * userIds.length)],
      creado_en: fechaInicioProyecto,
      actualizado_en: new Date()
    });
  }
  
  await knex('proyectos').insert(proyectosData);
  
  console.log(`Creados ${proyectosData.length} proyectos`);
  
  // Return the proyectoIds for reference in other seeds
  return { adminId, userIds, proyectoIds };
};
