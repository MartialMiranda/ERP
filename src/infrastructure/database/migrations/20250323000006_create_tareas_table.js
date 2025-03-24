/**
 * Migration: Create tareas table
 */
exports.up = function(knex) {
  return knex.schema.createTable('tareas', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('titulo', 255).notNullable();
    table.text('descripcion').nullable();
    table.enu('prioridad', ['baja', 'media', 'alta']).notNullable();
    table.enu('estado', ['pendiente', 'en progreso', 'completada', 'bloqueada']).notNullable();
    table.date('fecha_vencimiento').nullable();
    table.uuid('proyecto_id').references('id').inTable('proyectos').onDelete('CASCADE');
    table.uuid('asignado_a').references('id').inTable('usuarios').onDelete('SET NULL');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    table.timestamp('actualizado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('tareas');
};
