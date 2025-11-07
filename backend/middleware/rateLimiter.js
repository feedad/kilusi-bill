const rateLimit = require('express-rate-limit');

// General rate limiter
const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.max || 100, // 100 requests default
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip || ((req, res) => {
      // Skip rate limiting for successful requests (optional)
      return res.statusCode < 400;
    }),
    keyGenerator: options.keyGenerator || ((req) => {
      // Use IP address as key by default
      return req.ip;
    })
  });
};

// Specific rate limiters for different endpoints
const limiters = {
  // General API rate limiter
  api: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: 'Too many API requests, please try again later.'
  }),

  // Strict rate limiter for authentication endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true
  }),

  // Rate limiter for admin endpoints
  admin: createRateLimiter({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // 50 requests per 5 minutes
    message: 'Too many admin requests, please try again later.'
  }),

  // Rate limiter for billing operations
  billing: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200, // 200 requests per hour
    message: 'Too many billing operations, please try again later.'
  }),

  // Rate limiter for customer portal
  customer: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 80, // 80 requests per 15 minutes
    message: 'Too many requests, please try again later.'
  }),

  // Rate limiter for SNMP/device operations
  device: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many device operations, please try again later.'
  }),

  // Rate limiter for WhatsApp operations
  whatsapp: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Too many WhatsApp operations, please try again later.'
  }),

  // Very strict rate limiter for password reset
  passwordReset: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per hour
    message: 'Too many password reset attempts, please try again later.'
  })
};

// Middleware to apply rate limiting based on endpoint pattern
const applyRateLimit = (limiterType) => {
  return (req, res, next) => {
    const limiter = limiters[limiterType];
    if (limiter) {
      return limiter(req, res, next);
    }
    next();
  };
};

// Dynamic rate limiter that adjusts based on user role
const dynamicRateLimiter = (req, res, next) => {
  // Different limits based on user role or authentication status
  let maxRequests = 100;
  let windowMs = 15 * 60 * 1000;

  if (req.session && req.session.user) {
    // Authenticated users get more requests
    maxRequests = req.session.isAdmin ? 200 : 150;
  } else {
    // Non-authenticated users get fewer requests
    maxRequests = 50;
  }

  const customLimiter = createRateLimiter({
    windowMs,
    max: maxRequests,
    message: 'Rate limit exceeded based on your user level.'
  });

  customLimiter(req, res, next);
};

// Rate limiter that increases penalty for repeated violations
const progressiveRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => {
    // Use both IP and user ID for more precise tracking
    const userId = req.session?.user?.id || 'anonymous';
    return `${req.ip}:${userId}`;
  },
  handler: (req, res) => {
    // Increase ban time for repeated violations
    const violations = parseInt(req.headers['x-ratelimit-remaining'] || '0');
    let retryAfter = 900; // 15 minutes default

    if (violations < 10) {
      retryAfter = 300; // 5 minutes
    } else if (violations < 25) {
      retryAfter = 900; // 15 minutes
    } else {
      retryAfter = 3600; // 1 hour
    }

    res.setHeader('Retry-After', retryAfter);
    res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Please wait before trying again.',
      retryAfter: retryAfter
    });
  }
});

module.exports = {
  createRateLimiter,
  limiters,
  applyRateLimit,
  dynamicRateLimiter,
  progressiveRateLimiter
};