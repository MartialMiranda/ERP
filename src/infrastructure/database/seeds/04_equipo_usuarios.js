/**
 * Seed: Equipo Usuarios
 * Asigna usuarios a equipos
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('equipo_usuarios').delete();

  // Obtener todos los usuarios existentes en la base de datos
  const usuarios = await knex('usuarios').select('id');
  const userIds = usuarios.map(user => user.id);

  if (userIds.length === 0) {
    console.log('No hay usuarios para asignar a equipos');
    return { userIds: [] };
  }

  // Obtener todos los equipos existentes en la base de datos
  const equipos = await knex('equipos').select('id');
  const equipoIds = equipos.map(equipo => equipo.id);

  if (equipoIds.length === 0) {
    console.log('No hay equipos para asignar usuarios');
    return { equipoIds: [] };
  }
  
  const equipoUsuariosData = [];
  
  // Asegurarse de que cada equipo tenga al menos un líder y algunos miembros
  for (const equipoId of equipoIds) {
    // Seleccionar un líder al azar
    const liderUsuarioId = faker.helpers.arrayElement(userIds);
    
    equipoUsuariosData.push({
      id: uuidv4(),
      equipo_id: equipoId,
      usuario_id: liderUsuarioId,
      rol: 'lider',
      asignado_en: faker.date.past()
    });
    
    // Añadir entre 2-5 miembros al equipo
    const numMiembros = faker.number.int({ min: 2, max: 5 });
    const miembrosDisponibles = userIds.filter(id => id !== liderUsuarioId);
    const miembrosSeleccionados = faker.helpers.arrayElements(miembrosDisponibles, Math.min(numMiembros, miembrosDisponibles.length));
    
    for (const miembroId of miembrosSeleccionados) {
      equipoUsuariosData.push({
        id: uuidv4(),
        equipo_id: equipoId,
        usuario_id: miembroId,
        rol: 'miembro',
        asignado_en: faker.date.past()
      });
    }
  }
  
  await knex('equipo_usuarios').insert(equipoUsuariosData);
  
  console.log(`Creadas ${equipoUsuariosData.length} relaciones equipo-usuario`);
  
  // Return data for reference in other seeds
  return { userIds, equipoIds };
};
