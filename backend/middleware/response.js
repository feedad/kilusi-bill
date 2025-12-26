/**
 * Response Standardization Middleware
 *
 * Express middleware for standardizing API responses across all endpoints
 * Implements consistent response formats using the apiResponse utilities
 */

const {
  successResponse,
  errorResponse,
  paginatedResponse,
  notFoundErrorResponse,
  validationErrorResponse,
  unauthorizedErrorResponse,
  forbiddenErrorResponse,
  internalServerErrorResponse,
  HTTP_STATUS
} = require('../utils/apiResponse');

/**
 * Standard Success Response Middleware
 * Sends a standardized success response
 * @param {Object} data - Response data
 * @param {Object} meta - Additional metadata
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(data = null, meta = {}, statusCode = HTTP_STATUS.OK) {
  return (req, res) => {
    const response = successResponse(data, meta);

    // Set response headers if provided
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
      delete response.headers;
    }

    res.status(statusCode).json(response);
  };
}

/**
 * Standard Error Response Middleware
 * Sends a standardized error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Array} details - Detailed error information
 * @param {Object} meta - Additional metadata
 * @param {number} statusCode - HTTP status code (default: 500)
 */
function sendError(code, message, details = [], meta = {}, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR) {
  return (req, res) => {
    const response = errorResponse(code, message, details, meta);

    // Set response headers if provided
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
      delete response.headers;
    }

    res.status(statusCode).json(response);
  };
}

/**
 * Standard Paginated Response Middleware
 * Sends a standardized paginated response
 * @param {Array} data - Array of data items
 * @param {Object} pagination - Pagination metadata
 * @param {Object} meta - Additional metadata
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendPaginated(data, pagination, meta = {}, statusCode = HTTP_STATUS.OK) {
  return (req, res) => {
    const response = paginatedResponse(data, pagination, meta);

    // Set response headers if provided
    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.set(key, value);
      });
      delete response.headers;
    }

    // Add Link header for pagination navigation
    if (pagination && typeof pagination === 'object') {
      const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
      const queryParams = new URLSearchParams(req.query);

      const links = [];

      // Self link
      queryParams.set('page', pagination.page || 1);
      queryParams.set('limit', pagination.limit || 10);
      links.push(`<${baseUrl}?${queryParams.toString()}>; rel="self"`);

      // First page
      queryParams.set('page', 1);
      links.push(`<${baseUrl}?${queryParams.toString()}>; rel="first"`);

      // Last page
      if (pagination.total && pagination.limit) {
        const lastPage = Math.ceil(pagination.total / pagination.limit);
        queryParams.set('page', lastPage);
        links.push(`<${baseUrl}?${queryParams.toString()}>; rel="last"`);
      }

      // Next page
      if (pagination.hasNext) {
        queryParams.set('page', (pagination.page || 1) + 1);
        links.push(`<${baseUrl}?${queryParams.toString()}>; rel="next"`);
      }

      // Previous page
      if (pagination.hasPrev) {
        queryParams.set('page', (pagination.page || 1) - 1);
        links.push(`<${baseUrl}?${queryParams.toString()}>; rel="prev"`);
      }

      res.set('Link', links.join(', '));
    }

    res.status(statusCode).json(response);
  };
}

/**
 * Response Handler Middleware
 * Wraps route handlers to standardize responses automatically
 * Detects the response type and formats accordingly
 */
