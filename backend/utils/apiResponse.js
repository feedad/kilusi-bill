/**
 * API Response Helper Functions
 *
 * Standardized response formats for RESTful API compliance
 * Provides consistent success, error, and paginated response handlers
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Standard success response helper
 * @param {Object} data - Response data
 * @param {Object} meta - Additional metadata
 * @param {Object} options - Response options
 * @returns {Object} Standardized success response
 */
function successResponse(data = null, meta = {}, options = {}) {
  const response = {
    success: true,
    data: data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
      version: 'v1',
      ...meta
    }
  };

  // Add custom headers if provided
  if (options.headers) {
    response.headers = options.headers;
  }

  return response;
}

/**
 * Standard error response helper
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Array} details - Detailed error information
 * @param {Object} meta - Additional metadata
 * @param {Object} options - Response options
 * @returns {Object} Standardized error response
 */
function errorResponse(code, message, details = [], meta = {}, options = {}) {
  const response = {
    success: false,
    error: {
      code: code,
      message: message,
      details: details
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
      version: 'v1',
      ...meta
    }
  };

  // Add custom headers if provided
  if (options.headers) {
    response.headers = options.headers;
  }

  return response;
}

/**
 * Paginated response helper
 * @param {Array} data - Array of data items
 * @param {Object} pagination - Pagination metadata
 * @param {Object} meta - Additional metadata
 * @param {Object} options - Response options
 * @returns {Object} Standardized paginated response
 */
function paginatedResponse(data, pagination, meta = {}, options = {}) {
  const response = {
    success: true,
    data: data,
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      total: pagination.total || 0,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrev: pagination.page > 1,
      ...pagination
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
      version: 'v1',
      ...meta
    }
  };

  // Add custom headers if provided
  if (options.headers) {
    response.headers = options.headers;
  }

  return response;
}

/**
 * Generate unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return `req_${uuidv4()}`;
}

/**
 * HTTP Status Code Mapping
 */
const HTTP_STATUS = {
  // Success codes
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // Client error codes
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  VALIDATION_FAILED: 422,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server error codes
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

/**
 * Error Code Constants
 */
const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Authentication errors
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Authorization errors
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  ACCESS_DENIED: 'ACCESS_DENIED',

  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  QUERY_ERROR: 'QUERY_ERROR',

  // External service errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // General errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

/**
 * Create validation error response
 * @param {Array} validationErrors - Array of validation error objects
 * @param {Object} meta - Additional metadata
 * @returns {Object} Validation error response
 */
function validationErrorResponse(validationErrors, meta = {}) {
  return errorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    'Request validation failed',
    validationErrors,
    meta
  );
}

/**
 * Create not found error response
 * @param {string} resource - Resource name (e.g., 'Customer')
 * @param {Object} meta - Additional metadata
 * @returns {Object} Not found error response
 */
function notFoundErrorResponse(resource = 'Resource', meta = {}) {
  return errorResponse(
    ERROR_CODES.RESOURCE_NOT_FOUND,
    `${resource} not found`,
    [],
    meta
  );
}

/**
 * Create unauthorized error response
 * @param {Object} meta - Additional metadata
 * @returns {Object} Unauthorized error response
 */
function unauthorizedErrorResponse(meta = {}) {
  return errorResponse(
    ERROR_CODES.AUTHENTICATION_ERROR,
    'Authentication required',
    [],
    meta
  );
}

/**
 * Create forbidden error response
 * @param {Object} meta - Additional metadata
 * @returns {Object} Forbidden error response
 */
function forbiddenErrorResponse(meta = {}) {
  return errorResponse(
    ERROR_CODES.AUTHORIZATION_ERROR,
    'Access denied',
    [],
    meta
  );
}

/**
 * Create conflict error response
 * @param {string} message - Conflict message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Conflict error response
 */
function conflictErrorResponse(message = 'Resource conflict', meta = {}) {
  return errorResponse(
    ERROR_CODES.RESOURCE_CONFLICT,
    message,
    [],
    meta
  );
}

/**
 * Create rate limit error response
 * @param {Object} meta - Additional metadata
 * @returns {Object} Rate limit error response
 */
function rateLimitErrorResponse(meta = {}) {
  return errorResponse(
    ERROR_CODES.RATE_LIMIT_EXCEEDED,
    'Too many requests',
    [],
    meta
  );
}

/**
 * Create internal server error response
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 * @returns {Object} Internal server error response
 */
function internalServerErrorResponse(message = 'Internal server error', meta = {}) {
  return errorResponse(
    ERROR_CODES.INTERNAL_SERVER_ERROR,
    message,
    [],
    meta
  );
}

/**
 * Create external service error response
 * @param {string} serviceName - Name of the external service
 * @param {string} message - Error message
 * @param {Object} meta - Additional metadata
 * @returns {Object} External service error response
 */
function externalServiceErrorResponse(serviceName, message = 'External service unavailable', meta = {}) {
  return errorResponse(
    ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    `${serviceName}: ${message}`,
    [],
    meta
  );
}

module.exports = {
  // Main response helpers
  successResponse,
  errorResponse,
  paginatedResponse,

  // Specific error helpers
  validationErrorResponse,
  notFoundErrorResponse,
  unauthorizedErrorResponse,
  forbiddenErrorResponse,
  conflictErrorResponse,
  rateLimitErrorResponse,
  internalServerErrorResponse,
  externalServiceErrorResponse,

  // Constants
  HTTP_STATUS,
  ERROR_CODES,

  // Utility functions
  generateRequestId
};