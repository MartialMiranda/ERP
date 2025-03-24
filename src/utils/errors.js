/**
 * Utilidad de errores personalizados para el sistema ERP
 */

/**
 * Error base para el sistema ERP
 */
class BaseError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error para recursos no encontrados
 */
class NotFoundError extends BaseError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'RESOURCE_NOT_FOUND');
  }
}

/**
 * Error para operaciones no autorizadas
 */
class UnauthorizedError extends BaseError {
  constructor(message = 'No autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Error para permisos insuficientes
 */
class ForbiddenError extends BaseError {
  constructor(message = 'Acceso prohibido') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Error para entradas de datos inválidos
 */
class ValidationError extends BaseError {
  constructor(message = 'Datos de entrada inválidos', details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Error para conflictos en los recursos
 */
class ConflictError extends BaseError {
  constructor(message = 'Conflicto con el estado actual del recurso') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Error para fallos en la autenticación
 */
class AuthenticationError extends BaseError {
  constructor(message = 'Error en la autenticación') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Error para recursos no disponibles
 */
class ServiceUnavailableError extends BaseError {
  constructor(message = 'Servicio no disponible') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Error para operaciones no permitidas
 */
class MethodNotAllowedError extends BaseError {
  constructor(message = 'Método no permitido') {
    super(message, 405, 'METHOD_NOT_ALLOWED');
  }
}

module.exports = {
  BaseError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  AuthenticationError,
  ServiceUnavailableError,
  MethodNotAllowedError
};
