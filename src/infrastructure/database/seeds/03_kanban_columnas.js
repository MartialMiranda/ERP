/**
 * Seed: Kanban Columnas
 * Crea columnas Kanban para los proyectos
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Cargar datos de seeds anteriores
  const { adminId, userIds, proyectoIds } = await knex('proyectos')
    .first()
    .then(() => require('./02_proyectos').seed(knex));
  
  // Deletes ALL existing entries
  await knex('kanban_columnas').delete();
  
  // Array para almacenar los IDs de las columnas
  const columnasIds = [];
  
  // Para cada proyecto, crear columnas estándar
  const columnasData = [];
  
  // Columnas estándar para Kanban
  const columnasEstandar = [
    { nombre: 'Por hacer', posicion: 1 },
    { nombre: 'En progreso', posicion: 2 },
    { nombre: 'Revisión', posicion: 3 },
    { nombre: 'Completado', posicion: 4 }
  ];
  
  // Crear columnas estándar para cada proyecto
  for (const proyectoId of proyectoIds) {
    // Añadir columnas estándar
    for (const columna of columnasEstandar) {
      const columnaId = uuidv4();
      columnasIds.push(columnaId);
      
      columnasData.push({
        id: columnaId,
        nombre: columna.nombre,
        posicion: columna.posicion,
        proyecto_id: proyectoId
      });
    }
    
    // Añadir alguna columna personalizada al 50% de los proyectos
    if (Math.random() > 0.5) {
      const columnaId = uuidv4();
      columnasIds.push(columnaId);
      
      columnasData.push({
        id: columnaId,
        nombre: faker.helpers.arrayElement(['Bloqueado', 'En espera', 'Validación cliente', 'Despliegue']),
        posicion: 5,
        proyecto_id: proyectoId
      });
    }
  }
  
  await knex('kanban_columnas').insert(columnasData);
  
  console.log(`Creadas ${columnasData.length} columnas Kanban`);
  
  // Return data for reference in other seeds
  return { adminId, userIds, proyectoIds, columnasIds };
};
