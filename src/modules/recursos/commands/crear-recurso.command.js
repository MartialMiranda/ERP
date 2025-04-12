/**
 * Comando para crear un nuevo recurso
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
 * Ejecuta el comando para crear un nuevo recurso
 * @param {Object} recurso - Datos del recurso a crear
 * @param {string} usuarioId - ID del usuario que crea el recurso
 * @returns {Promise<Object>} - Recurso creado
 */
async function execute(recurso, usuarioId) {
  try {
    logger.info(`Creando nuevo recurso: ${recurso.nombre} por usuario: ${usuarioId}`);
    
    // Verificar que el proyecto existe si se proporciona un proyecto_id
    if (recurso.proyecto_id) {
      const proyectoExiste = await db.oneOrNone(`
        SELECT id, creado_por FROM proyectos WHERE id = $1
      `, [recurso.proyecto_id]);
      
      if (!proyectoExiste) {
        logger.warn(`Proyecto no encontrado: ${recurso.proyecto_id}`);
        throw new Error('Proyecto no encontrado');
      }
      
      // Verificar que el usuario tiene permisos en el proyecto
      if (proyectoExiste.creado_por !== usuarioId) {
        const esMiembroEquipo = await db.oneOrNone(`
          SELECT 1
          FROM proyecto_equipos pe
          JOIN equipo_usuarios eu ON pe.equipo_id = eu.equipo_id
          WHERE pe.proyecto_id = $1 AND eu.usuario_id = $2
          LIMIT 1
        `, [recurso.proyecto_id, usuarioId]);
        
        if (!esMiembroEquipo) {
          logger.warn(`Usuario ${usuarioId} sin permisos para añadir recursos al proyecto ${recurso.proyecto_id}`);
          throw new Error('Sin permisos para añadir recursos a este proyecto');
        }
      }
    }
    
    // Genera un nuevo UUID para el recurso
    const recursoId = uuidv4();
    
    // Prepara los datos para inserción
    const recursoData = {
      id: recursoId,
      nombre: recurso.nombre,
      descripcion: recurso.descripcion || null,
      cantidad: recurso.cantidad || 1,
      proyecto_id: recurso.proyecto_id || null,
      creado_en: new Date(),
      actualizado_en: new Date()
    };
    
    // Inserta el nuevo recurso en la base de datos
    await db.none(`
      INSERT INTO recursos (
        id, nombre, descripcion, cantidad, 
        proyecto_id, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
    `, [
      recursoData.id, 
      recursoData.nombre, 
      recursoData.descripcion, 
      recursoData.cantidad,
      recursoData.proyecto_id,
      recursoData.creado_en, 
      recursoData.actualizado_en
    ]);
    
    // Recupera el recurso recién creado para devolverlo
    const nuevoRecurso = await db.one(`
      SELECT r.*
      FROM recursos r
      WHERE r.id = $1
    `, [recursoId]);
    
    // Obtener información del proyecto (si existe)
    let proyecto = null;
    if (nuevoRecurso.proyecto_id) {
      proyecto = await db.oneOrNone(`
        SELECT p.*, u.nombre as creador_nombre
        FROM proyectos p
        LEFT JOIN usuarios u ON p.creado_por = u.id
        WHERE p.id = $1
      `, [nuevoRecurso.proyecto_id]);
      
      // Obtener equipos asociados al proyecto
      if (proyecto) {
        proyecto.equipos = await db.manyOrNone(`
          SELECT e.id, e.nombre, 
                 (
                   SELECT COUNT(eu.id) 
                   FROM equipo_usuarios eu 
                   WHERE eu.equipo_id = e.id
                 ) as total_miembros
          FROM equipos e
          JOIN proyecto_equipos pe ON e.id = pe.equipo_id
          WHERE pe.proyecto_id = $1
          ORDER BY e.nombre ASC
        `, [proyecto.id]);
      }
    }
    
    // Construir objeto de respuesta completo
    const recursoCompleto = {
      ...nuevoRecurso,
      proyecto: proyecto,
      disponibilidad: nuevoRecurso.cantidad > 0 ? 'disponible' : 'agotado'
    };
    
    logger.info(`Recurso creado exitosamente: ID=${recursoId}`);
    
    return recursoCompleto;
  } catch (error) {
    logger.error(`Error al crear recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
