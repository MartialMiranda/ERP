# Migraciones y Seeders de Base de Datos

Este directorio contiene migraciones de base de datos y seeders para el proyecto ERP.

## Estructura

- `migrations/`: Contiene todos los scripts de creación de tablas de la base de datos
- `seeds/`: Contiene los datos iniciales para la base de datos
- `config.js`: Configuración de la base de datos tanto para Knex como para pg-promise
- `initDatabase.js`: Utilidad para inicializar la base de datos automáticamente

## Comandos

Los siguientes comandos están disponibles en el proyecto para gestionar la base de datos:

- `npm run migrate`: Ejecutar todas las migraciones pendientes
- `npm run migrate:rollback`: Revertir el último lote de migraciones
- `npm run migrate:make <name>`: Crear un nuevo archivo de migración
- `npm run seed`: Ejecutar todos los archivos de seed para poblar la base de datos
- `npm run seed:make <name>`: Crear un nuevo archivo de seed
- `npm run db:setup`: Ejecutar migraciones y seeders en secuencia
- `npm run db:init`: Inicializar la base de datos (crear si no existe, ejecutar migraciones y seeders)
- `npm run start:with-db`: Iniciar la aplicación con inicialización automática de la base de datos

## Inicialización de la Base de Datos

La inicialización de la base de datos sigue los principios de CQRS separando:

1. **Comandos**: Creación de la base de datos, migraciones de esquema y seeding de datos
2. **Consultas**: Operaciones de lectura/escritura de la aplicación (manejadas por la aplicación principal)

## Uso en la Aplicación

La base de datos se puede acceder a través del archivo de configuración centralizado:

```javascript
const { knex, pgDb } = require('./infrastructure/database/config');

// Para construir consultas (knex):
const usuarios = await knex('usuarios').select('*');

// Para consultas directas (pg-promise):
const usuarios = await pgDb.any('SELECT * FROM usuarios');
```
