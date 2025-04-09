/**
 * Comando para crear una nueva columna Kanban
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
 * Ejecuta el comando para crear una nueva columna Kanban
 * @param {Object} columna - Datos de la columna a crear
 * @param {string} proyectoId - ID del proyecto al que pertenece la columna
 * @param {string} usuarioId - ID del usuario que crea la columna
 * @returns {Promise<Object>} - Columna creada
 */
async function execute(columna, proyectoId, usuarioId) {
  try {
    logger.info(`Creando nueva columna kanban: ${columna.nombre} para proyecto: ${proyectoId} por usuario: ${usuarioId}`);
    
    // Verificar que el usuario tiene permisos en el proyecto
    const tieneAcceso = await db.oneOrNone(`
      SELECT 1
      FROM proyectos p
      LEFT JOIN proyecto_equipos pe ON pe.proyecto_id = p.id
      LEFT JOIN equipos e ON pe.equipo_id = e.id
      LEFT JOIN equipo_usuarios eu ON eu.equipo_id = e.id
      WHERE p.id = $1 AND (p.creado_por = $2 OR eu.usuario_id = $2)
      LIMIT 1
    `, [proyectoId, usuarioId]);
    
    if (!tieneAcceso) {
      logger.warn(`Usuario ${usuarioId} sin acceso al proyecto ${proyectoId}`);
      throw new Error('Proyecto no encontrado o sin permisos para modificar');
    }
    
    // Determinar la posición para la nueva columna
    const ultimaPosicion = await db.oneOrNone(`
      SELECT MAX(posicion) as max_posicion
      FROM kanban_columnas
      WHERE proyecto_id = $1
    `, [proyectoId]);
    
    const posicion = ultimaPosicion?.max_posicion ? ultimaPosicion.max_posicion + 1 : 0;
    
    // Genera un nuevo UUID para la columna
    const columnaId = uuidv4();
    
    // Prepara los datos para inserción
    const columnaData = {
      id: columnaId,
      nombre: columna.nombre,
      posicion: columna.posicion !== undefined ? columna.posicion : posicion,
      proyecto_id: proyectoId
    };
    
    // Inserta la nueva columna en la base de datos
    await db.none(`
      INSERT INTO kanban_columnas (
        id, nombre, posicion, proyecto_id
      ) VALUES (
        $1, $2, $3, $4
      )
    `, [
      columnaData.id, 
      columnaData.nombre, 
      columnaData.posicion, 
      columnaData.proyecto_id
    ]);
    
    // Recupera la columna recién creada para devolverla
    const nuevaColumna = await db.one('SELECT * FROM kanban_columnas WHERE id = $1', [columnaId]);
    
    logger.info(`Columna kanban creada exitosamente: ID=${columnaId}`);
    
    return nuevaColumna;
  } catch (error) {
    logger.error(`Error al crear columna kanban: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
