/**
 * Punto de entrada principal del sistema ERP
 * Inicializa la aplicación y configura el manejo de errores globales
 */
require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');

// Importar conexión a la base de datos
const db = require('./config/database');

// Iniciar servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`Servidor ejecutándose en puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`);
  console.log(`Servidor ejecutándose en puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`);
});

// Manejar rechazos de promesas no controlados
process.on('unhandledRejection', (err) => {
  logger.error('RECHAZO NO CONTROLADO! Cerrando aplicación...');
  logger.error(err.name, err.message);
  console.error('Error no controlado:', err);
});

// Manejar excepciones no capturadas
process.on('uncaughtException', (err) => {
  logger.error('EXCEPCIÓN NO CAPTURADA! Cerrando aplicación...');
  logger.error(err);
  
  server.close(() => {
    process.exit(1);
  });
});