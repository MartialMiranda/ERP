/**
 * Aplicación principal del sistema ERP
 * Configura middleware, rutas y servicios
 */
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const logger = require('./utils/logger');

// Importar rutas
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const proyectosRoutes = require('./routes/proyectos.routes');
const tareasRoutes = require('./routes/tareas.routes');
const equiposRoutes = require('./routes/equipos.routes');
const recursosRoutes = require('./routes/recursos.routes');
const asignacionesRoutes = require('./routes/asignaciones.routes');
const reportesRoutes = require('./routes/reportes.routes');
const kanbanRoutes = require('./routes/kanban.routes');

// Crear la aplicación Express
const app = express();

// Middleware
app.use(helmet()); // Seguridad HTTP
app.use(cors()); // Habilitar CORS
app.use(compression()); // Compresión de respuestas
app.use(express.json()); // Parseo de JSON
app.use(express.urlencoded({ extended: true })); // Parseo de formularios

// Configuración de logs HTTP
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined')); // Logs detallados en producción
} else {
  app.use(morgan('dev')); // Logs simplificados en desarrollo
}

// Configuración de límites de velocidad
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limitar cada IP a 100 solicitudes por ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas solicitudes desde esta IP, inténtelo de nuevo después de 15 minutos'
});
app.use('/api/', limiter);

// Ruta principal - página de bienvenida
app.get('/', (req, res) => {
  res.status(200).json({
    mensaje: 'Bienvenido al Sistema ERP',
    version: '1.0.0',
    documentacionApi: '/api/docs',
    estadoApi: '/api/status',
    salud: '/health'
  });
});

// Endpoint de verificación de salud
app.get('/health', (req, res) => {
  res.status(200).json({ estado: 'ACTIVO', timestamp: new Date() });
});

// Endpoint de estado de la API
app.get('/api/status', (req, res) => {
  res.json({
    estado: 'OK',
    timestamp: new Date(),
    entorno: process.env.NODE_ENV || 'development'
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
app.use('/api/kanban', kanbanRoutes);

// Ruta para documentación del API (si existe)
app.use('/api/docs', express.static('docs/api'));

// Middleware para manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    error: 'No Encontrado',
    mensaje: `La ruta ${req.originalUrl} no existe en este servidor`
  });
});

// Middleware para manejo de errores generales
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  
  res.status(err.status || 500).json({
    error: {
      mensaje: err.message || 'Error Interno del Servidor',
      estado: err.status || 500
    }
  });
});

// Exportar la aplicación Express
module.exports = app;
