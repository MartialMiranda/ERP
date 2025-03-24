/**
 * Seed: Autenticación 2FA
 * Crea registros de autenticación 2FA para usuarios que tienen 2FA habilitado
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');

exports.seed = async function(knex) {
  // Cargar datos del seed anterior
  const { adminId, userIds } = await knex('usuarios')
    .first()
    .then(() => require('./01_usuarios').seed(knex));
  
  // Deletes ALL existing entries
  await knex('autenticacion_2fa').delete();
  
  // Obtener usuarios con 2FA habilitado
  const usuariosCon2fa = await knex('usuarios')
    .where('tiene_2fa', true)
    .select('id');
  
  if (usuariosCon2fa.length === 0) {
    console.log('No hay usuarios con 2FA habilitado');
    return { adminId, userIds };
  }
  
  const auth2faData = [];
  
  // Crear códigos 2FA para usuarios que tienen 2FA habilitado
  for (const usuario of usuariosCon2fa) {
    // Generar fecha de expiración (30 minutos en el futuro)
    const expiraEn = new Date();
    expiraEn.setMinutes(expiraEn.getMinutes() + 30);
    
    auth2faData.push({
      id: uuidv4(),
      usuario_id: usuario.id,
      codigo_2fa: faker.number.int({ min: 100000, max: 999999 }).toString(),
      expira_en: expiraEn,
      generado_en: new Date()
    });
  }
  
  await knex('autenticacion_2fa').insert(auth2faData);
  
  console.log(`Creados ${auth2faData.length} registros de autenticación 2FA`);
  
  // Return for reference in other seeds
  return { adminId, userIds };
};
