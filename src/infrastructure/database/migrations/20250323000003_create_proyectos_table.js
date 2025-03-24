/**
 * Migration: Create proyectos table
 */
exports.up = function(knex) {
  return knex.schema.createTable('proyectos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('nombre', 255).notNullable();
    table.text('descripcion').nullable();
    table.date('fecha_inicio').notNullable();
    table.date('fecha_fin').nullable();
    table.enu('estado', ['planificado', 'en progreso', 'completado', 'cancelado']).notNullable();
    table.uuid('creado_por').references('id').inTable('usuarios').onDelete('SET NULL');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('proyectos');
};
