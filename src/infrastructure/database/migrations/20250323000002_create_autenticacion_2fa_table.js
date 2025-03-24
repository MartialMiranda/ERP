/**
 * Migration: Create autenticacion_2fa table
 */
exports.up = function(knex) {
  return knex.schema.createTable('autenticacion_2fa', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('usuario_id').references('id').inTable('usuarios').onDelete('CASCADE');
    table.string('codigo_2fa', 10).notNullable();
    table.timestamp('expira_en').notNullable();
    table.timestamp('generado_en').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('autenticacion_2fa');
};
