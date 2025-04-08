/**
 * Comando para actualizar un equipo existente
 * Siguiendo el patrón CQRS para separar operaciones de escritura
 */
const { db } = require("../../../config/database");
const { v4: uuidv4 } = require("uuid");
const winston = require("winston");

// Configuración del logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

/**
 * Ejecuta el comando para actualizar un equipo existente
 * @param {string} equipoId - ID del equipo a actualizar
 * @param {Object} datosActualizados - Datos a actualizar del equipo
 * @param {string} usuarioId - ID del usuario que realiza la actualización
 * @returns {Promise<Object>} - Equipo actualizado
 */
async function execute(equipoId, datosActualizados, usuarioId) {
  try {
    logger.info(`Actualizando equipo: ${equipoId} por usuario: ${usuarioId}`);

    // Verificar que el equipo existe y que el usuario tiene permisos para actualizarlo
    // Solo el creador del proyecto o el líder del equipo pueden actualizar el equipo
    const equipo = await db.oneOrNone(
      `
      SELECT e.* 
      FROM equipos e
      JOIN proyectos p ON e.proyecto_id = p.id
      WHERE e.id = $1 AND (p.creado_por = $2 OR e.lider_id = $2)
    `,
      [equipoId, usuarioId]
    );

    if (!equipo) {
      logger.warn(
        `Intento de actualizar equipo inexistente o sin permisos: ${equipoId}`
      );
      throw new Error("Equipo no encontrado o sin permisos para actualizar");
    }

    // Preparar los campos a actualizar
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    // Nombre del equipo
    if (datosActualizados.nombre !== undefined) {
      updateFields.push(`nombre = $${paramCount++}`);
      updateValues.push(datosActualizados.nombre);
    }

    // Descripción del equipo
    if (datosActualizados.descripcion !== undefined) {
      updateFields.push(`descripcion = $${paramCount++}`);
      updateValues.push(datosActualizados.descripcion);
    }

    // Líder del equipo
    if (datosActualizados.lider_id !== undefined) {
      // Verificar que el nuevo líder existe
      const liderExiste = await db.oneOrNone(
        `
        SELECT id FROM usuarios WHERE id = $1
      `,
        [datosActualizados.lider_id]
      );

      if (!liderExiste) {
        logger.warn(
          `Nuevo líder de equipo no encontrado: ${datosActualizados.lider_id}`
        );
        throw new Error("El usuario designado como líder no existe");
      }

      updateFields.push(`lider_id = $${paramCount++}`);
      updateValues.push(datosActualizados.lider_id);
    }

    // Añadir siempre la fecha de actualización
    updateFields.push(`actualizado_en = $${paramCount++}`);
    updateValues.push(new Date());

    // Añadir el ID del equipo para el WHERE
    updateValues.push(equipoId);

    // Iniciar transacción para actualizar equipo y miembros si es necesario
    await db.tx(async (t) => {
      // Ejecutar la actualización de datos básicos del equipo
      if (updateFields.length > 0) {
        await t.none(
          `
          UPDATE equipos 
          SET ${updateFields.join(", ")} 
          WHERE id = $${paramCount}
        `,
          updateValues
        );

        logger.info(`Datos básicos del equipo actualizados: ID=${equipoId}`);
      }

      // Si se especifica un nuevo líder, actualizar su rol en equipo_usuarios
      if (
        datosActualizados.lider_id !== undefined &&
        datosActualizados.lider_id !== equipo.lider_id
      ) {
        // Verificar si el nuevo líder ya es miembro del equipo
        const esmiembro = await t.oneOrNone(
          `
          SELECT id FROM equipo_usuarios 
          WHERE equipo_id = $1 AND usuario_id = $2
        `,
          [equipoId, datosActualizados.lider_id]
        );

        if (esmiembro) {
          // Actualizar rol a 'lider'
          await t.none(
            `
            UPDATE equipo_usuarios 
            SET rol = 'lider', actualizado_en = $1
            WHERE equipo_id = $2 AND usuario_id = $3
          `,
            [new Date(), equipoId, datosActualizados.lider_id]
          );
        } else {
          // Añadir como nuevo miembro con rol 'lider'
          await t.none(
            `
            INSERT INTO equipo_usuarios (
              id, equipo_id, usuario_id, rol, creado_en, actualizado_en
            ) VALUES (
              $1, $2, $3, $4, $5, $6
            )
          `,
            [
              uuidv4(),
              equipoId,
              datosActualizados.lider_id,
              "lider",
              new Date(),
              new Date(),
            ]
          );
        }

        // Actualizar rol del líder anterior a 'miembro'
        await t.none(
          `
          UPDATE equipo_usuarios 
          SET rol = 'miembro', actualizado_en = $1
          WHERE equipo_id = $2 AND usuario_id = $3
        `,
          [new Date(), equipoId, equipo.lider_id]
        );

        logger.info(
          `Líder de equipo actualizado: ${equipo.lider_id} -> ${datosActualizados.lider_id}`
        );
      }

      // Actualizar miembros del equipo si se especifican
      if (
        datosActualizados.miembros !== undefined &&
        Array.isArray(datosActualizados.miembros)
      ) {
        // Obtener miembros actuales
        const miembrosActuales = await t.manyOrNone(
          `
          SELECT usuario_id FROM equipo_usuarios 
          WHERE equipo_id = $1
        `,
          [equipoId]
        );

        const idsActuales = miembrosActuales.map((m) => m.usuario_id);

        // Determinar miembros a añadir (están en miembros pero no en idsActuales)
        const miembrosNuevos = datosActualizados.miembros.filter(
          (id) =>
            !idsActuales.includes(id) &&
            id !== (datosActualizados.lider_id || equipo.lider_id)
        );

        // Determinar miembros a eliminar (están en idsActuales pero no en miembros)
        // Excepto el líder, que no se puede eliminar
        const miembrosEliminar = idsActuales.filter(
          (id) =>
            !datosActualizados.miembros.includes(id) &&
            id !== (datosActualizados.lider_id || equipo.lider_id)
        );

        // Añadir nuevos miembros
        for (const miembroId of miembrosNuevos) {
          // Verificar que el usuario existe
          const miembroExiste = await t.oneOrNone(
            `
            SELECT id FROM usuarios WHERE id = $1
          `,
            [miembroId]
          );

          if (miembroExiste) {
            await t.none(
              `
              INSERT INTO equipo_usuarios (
                id, equipo_id, usuario_id, rol, creado_en, actualizado_en
              ) VALUES (
                $1, $2, $3, $4, $5, $6
              )
            `,
              [uuidv4(), equipoId, miembroId, "miembro", new Date(), new Date()]
            );

            logger.info(`Miembro añadido al equipo: ${miembroId}`);
          }
        }

        // Eliminar miembros que ya no están en la lista
        if (miembrosEliminar.length > 0) {
          await t.none(
            `
            DELETE FROM equipo_usuarios 
            WHERE equipo_id = $1 AND usuario_id IN ($2:csv)
          `,
            [equipoId, miembrosEliminar]
          );

          logger.info(
            `Miembros eliminados del equipo: ${miembrosEliminar.join(", ")}`
          );
        }
      }
    });

    // Recuperar el equipo actualizado para devolverlo
    const equipoActualizado = await db.one(
      `
      SELECT e.*, 
             p.nombre as proyecto_nombre,
             u_lider.nombre as lider_nombre,
             u_creador.nombre as creador_nombre
      FROM equipos e
      JOIN proyectos p ON e.proyecto_id = p.id
      LEFT JOIN usuarios u_lider ON e.lider_id = u_lider.id
      LEFT JOIN usuarios u_creador ON e.creado_por = u_creador.id
      WHERE e.id = $1
    `,
      [equipoId]
    );

    // Obtener miembros actualizados del equipo
    const miembros = await db.manyOrNone(
      `
      SELECT eu.*, 
             u.nombre, 
             u.email,
             u.avatar_url
      FROM equipo_usuarios eu
      JOIN usuarios u ON eu.usuario_id = u.id
      WHERE eu.equipo_id = $1
    `,
      [equipoId]
    );

    // Construir objeto de respuesta completo
    const equipoCompleto = {
      ...equipoActualizado,
      miembros: miembros || [],
    };

    logger.info(`Equipo actualizado exitosamente: ID=${equipoId}`);

    return equipoCompleto;
  } catch (error) {
    logger.error(`Error al actualizar equipo: ${error.message}`);
    throw error;
  }
}

module.exports = { execute };
