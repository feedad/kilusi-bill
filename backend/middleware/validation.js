const { body, param, query, validationResult } = require('express-validator');
const mongoSanitize = require('mongo-sanitize');

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize all request body, query, and params
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        // Use mongo-sanitize to prevent NoSQL injection
        sanitized[key] = mongoSanitize(obj[key].trim());
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = sanitizeObject(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    });
    return sanitized;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// XSS Protection
const xssProtection = (req, res, next) => {
  if (req.body) {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi
    ];

    const sanitizeString = (str) => {
      if (typeof str !== 'string') return str;
      xssPatterns.forEach(pattern => {
        str = str.replace(pattern, '');
      });
      return str;
    };

    const sanitizeObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (obj instanceof Array) return obj.map(sanitizeObject);
      const sanitized = {};
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          sanitized[key] = sanitizeString(obj[key]);
        } else if (typeof obj[key] === 'object') {
          sanitized[key] = sanitizeObject(obj[key]);
        } else {
          sanitized[key] = obj[key];
        }
      });
      return sanitized;
    };

    req.body = sanitizeObject(req.body);
  }
  next();
};

// Enhanced validation rules
const authValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscore, and hyphen'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase, one lowercase, and one number')
];

// Admin login validation - more lenient to allow default credentials
const adminAuthValidation = [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username can only contain letters, numbers, underscore, and hyphen'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 3, max: 100 }).withMessage('Password must be 3-100 characters')
];

const customerLoginValidation = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^0\d{8,13}$/).withMessage('Invalid phone format (use 08xxxx)')
    .isLength({ min: 10, max: 14 }).withMessage('Phone number must be 10-14 digits')
];

const customerCreateValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
    .matches(/^[a-zA-Z\s.'-]+$/).withMessage('Name contains invalid characters'),
  body('email')
    .optional()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('phone')
    .matches(/^0\d{8,13}$/).withMessage('Invalid phone format')
    .isLength({ min: 10, max: 14 }).withMessage('Phone number must be 10-14 digits'),
  body('package_id')
    .optional()
    .isInt({ min: 1 }).withMessage('Invalid package ID'),
  body('address')
    .optional()
    .isLength({ max: 500 }).withMessage('Address too long'),
  body('notes')
    .optional()
    .isLength({ max: 1000 }).withMessage('Notes too long')
];

// Device validation
const deviceValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Device name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Device name must be 2-100 characters'),
  body('host')
    .isIP({ version: 4 }).withMessage('Valid IP address required')
    .isLength({ min: 7, max: 15 }).withMessage('Invalid IP address format'),
  body('community')
    .optional()
    .isLength({ min: 1, max: 50 }).withMessage('SNMP community must be 1-50 characters'),
  body('port')
    .optional()
    .isInt({ min: 1, max: 65535 }).withMessage('Port must be 1-65535')
];

// Location validation
const locationValidation = [
  body('lat')
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  body('lng')
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  body('deviceId')
    .trim()
    .notEmpty().withMessage('Device ID is required')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Invalid device ID format'),
  body('address')
    .optional()
    .isLength({ max: 500 }).withMessage('Address too long')
];

// Invoice validation
const invoiceValidation = [
  body('customer_id')
    .isInt({ min: 1 }).withMessage('Valid customer ID required'),
  body('amount')
    .isFloat({ min: 0 }).withMessage('Amount must be positive'),
  body('due_date')
    .isISO8601().withMessage('Valid due date required'),
  body('description')
    .optional()
    .isLength({ max: 500 }).withMessage('Description too long')
];

// Package validation
const packageValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Package name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Package name must be 2-100 characters'),
  body('price')
    .isFloat({ min: 0 }).withMessage('Price must be positive'),
  body('speed')
    .trim()
    .notEmpty().withMessage('Speed is required')
    .matches(/^\d+\s*(Mbps|Gbps|Kbps)$/i).withMessage('Invalid speed format (e.g., 10 Mbps)'),
  body('description')
    .optional()
    .isLength({ max: 1000 }).withMessage('Description too long')
];

// Validation middleware with enhanced error handling
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const wantsJson = req.headers['content-type'] === 'application/json' ||
                     (req.headers['accept'] || '').includes('application/json') ||
                     req.xhr;

    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));

    if (wantsJson) {
      return res.status(400).json({
        success: false,
        errors: formattedErrors,
        message: 'Validation failed'
      });
    }

    // For web views, attach errors and continue
    req.validationErrors = formattedErrors;
  }
  return next();
};

// Async validation wrapper
const validateAsync = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    validate(req, res, next);
  };
};

module.exports = {
  sanitizeInput,
  xssProtection,
  authValidation,
  adminAuthValidation,
  customerLoginValidation,
  customerCreateValidation,
  deviceValidation,
  locationValidation,
  invoiceValidation,
  packageValidation,
  validate,
  validateAsync
};
