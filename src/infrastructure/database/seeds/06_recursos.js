/**
 * Seed: Recursos
 * Crea recursos para los proyectos
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('recursos').delete();
  
  // Obtener proyectos existentes
  const proyectos = await knex('proyectos').select('id');
  
  if (proyectos.length === 0) {
    console.log('No hay proyectos para asignar recursos');
    return;
  }
  
  const proyectoIds = proyectos.map(p => p.id);
  
  // Tipos de recursos comunes en proyectos
  const tiposRecursos = [
    'Ordenador portátil',
    'Monitor',
    'Licencia de software',
    'Servidor',
    'Móvil corporativo',
    'Sala de reuniones',
    'Proyector',
    'Impresora',
    'Tableta gráfica',
    'Espacio de coworking'
  ];
  
  const recursosData = [];
  
  // Para cada proyecto, crear entre 1-5 recursos
  for (const proyectoId of proyectoIds) {
    const numRecursos = faker.number.int({ min: 1, max: 5 });
    
    for (let i = 0; i < numRecursos; i++) {
      const tipoRecurso = faker.helpers.arrayElement(tiposRecursos);
      
      // Generar una descripción basada en el tipo de recurso
      let descripcion;
      let cantidad = 1;
      
      switch (tipoRecurso) {
        case 'Ordenador portátil':
          descripcion = `${faker.company.name()} ${faker.string.alpha({ length: 2, casing: 'upper' })}${faker.number.int({ min: 1000, max: 9999 })} - RAM: ${faker.number.int({ min: 8, max: 32 })}GB`;
          break;
        case 'Licencia de software':
          descripcion = `${faker.company.name()} Suite - ${faker.helpers.arrayElement(['Anual', 'Perpetua', 'Por usuario'])}`;
          cantidad = faker.number.int({ min: 1, max: 20 });
          break;
        case 'Servidor':
          descripcion = `Servidor ${faker.helpers.arrayElement(['Cloud', 'On-premise', 'Híbrido'])} - Capacidad: ${faker.number.int({ min: 1, max: 16 })}TB`;
          break;
        default:
          descripcion = faker.lorem.sentence();
      }
      
      recursosData.push({
        id: uuidv4(),
        nombre: `${tipoRecurso} ${faker.string.alpha({ length: 3, casing: 'upper' })}`,
        descripcion: descripcion,
        cantidad: cantidad,
        proyecto_id: proyectoId,
        creado_en: faker.date.past(),
        actualizado_en: faker.date.recent()
      });
    }
  }
  
  // Solo insertar si hay datos
  if (recursosData.length > 0) {
    await knex('recursos').insert(recursosData);
    console.log(`Creados ${recursosData.length} recursos`);
  } else {
    console.log('No se pudieron crear recursos');
  }
};
