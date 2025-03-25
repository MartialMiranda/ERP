/**
 * Configuración de Base de Datos 
 * Este archivo importa la configuración centralizada de la capa de infraestructura
 * para mantener consistencia en toda la aplicación.
 */

// Importar configuración de base de datos desde la capa de infraestructura
const { pgDb, knex, logger } = require('../infrastructure/database/config');

// Exportar las instancias para uso en toda la aplicación
module.exports = {
  db: pgDb,     // Para consultas pg-promise (operaciones de lectura en CQRS)
  knex,         // Para consultas knex (operaciones de escritura en CQRS)
  logger
};