/**
 * Migration: Create equipos table
 */
exports.up = function(knex) {
  return knex.schema.createTable('equipos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('nombre', 255).notNullable();
    table.text('descripcion').nullable();
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('equipos');
};
