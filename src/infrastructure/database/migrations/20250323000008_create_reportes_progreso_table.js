/**
 * Migration: Create reportes_progreso table
 */
exports.up = function(knex) {
  return knex.schema.createTable('reportes_progreso', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('tarea_id').references('id').inTable('tareas').onDelete('CASCADE');
    table.uuid('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
    table.text('comentario').notNullable();
    table.integer('progreso_porcentaje').notNullable();
    table.timestamp('creado_en').defaultTo(knex.fn.now());
  })
  .then(() => {
    // Add check constraint for progreso_porcentaje between 0 and 100
    return knex.raw('ALTER TABLE reportes_progreso ADD CONSTRAINT check_progreso_range CHECK (progreso_porcentaje BETWEEN 0 AND 100)');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('reportes_progreso');
};
