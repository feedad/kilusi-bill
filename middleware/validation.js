const { body, param, query, validationResult } = require('express-validator');

// Common validation rules
const authValidation = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const customerLoginValidation = [
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required')
    .matches(/^0\d{8,13}$/).withMessage('Invalid phone format (use 08xxxx)')
];

const customerCreateValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').optional().isEmail().withMessage('Invalid email').normalizeEmail(),
  body('phone').matches(/^0\d{8,13}$/).withMessage('Invalid phone format'),
  body('package_id').optional().isInt().withMessage('Invalid package ID')
];

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If client expects JSON, return JSON; else use flash-style behavior
    const wantsJson = req.headers['content-type'] === 'application/json' || (req.headers['accept'] || '').includes('application/json');
    if (wantsJson) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    // Fallback: attach errors to request for controller/view to handle
    req.validationErrors = errors.array();
  }
  return next();
};

module.exports = {
  authValidation,
  customerLoginValidation,
  customerCreateValidation,
  validate
};
