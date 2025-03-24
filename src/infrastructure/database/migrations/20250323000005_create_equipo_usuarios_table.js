/**
 * Migration: Create equipo_usuarios table
 */
exports.up = function(knex) {
  return knex.schema.createTable('equipo_usuarios', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('equipo_id').references('id').inTable('equipos').onDelete('CASCADE');
    table.uuid('usuario_id').references('id').inTable('usuarios').onDelete('CASCADE');
    table.enu('rol', ['lider', 'miembro']).notNullable();
    table.timestamp('asignado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('equipo_usuarios');
};
