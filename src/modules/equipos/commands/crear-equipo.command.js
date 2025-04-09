/**
 * Comando para crear un nuevo equipo
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
 * Ejecuta el comando para crear un nuevo equipo
 * @param {Object} equipo - Datos del equipo a crear
 * @param {string} usuarioId - ID del usuario que crea el equipo
 * @returns {Promise<Object>} - Equipo creado
 */
async function execute(equipo, usuarioId) {
  try {
    logger.info(`Creando nuevo equipo: ${equipo.nombre} por usuario: ${usuarioId}`);
    
    // Verificar que el proyecto existe y que el usuario tiene acceso a él
    const proyecto = await db.oneOrNone(`
      SELECT p.* 
      FROM proyectos p
      WHERE p.id = $1 AND p.creado_por = $2
    `, [equipo.proyecto_id, usuarioId]);
    
    if (!proyecto) {
      logger.warn(`Proyecto no encontrado o sin permisos para crear equipo: ${equipo.proyecto_id}`);
      throw new Error('Proyecto no encontrado o sin permisos para crear equipo');
    }
    
    // Genera un nuevo UUID para el equipo
    const equipoId = uuidv4();
    
    // Prepara los datos para inserción
    const equipoData = {
      id: equipoId,
      nombre: equipo.nombre,
      descripcion: equipo.descripcion || null,
      creado_en: new Date(),
      actualizado_en: new Date()
    };
    
    // Verifica que el líder exista
    const liderExiste = await db.oneOrNone(`
      SELECT id FROM usuarios WHERE id = $1
    `, [equipo.lider_id || usuarioId]);
    
    if (!liderExiste) {
      logger.warn(`Líder de equipo no encontrado: ${equipo.lider_id}`);
      throw new Error('El usuario designado como líder no existe');
    }
    
    // Iniciar transacción
    await db.tx(async t => {
      // Inserta el nuevo equipo en la base de datos
      await t.none(`
        INSERT INTO equipos (
          id, nombre, descripcion, creado_en, actualizado_en
        ) VALUES (
          $1, $2, $3, $4, $5
        )
      `, [
        equipoData.id, 
        equipoData.nombre, 
        equipoData.descripcion,
        equipoData.creado_en,
        equipoData.actualizado_en
      ]);

      // Asociar el equipo al proyecto
      await t.none(`
        INSERT INTO proyecto_equipos (
          id, proyecto_id, equipo_id, creado_en
        ) VALUES (
          $1, $2, $3, $4
        )
      `, [
        uuidv4(),
        equipo.proyecto_id,
        equipoData.id,
        new Date()
      ]);
      
      // Añadir al líder como miembro del equipo
      await t.none(`
        INSERT INTO equipo_usuarios (
          id, equipo_id, usuario_id, rol, asignado_en
        ) VALUES (
          $1, $2, $3, $4, $5
        )
      `, [
        uuidv4(),
        equipoData.id,
        equipo.lider_id || usuarioId,
        'lider',
        new Date()
      ]);
      
      // Añadir miembros iniciales al equipo si se especifican
      if (equipo.miembros && Array.isArray(equipo.miembros)) {
        for (const miembroId of equipo.miembros) {
          // Verificar que el usuario existe
          const miembroExiste = await t.oneOrNone(`
            SELECT id FROM usuarios WHERE id = $1
          `, [miembroId]);
          
          if (miembroExiste && miembroId !== (equipo.lider_id || usuarioId)) {
            await t.none(`
              INSERT INTO equipo_usuarios (
                id, equipo_id, usuario_id, rol, asignado_en
              ) VALUES (
                $1, $2, $3, $4, $5
              )
            `, [
              uuidv4(),
              equipoData.id,
              miembroId,
              'miembro',
              new Date()
            ]);
            
            logger.info(`Miembro añadido al equipo: ${miembroId}`);
          }
        }
      }
    });
    
    // Recupera el equipo recién creado
    const nuevoEquipo = await db.one(`
      SELECT e.*, p.id as proyecto_id, p.nombre as proyecto_nombre
      FROM equipos e
      JOIN proyecto_equipos pe ON e.id = pe.equipo_id
      JOIN proyectos p ON pe.proyecto_id = p.id
      WHERE e.id = $1
    `, [equipoId]);
    
    // Obtener miembros del equipo
    const miembros = await db.manyOrNone(`
      SELECT eu.*, 
             u.nombre, 
             u.email
      FROM equipo_usuarios eu
      JOIN usuarios u ON eu.usuario_id = u.id
      WHERE eu.equipo_id = $1
    `, [equipoId]);
    
    // Construir objeto de respuesta completo
    const equipoCompleto = {
      ...nuevoEquipo,
      miembros: miembros || []
    };
    
    logger.info(`Equipo creado exitosamente: ID=${equipoId}`);
    
    return equipoCompleto;
  } catch (error) {
    logger.error(`Error al crear equipo: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
