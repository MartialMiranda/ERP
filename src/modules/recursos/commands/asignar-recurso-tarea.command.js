/**
 * OBSOLETO: Ahora los recursos se asignan a proyectos, no a tareas específicas
 * Siguiendo el esquema actual de la base de datos
 */
const winston = require('winston');

// Configuración del logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

/**
 * OBSOLETO: Ahora los recursos se asignan a proyectos, no a tareas específicas
 * @param {Object} asignacion - Datos de la asignación
 * @param {string} usuarioId - ID del usuario
 * @returns {Promise<Error>} - Error indicando que esta funcionalidad no está disponible
 */
async function execute(asignacion, usuarioId) {
  logger.error(`Intento de usar la función obsoleta asignar-recurso-tarea por usuario: ${usuarioId}`);
  throw new Error('Esta funcionalidad no está disponible. Los recursos ahora se asignan a proyectos, no a tareas específicas. Use la función asignar-recurso.command.js para asignar un recurso a un proyecto.');
}

module.exports = { execute };
