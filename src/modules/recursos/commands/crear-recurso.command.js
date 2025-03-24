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
    
    // Verificar que el tipo de recurso es válido
    const tiposValidos = ['humano', 'material', 'tecnologico', 'financiero'];
    if (!tiposValidos.includes(recurso.tipo)) {
      logger.warn(`Tipo de recurso inválido: ${recurso.tipo}`);
      throw new Error(`Tipo de recurso inválido. Debe ser uno de: ${tiposValidos.join(', ')}`);
    }
    
    // Genera un nuevo UUID para el recurso
    const recursoId = uuidv4();
    
    // Prepara los datos para inserción
    const recursoData = {
      id: recursoId,
      nombre: recurso.nombre,
      descripcion: recurso.descripcion || null,
      tipo: recurso.tipo,
      costo: recurso.costo || 0,
      moneda: recurso.moneda || 'USD',
      disponibilidad: recurso.disponibilidad || 'disponible',
      propiedades: recurso.propiedades || {},
      creado_por: usuarioId,
      creado_en: new Date(),
      actualizado_en: new Date()
    };
    
    // Inserta el nuevo recurso en la base de datos
    await db.none(`
      INSERT INTO recursos (
        id, nombre, descripcion, tipo, 
        costo, moneda, disponibilidad, propiedades,
        creado_por, creado_en, actualizado_en
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
    `, [
      recursoData.id, 
      recursoData.nombre, 
      recursoData.descripcion, 
      recursoData.tipo,
      recursoData.costo,
      recursoData.moneda,
      recursoData.disponibilidad,
      recursoData.propiedades,
      recursoData.creado_por, 
      recursoData.creado_en, 
      recursoData.actualizado_en
    ]);
    
    // Si se especifican asignaciones iniciales, crearlas
    if (recurso.asignaciones && Array.isArray(recurso.asignaciones) && recurso.asignaciones.length > 0) {
      for (const asignacion of recurso.asignaciones) {
        // Verificar que el equipo existe
        const equipoExiste = await db.oneOrNone(`
          SELECT id FROM equipos WHERE id = $1
        `, [asignacion.equipo_id]);
        
        if (equipoExiste) {
          // Crear la asignación
          await db.none(`
            INSERT INTO recurso_asignaciones (
              id, recurso_id, equipo_id, 
              cantidad, fecha_inicio, fecha_fin,
              notas, creado_por, creado_en, actualizado_en
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
          `, [
            uuidv4(),
            recursoData.id,
            asignacion.equipo_id,
            asignacion.cantidad || 1,
            asignacion.fecha_inicio || new Date(),
            asignacion.fecha_fin || null,
            asignacion.notas || null,
            usuarioId,
            new Date(),
            new Date()
          ]);
          
          logger.info(`Asignación creada para recurso ${recursoId} al equipo ${asignacion.equipo_id}`);
        } else {
          logger.warn(`Equipo no encontrado para asignación: ${asignacion.equipo_id}`);
        }
      }
    }
    
    // Recupera el recurso recién creado para devolverlo
    const nuevoRecurso = await db.one(`
      SELECT r.*, 
             u.nombre as creador_nombre
      FROM recursos r
      LEFT JOIN usuarios u ON r.creado_por = u.id
      WHERE r.id = $1
    `, [recursoId]);
    
    // Obtener asignaciones del recurso
    const asignaciones = await db.manyOrNone(`
      SELECT ra.*, 
             e.nombre as equipo_nombre
      FROM recurso_asignaciones ra
      JOIN equipos e ON ra.equipo_id = e.id
      WHERE ra.recurso_id = $1
    `, [recursoId]);
    
    // Construir objeto de respuesta completo
    const recursoCompleto = {
      ...nuevoRecurso,
      asignaciones: asignaciones || []
    };
    
    logger.info(`Recurso creado exitosamente: ID=${recursoId}`);
    
    return recursoCompleto;
  } catch (error) {
    logger.error(`Error al crear recurso: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
