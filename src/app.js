/**
 * Aplicación principal del ERP
 * Integra todos los módulos y middleware necesarios
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const winston = require('winston');
const { rateLimit } = require('express-rate-limit');
const { verifyToken } = require('./middleware/auth.middleware');

// Importar conexión a la base de datos
const db = require('./config/database');

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

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const proyectosRoutes = require('./routes/proyectos.routes');
const tareasRoutes = require('./routes/tareas.routes');
const equiposRoutes = require('./routes/equipos.routes');
const recursosRoutes = require('./routes/recursos.routes');
const asignacionesRoutes = require('./routes/asignaciones.routes');
const reportesRoutes = require('./routes/reportes.routes');

// Crear la aplicación Express
const app = express();

// Middleware
app.use(helmet()); // Seguridad HTTP
app.use(cors()); // Habilitar CORS
app.use(compression()); // Compresión de respuestas
app.use(express.json()); // Parseo de JSON
app.use(express.urlencoded({ extended: true })); // Parseo de formularios

// HTTP request logging
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined')); // Logging detallado en producción
} else {
  app.use(morgan('dev')); // Logging simplificado en desarrollo
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limitar cada IP a 100 solicitudes por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas solicitudes desde esta IP, intente nuevamente después de 15 minutos'
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

// Ruta de estado
app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rutas del API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/proyectos', proyectosRoutes);
app.use('/api/tareas', tareasRoutes);
app.use('/api/equipos', equiposRoutes);
app.use('/api/recursos', recursosRoutes);
app.use('/api/asignaciones', asignacionesRoutes);
app.use('/api/reportes', reportesRoutes);

// Ruta para documentación del API (si existe)
app.use('/api/docs', express.static('docs/api'));

// Middleware para manejo de errores 404
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `La ruta ${req.originalUrl} no existe en este servidor`
  });
});

// Middleware para manejo de errores generales
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Error Interno del Servidor',
      status: err.status || 500
    }
  });
});

// Exportar la aplicación para su uso en index.js y para pruebas
module.exports = { app, logger };
