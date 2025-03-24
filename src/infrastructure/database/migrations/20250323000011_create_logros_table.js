/**
 * Migration: Create logros table
 */
exports.up = function(knex) {
  return knex.schema.createTable('logros', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('nombre', 255).notNullable();
    table.text('descripcion').notNullable();
    table.text('criterio').notNullable();
    table.timestamp('creado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('logros');
};
