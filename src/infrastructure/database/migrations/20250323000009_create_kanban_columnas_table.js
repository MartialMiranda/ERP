/**
 * Migration: Create kanban_columnas table
 */
exports.up = function(knex) {
  return knex.schema.createTable('kanban_columnas', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('nombre', 255).notNullable();
    table.integer('posicion').notNullable();
    table.uuid('proyecto_id').references('id').inTable('proyectos').onDelete('CASCADE');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('kanban_columnas');
};
