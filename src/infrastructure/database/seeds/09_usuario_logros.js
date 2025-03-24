/**
 * Seed: Usuario Logros
 * Asigna logros a los usuarios
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');
const crypto = require('crypto');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('usuario_logros').delete();
  
  // Obtener datos directamente de la base de datos
  const usuarios = await knex('usuarios').select('id');
  const logros = await knex('logros').select('id');
  
  if (usuarios.length === 0) {
    console.log('No hay usuarios para asignar logros');
    return;
  }
  
  if (logros.length === 0) {
    console.log('No hay logros para asignar a usuarios');
    return;
  }
  
  const userIds = usuarios.map(u => u.id);
  const logroIds = logros.map(l => l.id);
  
  const usuarioLogrosData = [];
  
  // Para cada usuario, asignar entre 0-3 logros aleatorios
  for (const usuarioId of userIds) {
    // Algunos usuarios no tendrán logros (30% de probabilidad)
    if (Math.random() < 0.3) continue;
    
    // Seleccionar entre 1-3 logros aleatorios para este usuario
    const numLogros = faker.number.int({ min: 1, max: 3 });
    const logrosAsignados = faker.helpers.arrayElements(logroIds, numLogros);
    
    // Asignar cada logro seleccionado al usuario
    for (const logroId of logrosAsignados) {
      // Generar un token hash único simulando un NFT interno
      const tokenHash = crypto
        .createHash('sha256')
        .update(`${usuarioId}:${logroId}:${new Date().getTime()}:${Math.random()}`)
        .digest('hex');
      
      // Crear fecha de obtención (entre 1 y 90 días atrás)
      const fechaObtenido = faker.date.past({ days: 90 });
      
      usuarioLogrosData.push({
        id: uuidv4(),
        usuario_id: usuarioId,
        logro_id: logroId,
        fecha_obtenido: fechaObtenido,
        token_hash: tokenHash
      });
    }
  }
  
  // Solo insertar si hay datos
  if (usuarioLogrosData.length > 0) {
    await knex('usuario_logros').insert(usuarioLogrosData);
    console.log(`Asignados ${usuarioLogrosData.length} logros a usuarios`);
  } else {
    console.log('No se pudieron asignar logros a usuarios');
  }
};
