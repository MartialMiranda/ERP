/**
 * Seed: Usuarios
 * Crea los usuarios iniciales
 */
const { v4: uuidv4 } = require('uuid');
const { faker } = require('@faker-js/faker/locale/es');
const bcrypt = require('bcrypt');

exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('usuarios').delete();
  
  // Generar hash de la contraseña (la misma para todos los usuarios de prueba)
  const plainPassword = 'password123';
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
  
  const userIds = [];
  const usersToInsert = [];

  // Admin user
  const adminId = uuidv4();
  userIds.push(adminId);
  
  usersToInsert.push({
    id: adminId,
    nombre: 'Administrador',
    email: 'admin@erp-sistema.com',
    contrasena: hashedPassword,
    rol: 'admin',
    tiene_2fa: false,
    creado_en: new Date(),
    actualizado_en: new Date()
  });
  
  // Crear 3 gestores (para representar gerentes/líderes)
  for (let i = 0; i < 3; i++) {
    const userId = uuidv4();
    userIds.push(userId);
    
    usersToInsert.push({
      id: userId,
      nombre: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      contrasena: hashedPassword,
      rol: 'gestor',
      tiene_2fa: faker.datatype.boolean(0.3), // 30% tienen 2FA
      creado_en: faker.date.past(),
      actualizado_en: new Date()
    });
  }
  
  // Crear 6 usuarios regulares (para representar desarrolladores, analistas, etc.)
  for (let i = 0; i < 6; i++) {
    const userId = uuidv4();
    userIds.push(userId);
    
    usersToInsert.push({
      id: userId,
      nombre: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      contrasena: hashedPassword,
      rol: 'usuario',
      tiene_2fa: faker.datatype.boolean(0.3), // 30% tienen 2FA
      creado_en: faker.date.past(),
      actualizado_en: new Date()
    });
  }
  
  await knex('usuarios').insert(usersToInsert);  
  // Return the user IDs for reference in other seeds
  return { adminId, userIds };
};
