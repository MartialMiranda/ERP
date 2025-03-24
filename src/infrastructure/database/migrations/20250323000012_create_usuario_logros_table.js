/**
 * Migration: Create usuario_logros table
 */
exports.up = function(knex) {
  return knex.schema.createTable('usuario_logros', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('usuario_id').references('id').inTable('usuarios').onDelete('CASCADE');
    table.uuid('logro_id').references('id').inTable('logros').onDelete('CASCADE');
    table.timestamp('fecha_obtenido').defaultTo(knex.fn.now());
    table.string('token_hash', 255).notNullable().unique().comment('Representación de un NFT interno o token único');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('usuario_logros');
};
