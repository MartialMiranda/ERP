/**
 * Migration: Create kanban_tareas table
 */
exports.up = function(knex) {
  return knex.schema.createTable('kanban_tareas', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tarea_id').references('id').inTable('tareas').onDelete('CASCADE');
    table.uuid('columna_id').references('id').inTable('kanban_columnas').onDelete('CASCADE');
    table.integer('posicion').notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('kanban_tareas');
};
