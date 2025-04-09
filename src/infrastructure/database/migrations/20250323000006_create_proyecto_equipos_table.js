exports.up = function(knex) {
  return knex.schema.createTable('proyecto_equipos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('proyecto_id').references('id').inTable('proyectos').onDelete('CASCADE');
    table.uuid('equipo_id').references('id').inTable('equipos').onDelete('CASCADE');
    table.timestamp('creado_en').defaultTo(knex.fn.now());
    
    // Índices
    table.index(['proyecto_id']);
    table.index(['equipo_id']);
    
    // Restricción única para evitar duplicados
    table.unique(['proyecto_id', 'equipo_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('proyecto_equipos');
};
