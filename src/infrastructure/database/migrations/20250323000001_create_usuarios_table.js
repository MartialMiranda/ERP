/**
 * Migration: Create usuarios table
 */
exports.up = function(knex) {
  return knex.schema.createTable('usuarios', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('nombre', 100).notNullable();
    table.string('email', 100).notNullable().unique();
    table.string('contrasena', 255).notNullable();
    table.enu('rol', ['admin', 'gestor', 'usuario']).notNullable();
    table.boolean('tiene_2fa').defaultTo(false);
    table.enu('metodo_2fa', ['email', 'app']).nullable();
    table.string('secreto_2fa', 255).nullable();
    table.binary('huella_digital').nullable().comment('Para posible autenticación biométrica');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('usuarios');
};
