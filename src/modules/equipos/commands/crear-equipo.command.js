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
      proyecto_id: equipo.proyecto_id,
      lider_id: equipo.lider_id || usuarioId,
      creado_por: usuarioId,
      creado_en: new Date(),
      actualizado_en: new Date()
    };
    
    // Verifica que el líder exista
    const liderExiste = await db.oneOrNone(`
      SELECT id FROM usuarios WHERE id = $1
    `, [equipoData.lider_id]);
    
    if (!liderExiste) {
      logger.warn(`Líder de equipo no encontrado: ${equipoData.lider_id}`);
      throw new Error('El usuario designado como líder no existe');
    }
    
    // Iniciar transacción
    await db.tx(async t => {
      // Inserta el nuevo equipo en la base de datos
      await t.none(`
        INSERT INTO equipos (
          id, nombre, descripcion, proyecto_id, 
          lider_id, creado_por, creado_en, actualizado_en
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
      `, [
        equipoData.id, 
        equipoData.nombre, 
        equipoData.descripcion, 
        equipoData.proyecto_id,
        equipoData.lider_id, 
        equipoData.creado_por, 
        equipoData.creado_en, 
        equipoData.actualizado_en
      ]);
      
      // Añadir al líder como miembro del equipo
      await t.none(`
        INSERT INTO equipo_usuarios (
          id, equipo_id, usuario_id, rol, creado_en, actualizado_en
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
      `, [
        uuidv4(),
        equipoData.id,
        equipoData.lider_id,
        'lider',
        new Date(),
        new Date()
      ]);
      
      // Añadir miembros iniciales al equipo si se especifican
      if (equipo.miembros && Array.isArray(equipo.miembros) && equipo.miembros.length > 0) {
        for (const miembroId of equipo.miembros) {
          // Verificar que el usuario existe
          const miembroExiste = await t.oneOrNone(`
            SELECT id FROM usuarios WHERE id = $1
          `, [miembroId]);
          
          if (miembroExiste && miembroId !== equipoData.lider_id) {
            await t.none(`
              INSERT INTO equipo_usuarios (
                id, equipo_id, usuario_id, rol, creado_en, actualizado_en
              ) VALUES (
                $1, $2, $3, $4, $5, $6
              )
            `, [
              uuidv4(),
              equipoData.id,
              miembroId,
              'miembro',
              new Date(),
              new Date()
            ]);
          }
        }
      }
    });
    
    // Recupera el equipo recién creado para devolverlo
    const nuevoEquipo = await db.one(`
      SELECT e.*, 
             p.nombre as proyecto_nombre,
             u_lider.nombre as lider_nombre,
             u_creador.nombre as creador_nombre
      FROM equipos e
      JOIN proyectos p ON e.proyecto_id = p.id
      LEFT JOIN usuarios u_lider ON e.lider_id = u_lider.id
      LEFT JOIN usuarios u_creador ON e.creado_por = u_creador.id
      WHERE e.id = $1
    `, [equipoId]);
    
    // Obtener miembros del equipo
    const miembros = await db.manyOrNone(`
      SELECT eu.*, 
             u.nombre, 
             u.email,
             u.avatar_url
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
