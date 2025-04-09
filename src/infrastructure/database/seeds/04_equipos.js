/**
 * Seed: Equipos
 * Crea equipos y asigna usuarios a los equipos
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Cargar datos de seeds anteriores
  const { adminId, userIds, proyectoIds } = await knex('proyectos')
    .first()
    .then(() => require('./02_proyectos').seed(knex));
  
  // Deletes ALL existing entries
  await knex('equipos').delete();
  
  // Array para almacenar los IDs de los equipos
  const equipoIds = [];
  
  // Crear 10 equipos
  const equiposData = [];
  
  for (let i = 0; i < 10; i++) {
    const equipoId = uuidv4();
    equipoIds.push(equipoId);
    
    equiposData.push({
      id: equipoId,
      nombre: faker.company.name() + ' Team',
      descripcion: faker.lorem.sentence(),
      creado_en: faker.date.past(),
      actualizado_en: new Date()
    });
  }
  
  await knex('equipos').insert(equiposData);
  
  console.log(`Creados ${equiposData.length} equipos`);
  
  // Ahora vamos a crear las relaciones entre equipos y usuarios (equipo_usuarios)
  await knex('equipo_usuarios').delete();
  
  const equipoUsuariosData = [];
  
  // Para cada equipo, añadir entre 2 y 5 miembros
  for (const equipoId of equipoIds) {
    // Seleccionar un líder aleatorio (preferiblemente un gestor)
    const gestores = await knex('usuarios').where('rol', 'gestor').select('id');
    const lideresDisponibles = gestores.length > 0 
      ? gestores.map(u => u.id) 
      : userIds.slice(0, 4); // Si no hay gestores, usar los primeros usuarios
    
    const liderId = lideresDisponibles[Math.floor(Math.random() * lideresDisponibles.length)];
    
    // Primero añadir al líder del equipo
    equipoUsuariosData.push({
      id: uuidv4(),
      equipo_id: equipoId,
      usuario_id: liderId,
      rol: 'lider',
      asignado_en: faker.date.past()
    });
    
    // Luego añadir otros miembros al equipo
    const numMiembros = faker.number.int({ min: 2, max: 5 });
    const miembrosDisponibles = userIds.filter(id => id !== liderId);
    
    for (let i = 0; i < numMiembros; i++) {
      if (i < miembrosDisponibles.length) {
        const usuarioId = miembrosDisponibles[i];
        
        equipoUsuariosData.push({
          id: uuidv4(),
          equipo_id: equipoId,
          usuario_id: usuarioId,
          rol: 'miembro', // Todos son miembros salvo el líder
          asignado_en: faker.date.past()
        });
      }
    }
  }
  
  await knex('equipo_usuarios').insert(equipoUsuariosData);
  
  console.log(`Creadas ${equipoUsuariosData.length} relaciones equipo-usuario`);
  
  // Crear relaciones entre proyectos y equipos
  const proyectoEquiposData = [];
  
  // Asignar cada equipo a un proyecto aleatorio
  for (const equipoId of equipoIds) {
    const proyectoId = faker.helpers.arrayElement(proyectoIds);
    proyectoEquiposData.push({
      id: uuidv4(),
      proyecto_id: proyectoId,
      equipo_id: equipoId,
      creado_en: new Date()
    });
  }
  
  await knex('proyecto_equipos').delete();
  await knex('proyecto_equipos').insert(proyectoEquiposData);
  
  console.log(`Creadas ${proyectoEquiposData.length} relaciones proyecto-equipo`);

  // Return data for reference in other seeds
  return { adminId, userIds, proyectoIds, equipoIds };
};