function responseHandler() {
  return (req, res, next) => {
    // Override res.json to standardize responses
    const originalJson = res.json;

    res.json = function(data) {
      // If response is already standardized, let it pass through
      if (data && typeof data === 'object' && (data.success !== undefined || data.error)) {
        return originalJson.call(this, data);
      }

      // Auto-format based on status code and data structure
      if (res.statusCode >= 400) {
        // Error response
        const statusCode = res.statusCode;
        let errorType = 'INTERNAL_SERVER_ERROR';

        switch (statusCode) {
          case 400:
            errorType = 'VALIDATION_ERROR';
            break;
          case 401:
            errorType = 'AUTHENTICATION_ERROR';
            break;
          case 403:
            errorType = 'AUTHORIZATION_ERROR';
            break;
          case 404:
            errorType = 'RESOURCE_NOT_FOUND';
            break;
          case 409:
            errorType = 'RESOURCE_CONFLICT';
            break;
          case 422:
            errorType = 'VALIDATION_ERROR';
            break;
          case 429:
            errorType = 'RATE_LIMIT_EXCEEDED';
            break;
        }

        const errorResponse = require('../utils/apiResponse').errorResponse(
          errorType,
          data?.message || getStatusMessage(statusCode),
          data?.details || [],
          data?.meta || {}
        );

        return originalJson.call(this, errorResponse);
      } else {
        // Success response
        const successResponse = require('../utils/apiResponse').successResponse(
          data,
          {}
        );

        return originalJson.call(this, successResponse);
      }
    };

    // Add convenience methods for different response types
    res.sendSuccess = (data, meta, statusCode) => {
      const response = successResponse(data, meta);
      res.status(statusCode || HTTP_STATUS.OK).json(response);
    };

    res.sendError = (code, message, details, meta, statusCode) => {
      const response = errorResponse(code, message, details, meta);
      res.status(statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
    };

    res.sendPaginated = (data, pagination, meta, statusCode) => {
      const response = paginatedResponse(data, pagination, meta);

      // Add Link header for pagination
      if (pagination && typeof pagination === 'object') {
        const baseUrl = `${req.protocol}://${req.get('host')}${req.path}`;
        const queryParams = new URLSearchParams(req.query);

        const links = [];

        // Self link
        queryParams.set('page', pagination.page || 1);
        queryParams.set('limit', pagination.limit || 10);
        links.push(`<${baseUrl}?${queryParams.toString()}>; rel="self"`);

        // First page
        queryParams.set('page', 1);
        links.push(`<${baseUrl}?${queryParams.toString()}>; rel="first"`);

        // Last page
        if (pagination.total && pagination.limit) {
          const lastPage = Math.ceil(pagination.total / pagination.limit);
          queryParams.set('page', lastPage);
          links.push(`<${baseUrl}?${queryParams.toString()}>; rel="last"`);
        }

        // Next page
        if (pagination.hasNext) {
          queryParams.set('page', (pagination.page || 1) + 1);
          links.push(`<${baseUrl}?${queryParams.toString()}>; rel="next"`);
        }

        // Previous page
        if (pagination.hasPrev) {
          queryParams.set('page', (pagination.page || 1) - 1);
          links.push(`<${baseUrl}?${queryParams.toString()}>; rel="prev"`);
        }

        res.set('Link', links.join(', '));
      }

      res.status(statusCode || HTTP_STATUS.OK).json(response);
    };

    // Add specific error response methods
    res.sendNotFound = (resource, meta) => {
      const response = notFoundErrorResponse(resource, meta);
      res.status(HTTP_STATUS.NOT_FOUND).json(response);
    };

    res.sendValidationErrors = (errors, meta) => {
      const response = validationErrorResponse(errors, meta);
      res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json(response);
    };

    res.sendUnauthorized = (meta) => {
      const response = unauthorizedErrorResponse(meta);
      res.status(HTTP_STATUS.UNAUTHORIZED).json(response);
    };

    res.sendForbidden = (meta) => {
      const response = forbiddenErrorResponse(meta);
      res.status(HTTP_STATUS.FORBIDDEN).json(response);
    };

    res.sendInternalServerError = (message, meta) => {
      const response = internalServerErrorResponse(message, meta);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(response);
    };

    next();
  };
}

/**
 * Get standard status message for HTTP status codes
 * @param {number} statusCode - HTTP status code
 * @returns {string} Status message
 */
function getStatusMessage(statusCode) {
  const statusMessages = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };

  return statusMessages[statusCode] || 'Unknown Error';
}

/**
 * Async Route Handler Wrapper
 * Wraps async route handlers to catch errors automatically
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped route handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error Handling Middleware
 * Centralized error handling for standardized error responses
 */
function errorHandler() {
  return (err, req, res, next) => {
    console.error('API Error:', err);

    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
      return next(err);
    }

    // Handle different types of errors
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors || {}).map(error => ({
        field: error.path || error.field,
        message: error.message,
        value: error.value
      }));

      return res.sendValidationErrors(details);
    }

    if (err.name === 'CastError') {
      return res.sendError(
        'INVALID_INPUT',
        'Invalid input format',
        [{ field: err.path, message: 'Invalid format', value: err.value }],
        {},
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (err.code === '23505') { // PostgreSQL unique violation
      return res.sendError(
        'RESOURCE_CONFLICT',
        'Resource already exists',
        [{ field: 'unique_constraint', message: 'Resource with these values already exists' }],
        {},
        HTTP_STATUS.CONFLICT
      );
    }

    if (err.code === '23503') { // PostgreSQL foreign key violation
      return res.sendError(
        'VALIDATION_ERROR',
        'Referenced resource does not exist',
        [{ field: 'foreign_key', message: 'Referenced resource not found' }],
        {},
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Default internal server error
    return res.sendInternalServerError(
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      {
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        requestId: res.locals.requestId
      }
    );
  };
}

/**
 * Request ID Middleware
 * Generates unique request IDs for tracking and debugging
 */
function requestId() {
  return (req, res, next) => {
    req.requestId = req.headers['x-request-id'] ||
                   `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    res.locals.requestId = req.requestId;
    res.set('X-Request-ID', req.requestId);
    next();
  };
}

module.exports = {
  // Middleware functions
  responseHandler,
  errorHandler,
  requestId,

  // Response helpers
  sendSuccess,
  sendError,
  sendPaginated,

  // Route handler wrapper
  asyncHandler,

  // Utilities
  getStatusMessage
};