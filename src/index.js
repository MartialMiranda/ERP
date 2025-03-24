// Importar la aplicación Express configurada
const { app, logger } = require('./app');

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Servidor ejecutándose en el puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`);
  console.log(`Servidor ejecutándose en el puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`);
});

// Manejar rechazos de promesas no controlados
process.on('unhandledRejection', (err) => {
  logger.error('¡RECHAZO NO MANEJADO! Cerrando...');
  logger.error(err.name, err.message);
  process.exit(1);
});