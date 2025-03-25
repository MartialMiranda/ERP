/**
 * Configuración de base de datos para migraciones/semillas y aplicación.
 * Sigue principios CQRS separando la configuración para diferentes operaciones.
 */
const knex = require('knex');
const knexConfig = require('../../../knexfile');
const pgp = require('pg-promise')();
const logger = require('../../utils/logger');

// Configuración basada en entorno
const environment = process.env.NODE_ENV || 'development';

// Instancia Knex (para migraciones y construcción de consultas)
const knexInstance = knex(knexConfig[environment]);

// Instancia pg-promise (para consultas de aplicación)
const connection = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'erp_proyecto',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// Crear la instancia de la base de datos
const pgDb = pgp(connection);

// Manejar eventos de conexión
pgDb.connect()
  .then(obj => {
    logger.info('Conexión a la base de datos establecida correctamente');
    obj.done(); // Liberar el cliente de conexión
  })
  .catch(error => {
    logger.error(`Error al conectar a la base de datos: ${error.message}`);
  });

// Exportar las instancias para uso en toda la aplicación
module.exports = {
  pgDb,     // Para consultas pg-promise (operaciones de lectura en CQRS)
  knex: knexInstance, // Para consultas knex (operaciones de escritura en CQRS)
  logger
};
