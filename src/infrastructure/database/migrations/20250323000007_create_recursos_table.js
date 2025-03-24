/**
 * Migration: Create recursos table
 */
exports.up = function(knex) {
  return knex.schema.createTable('recursos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('nombre', 255).notNullable();
    table.text('descripcion').nullable();
    table.integer('cantidad').defaultTo(1);
    table.uuid('proyecto_id').references('id').inTable('proyectos').onDelete('CASCADE');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  })
  .then(() => {
    // Add check constraint for cantidad > 0
    return knex.raw('ALTER TABLE recursos ADD CONSTRAINT check_cantidad_positive CHECK (cantidad > 0)');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('recursos');
};
