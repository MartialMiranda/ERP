/**
 * Comando para crear un nuevo proyecto
 * Siguiendo el patrón CQRS para separar operaciones de escritura
 */
const { db } = require('../../../config/database');
const { v4: uuidv4 } = require('uuid');
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
 * Ejecuta el comando para crear un nuevo proyecto
 * @param {Object} proyecto - Datos del proyecto a crear
 * @param {string} usuarioId - ID del usuario que crea el proyecto
 * @returns {Promise<Object>} - Proyecto creado
 */
async function execute(proyecto, usuarioId) {
  try {
    logger.info(`Creando nuevo proyecto: ${proyecto.nombre} por usuario: ${usuarioId}`);
    
    // Genera un nuevo UUID para el proyecto
    const proyectoId = uuidv4();
    
    // Prepara los datos para inserción
    const proyectoData = {
      id: proyectoId,
      nombre: proyecto.nombre,
      descripcion: proyecto.descripcion || null,
      fecha_inicio: proyecto.fecha_inicio,
      fecha_fin: proyecto.fecha_fin || null,
      estado: proyecto.estado || 'planificado',
      creado_por: usuarioId,
      creado_en: new Date(),
      actualizado_en: new Date()
    };
    
    // Inserta el nuevo proyecto en la base de datos
    await db.none(`
      INSERT INTO proyectos (
        id, nombre, descripcion, fecha_inicio, fecha_fin, 
        estado, creado_por, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )
    `, [
      proyectoData.id, 
      proyectoData.nombre, 
      proyectoData.descripcion, 
      proyectoData.fecha_inicio, 
      proyectoData.fecha_fin, 
      proyectoData.estado, 
      proyectoData.creado_por, 
      proyectoData.creado_en, 
      proyectoData.actualizado_en
    ]);
    
    // Recupera el proyecto recién creado para devolverlo
    const nuevoProyecto = await db.one('SELECT * FROM proyectos WHERE id = $1', [proyectoId]);
    
    logger.info(`Proyecto creado exitosamente: ID=${proyectoId}`);
    
    return nuevoProyecto;
  } catch (error) {
    logger.error(`Error al crear proyecto: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
