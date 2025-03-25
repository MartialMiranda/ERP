#!/bin/bash
#
# Script de inicio para el contenedor Docker del sistema ERP
# Gestiona la inicialización de la base de datos y la ejecución de la aplicación
#
set -e

# Mostrar variables de entorno para depuración
echo "Variables de entorno actuales:"
echo "DB_HOST: $DB_HOST"
echo "DB_PORT: $DB_PORT"
echo "NODE_ENV: $NODE_ENV"
echo "RESET_DB: $RESET_DB"
echo "INIT_DB: $INIT_DB"
echo "RUN_SEEDS: $RUN_SEEDS"

# Esperar a que PostgreSQL esté disponible antes de continuar
wait_for_postgres() {
  echo "Esperando a que PostgreSQL esté disponible en $DB_HOST:$DB_PORT..."
  
  while ! nc -z $DB_HOST $DB_PORT; do
    echo "PostgreSQL no está disponible aún, esperando 2 segundos..."
    sleep 2
  done
  
  echo "¡PostgreSQL está disponible! Continuando con la inicialización..."
}

# Función para limpiar la base de datos (eliminar todas las tablas)
reset_database() {
  echo "Eliminando todas las tablas de la base de datos..."
  NODE_ENV=$NODE_ENV node_modules/.bin/knex migrate:rollback --all
  echo "Base de datos limpiada exitosamente."
}

# Ejecutar migraciones
run_migrations() {
  echo "Ejecutando migraciones..."
  NODE_ENV=$NODE_ENV node_modules/.bin/knex migrate:latest
  echo "Migraciones completadas exitosamente."
}

# Ejecutar seeders
run_seeds() {
  echo "Ejecutando seeders..."
  
  # Verificar si bcrypt necesita arreglarse
  if [ -f "/usr/src/app/node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node" ]; then
    echo "Verificando bcrypt..."
    if ! node -e "try { require('bcrypt'); console.log('bcrypt OK'); } catch(e) { console.error(e); process.exit(1); }"; then
      echo "Reinstalando bcrypt para arreglar problemas de compatibilidad..."
      npm uninstall bcrypt
      npm install bcrypt
    fi
  fi
  
  # Ejecutar seeders con Knex
  NODE_ENV=$NODE_ENV node_modules/.bin/knex seed:run
  echo "Seeders completados exitosamente."
}

# Inicializar la base de datos (usando el script existente)
initialize_database() {
  echo "Inicializando la base de datos..."
  node src/infrastructure/database/initDatabase.js
  echo "Base de datos inicializada exitosamente."
}

# Función principal
main() {
  # Esperar a que PostgreSQL esté disponible
  wait_for_postgres
  
  # Si RESET_DB está configurado como "true", limpiar la base de datos
  if [ "$RESET_DB" = "true" ]; then
    reset_database
  fi
  
  # Si INIT_DB está configurado como "true", usar el script de inicialización
  if [ "$INIT_DB" = "true" ]; then
    initialize_database
  else
    # De lo contrario, ejecutar migraciones y opcionalmente seeders
    run_migrations
    
    if [ "$RUN_SEEDS" = "true" ]; then
      run_seeds
    fi
  fi
  
  # Iniciar la aplicación
  echo "Iniciando la aplicación ERP..."
  exec node src/index.js
}

# Ejecutar la función principal
main
