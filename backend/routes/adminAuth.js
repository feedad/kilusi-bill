const express = require('express');
const router = express.Router();
const { getSetting } = require('../config/settingsManager');
const rateLimit = require('express-rate-limit');
const { adminAuthValidation, validate } = require('../middleware/validation');

// Rate limiter khusus untuk POST /admin/login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.',
  keyGenerator: (req) => req.ip
});

// Middleware cek login admin
function adminAuth(req, res, next) {
  console.log('=== AdminAuth middleware called ===');
  console.log('Session:', req.session);
  console.log('Session ID:', req.sessionID);
  console.log('IsAdmin:', req.session && req.session.isAdmin);
  
  if (req.session && req.session.isAdmin) {
    console.log('Admin authenticated, proceeding to next middleware');
    next();
  } else {
    console.log('Admin not authenticated, redirecting to login');
    res.redirect('/admin/login');
  }
}

// GET: Halaman login admin
router.get('/login', (req, res) => {
  res.render('adminLogin', { error: null });
});

// POST: Proses login admin
router.post('/login', loginLimiter, adminAuthValidation, validate, async (req, res) => {
  // Handle validation errors for form submit (non-JSON)
  if (req.validationErrors && req.validationErrors.length) {
    const firstError = req.validationErrors[0]?.msg || 'Input tidak valid';
    return res.render('adminLogin', { error: firstError });
  }
  const { username, password } = req.body;
  const adminUsername = getSetting('admin_username', 'admin');
  const adminPassword = getSetting('admin_password', 'admin');

  // Autentikasi sederhana (plain, tanpa hash)
  if (username === adminUsername && password === adminPassword) {
    req.session.isAdmin = true;
    req.session.adminUser = username;
    // For API calls, return JSON instead of redirecting
    if (req.headers['content-type'] === 'application/json' || req.headers['accept'] === 'application/json') {
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.redirect('/admin/dashboard');
    }
  } else {
    // For API calls, return JSON instead of rendering
    if (req.headers['content-type'] === 'application/json' || req.headers['accept'] === 'application/json') {
      res.status(401).json({ success: false, message: 'Username atau password salah.' });
    } else {
      res.render('adminLogin', { error: 'Username atau password salah.' });
    }
  }
});

// GET: Logout admin
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = { router, adminAuth };