/**
 * Seed: Logros
 * Crea logros que los usuarios pueden desbloquear
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('logros').delete();
  
  // Array para almacenar los IDs de los logros
  const logroIds = [];
  
  // Definir logros disponibles
  const logrosData = [
    {
      id: uuidv4(),
      nombre: 'Primer día',
      descripcion: 'Completó su primer día en la plataforma.',
      criterio: 'El usuario debe iniciar sesión al menos una vez.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Empleado del mes',
      descripcion: 'Reconocido como el empleado con mejor desempeño del mes.',
      criterio: 'El usuario debe completar al menos 10 tareas en un mes.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Organizador maestro',
      descripcion: 'Demostró excelencia en la organización de tareas y proyectos.',
      criterio: 'El usuario debe crear y completar al menos 5 proyectos.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Solucionador de problemas',
      descripcion: 'Resolvió efectivamente problemas complejos.',
      criterio: 'El usuario debe resolver al menos 3 tareas bloqueadas.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Espíritu de equipo',
      descripcion: 'Demostró excelente colaboración y apoyo al equipo.',
      criterio: 'El usuario debe ser miembro de al menos 3 equipos diferentes.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Innovador',
      descripcion: 'Propuso soluciones innovadoras a problemas existentes.',
      criterio: 'El usuario debe proponer al menos 2 mejoras que sean implementadas.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Cumplidor de plazos',
      descripcion: 'Siempre entrega sus tareas dentro del plazo establecido.',
      criterio: 'El usuario debe completar 10 tareas antes de su fecha de vencimiento.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Líder emergente',
      descripcion: 'Demostró capacidades de liderazgo y gestión de equipos.',
      criterio: 'El usuario debe liderar al menos 2 equipos exitosamente.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Aprendiz continuo',
      descripcion: 'Siempre busca aprender y mejorar sus habilidades.',
      criterio: 'El usuario debe completar 5 cursos de formación internos.',
      creado_en: new Date()
    },
    {
      id: uuidv4(),
      nombre: 'Estrella ascendente',
      descripcion: 'Identificado como talento de alto potencial en la organización.',
      criterio: 'El usuario debe cumplir criterios excepcionales de rendimiento durante 3 meses.',
      creado_en: new Date()
    }
  ];
  
  // Guardar IDs para uso posterior
  logrosData.forEach(logro => logroIds.push(logro.id));
  
  await knex('logros').insert(logrosData);
  
  console.log(`Creados ${logrosData.length} logros`);
  
  // Return data for reference in other seeds
  return { logroIds };
};
