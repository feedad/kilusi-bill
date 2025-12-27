const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { query } = require('../../../config/database');

// Simple logger fallback
const logger = {
  info: (msg) => console.log('INFO:', msg),
  error: (msg, err) => console.error('ERROR:', msg, err?.message || err),
  warn: (msg, err) => console.warn('WARN:', msg, err?.message || err)
};

// Note: adminAuth middleware removed for development access

// Store API statistics in memory (untuk demo, nanti bisa dipindah ke Redis)
let apiStats = {
  requests: [],
  errors: [],
  responseTime: [],
  endpoints: new Map(),
  startTime: new Date()
};

// Middleware untuk track API calls
function trackApiCall(req, res, next) {
  const startTime = Date.now();

  // Track endpoint usage
  const endpoint = `${req.method} ${req.route?.path || req.path}`;
  const currentCount = apiStats.endpoints.get(endpoint) || 0;
  apiStats.endpoints.set(endpoint, currentCount + 1);

  // Track response
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const callData = {
      method: req.method,
      path: req.path,
      endpoint: endpoint,
      statusCode: res.statusCode,
      responseTime: responseTime,
      timestamp: new Date(),
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    };

    // Store recent calls (keep last 1000)
    apiStats.requests.push(callData);
    if (apiStats.requests.length > 1000) {
      apiStats.requests = apiStats.requests.slice(-1000);
    }

    // Track errors
    if (res.statusCode >= 400) {
      apiStats.errors.push({
        ...callData,
        error: res.statusMessage,
        stack: req.errorStack
      });
      if (apiStats.errors.length > 500) {
        apiStats.errors = apiStats.errors.slice(-500);
      }
    }

    // Track response time
    apiStats.responseTime.push(responseTime);
    if (apiStats.responseTime.length > 1000) {
      apiStats.responseTime = apiStats.responseTime.slice(-1000);
    }
  });

  next();
}

// Apply tracking middleware to all API routes (ini nanti dipindah ke app.js)
// router.use(trackApiCall);

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const uptime = Math.floor((now - apiStats.startTime) / 1000);

    // Calculate response time stats
    const avgResponseTime = apiStats.responseTime.length > 0
      ? Math.round(apiStats.responseTime.reduce((a, b) => a + b, 0) / apiStats.responseTime.length)
      : 0;

    const maxResponseTime = apiStats.responseTime.length > 0
      ? Math.max(...apiStats.responseTime)
      : 0;

    // Get last hour requests
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const recentRequests = apiStats.requests.filter(req =>
      new Date(req.timestamp) > oneHourAgo
    );

    // Get database status
    let dbStatus = 'unknown';
    try {
      await query('SELECT 1');
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'disconnected';
    }

    // Get FreeRADIUS status
    let freeradiusStatus = { status: 'unknown', message: 'Unable to check' };
    try {
      const { exec } = require('child_process');

      // Check Docker container (try without sudo first, then with sudo)
      freeradiusStatus = await new Promise((resolve) => {
        // Try without sudo first
        exec('docker ps --filter name=kilusi-freeradius --format "{{.Status}}"', (error, stdout) => {
          if (!error && stdout.trim()) {
            const status = stdout.trim();
            if (status.includes('healthy') || status.includes('Up')) {
              resolve({ status: 'connected', message: 'Docker container running' });
            } else if (status.includes('unhealthy')) {
              resolve({ status: 'warning', message: 'Docker container unhealthy' });
            } else {
              resolve({ status: 'connected', message: `Docker: ${status}` });
            }
          } else {
            // Try with sudo
            exec('sudo docker ps --filter name=kilusi-freeradius --format "{{.Status}}"', (err2, stdout2) => {
              if (!err2 && stdout2.trim()) {
                const status = stdout2.trim();
                if (status.includes('healthy') || status.includes('Up')) {
                  resolve({ status: 'connected', message: 'Docker container running' });
                } else if (status.includes('unhealthy')) {
                  resolve({ status: 'warning', message: 'Docker container unhealthy' });
                } else {
                  resolve({ status: 'connected', message: `Docker: ${status}` });
                }
              } else {
                // Fall back to systemctl check
                exec('systemctl is-active freeradius', (err, out) => {
                  const systemctlStatus = out ? out.trim() : '';
                  if (systemctlStatus === 'active') {
                    resolve({ status: 'connected', message: 'FreeRADIUS running (systemd)' });
                  } else if (systemctlStatus === 'activating') {
                    resolve({ status: 'warning', message: 'Restarting...' });
                  } else if (systemctlStatus === 'failed') {
                    resolve({ status: 'error', message: 'Service failed' });
                  } else {
                    resolve({ status: 'disconnected', message: 'Service stopped' });
                  }
                });
              }
            });
          }
        });
      });
    } catch (error) {
      freeradiusStatus = { status: 'unknown', message: 'Check failed' };
    }

    // Get RADIUS DB status
    let radiusDbStatus = { status: 'unknown', message: 'Unable to check' };
    try {
      const radResult = await query("SELECT COUNT(*) as count FROM radcheck");
      radiusDbStatus = {
        status: 'connected',
        message: `${radResult.rows[0]?.count || 0} users`
      };
    } catch (error) {
      radiusDbStatus = { status: 'disconnected', message: 'Tables not found' };
    }

    // Get system info
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    res.json({
      system: {
        uptime: uptime,
        uptimeFormatted: formatUptime(uptime),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        },
        nodeVersion: process.version,
        platform: process.platform
      },
      api: {
        totalRequests: apiStats.requests.length,
        totalErrors: apiStats.errors.length,
        errorRate: apiStats.requests.length > 0
          ? Math.round((apiStats.errors.length / apiStats.requests.length) * 100 * 100) / 100
          : 0,
        avgResponseTime: avgResponseTime,
        maxResponseTime: maxResponseTime,
        recentRequests: recentRequests.length,
        endpoints: Object.fromEntries(apiStats.endpoints)
      },
      services: {
        database: { status: dbStatus, message: dbStatus === 'connected' ? 'PostgreSQL OK' : 'Connection failed' },
        freeradius: freeradiusStatus,
        radiusDb: radiusDbStatus,
        websocket: { status: 'active', message: 'Socket.io running' }
      }
    });

  } catch (error) {
    logger.error('Error getting API management stats:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

// Get recent API calls
router.get('/requests', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status;
    const method = req.query.method;

    let requests = apiStats.requests;

    // Filter by status
    if (status) {
      const statusCode = parseInt(status);
      if (!isNaN(statusCode)) {
        requests = requests.filter(req =>
          Math.floor(req.statusCode / 100) * 100 === Math.floor(statusCode / 100) * 100
        );
      }
    }

    // Filter by method
    if (method) {
      requests = requests.filter(req => req.method === method.toUpperCase());
    }

    // Sort by timestamp (newest first)
    requests.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Paginate
    const paginatedRequests = requests.slice(offset, offset + limit);

    res.json({
      requests: paginatedRequests,
      total: requests.length,
      limit: limit,
      offset: offset
    });

  } catch (error) {
    logger.error('Error getting API requests:', error);
    res.status(500).json({
      error: 'Failed to get requests',
      details: error.message
    });
  }
});

// Get API errors
router.get('/errors', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const errors = apiStats.errors
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({
      errors: errors,
      total: apiStats.errors.length
    });

  } catch (error) {
    logger.error('Error getting API errors:', error);
    res.status(500).json({
      error: 'Failed to get errors',
      details: error.message
    });
  }
});

// Get console logs
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level; // error, warn, info, debug
    const search = req.query.search;

    // Get log file path - use relative path from project root
    const logFile = path.join(__dirname, '../../../logs/combined.log');

    if (!fs.existsSync(logFile)) {
      return res.json({ logs: [], total: 0 });
    }

    // Read log file
    const logContent = fs.readFileSync(logFile, 'utf8');
    const logLines = logContent.split('\n').filter(line => line.trim());

    // Parse log lines - handle the format: "YYYY-MM-DD HH:MM:SS level: message"
    const logs = logLines
      .map(line => {
        try {
          // Parse format like: "2025-11-09 20:07:58 info: ✅ Settings pre-loaded"
          const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (\w+): (.+)$/);
          if (match) {
            return {
              timestamp: new Date(match[1].replace(' ', 'T')), // Parse as local time
              level: match[2].toLowerCase(),
              message: match[3]
            };
          } else {
            // Fallback for other formats
            return {
              timestamp: new Date(),
              level: 'info',
              message: line
            };
          }
        } catch {
          return {
            timestamp: new Date(),
            level: 'info',
            message: line
          };
        }
      })
      .filter(log => log && log.message)
      .reverse(); // Newest first

    // Filter by level
    let filteredLogs = logs;
    if (level && level !== 'all') {
      filteredLogs = logs.filter(log => log.level === level);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      filteredLogs = filteredLogs.filter(log =>
        log.message.toLowerCase().includes(searchLower)
      );
    }

    // Limit results
    const limitedLogs = filteredLogs.slice(0, limit);

    res.json({
      logs: limitedLogs,
      total: filteredLogs.length,
      availableLevels: ['error', 'warn', 'info', 'debug']
    });

  } catch (error) {
    logger.error('Error getting logs:', error);
    res.status(500).json({
      error: 'Failed to get logs',
      details: error.message
    });
  }
});

// Get API endpoints documentation
router.get('/endpoints', (req, res) => {
  try {
    // Scan routes directory untuk get endpoint info
    const routesDir = path.join(__dirname);
    const endpointFiles = fs.readdirSync(routesDir)
      .filter(file => file.endsWith('.js') && file !== 'index.js' && file !== 'api-management.js');

    const endpoints = [];

    endpointFiles.forEach(file => {
      const filePath = path.join(routesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Extract router info (simplified version)
      const routerName = file.replace('.js', '');
      endpoints.push({
        name: routerName,
        file: file,
        path: `/api/v1/${routerName}`,
        description: `${routerName} API endpoints`,
        methods: ['GET', 'POST', 'PUT', 'DELETE'] // Simplified
      });
    });

    res.json({
      endpoints: endpoints.sort((a, b) => a.name.localeCompare(b.name)),
      total: endpoints.length
    });

  } catch (error) {
    logger.error('Error getting endpoints:', error);
    res.status(500).json({
      error: 'Failed to get endpoints',
      details: error.message
    });
  }
});

// Get service status
router.get('/services', async (req, res) => {
  try {
    const services = {};

    // Check Database
    try {
      await query('SELECT 1');
      services.database = {
        status: 'connected',
        message: 'Database connection successful'
      };
    } catch (error) {
      services.database = {
        status: 'disconnected',
        message: error.message
      };
    }

    // Check File System
    try {
      const testFile = path.join(__dirname, '../../tmp-test.txt');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      services.filesystem = {
        status: 'connected',
        message: 'File system access successful'
      };
    } catch (error) {
      services.filesystem = {
        status: 'error',
        message: error.message
      };
    }

    // Memory status
    const memUsage = process.memoryUsage();
    services.memory = {
      status: 'active',
      usage: {
        heap: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
      },
      message: 'Memory usage normal'
    };

    // Uptime
    services.uptime = {
      status: 'active',
      value: process.uptime(),
      message: 'Service running normally'
    };

    // Check FreeRADIUS status
    try {
      const { exec } = require('child_process');
      const radiusStatus = await new Promise((resolve) => {
        exec('systemctl is-active freeradius', (error, stdout) => {
          const status = stdout.trim();
          if (status === 'active') {
            resolve({ status: 'connected', message: 'FreeRADIUS is running' });
          } else {
            resolve({ status: 'disconnected', message: `FreeRADIUS status: ${status || 'not found'}` });
          }
        });
      });
      services.freeradius = radiusStatus;
    } catch (error) {
      services.freeradius = {
        status: 'unknown',
        message: 'Unable to check FreeRADIUS status'
      };
    }

    // Check RADIUS database connection (radcheck table)
    try {
      const radResult = await query("SELECT COUNT(*) as count FROM radcheck");
      services.radiusDb = {
        status: 'connected',
        message: `RADIUS DB connected (${radResult.rows[0]?.count || 0} users)`
      };
    } catch (error) {
      services.radiusDb = {
        status: 'disconnected',
        message: 'RADIUS tables not accessible'
      };
    }

    res.json({
      services: services,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Error checking services:', error);
    res.status(500).json({
      error: 'Failed to check services',
      details: error.message
    });
  }
});

// Clear API statistics
router.post('/clear-stats', (req, res) => {
  try {
    apiStats = {
      requests: [],
      errors: [],
      responseTime: [],
      endpoints: new Map(),
      startTime: new Date()
    };

    res.json({
      message: 'API statistics cleared successfully',
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Error clearing stats:', error);
    res.status(500).json({
      error: 'Failed to clear statistics',
      details: error.message
    });
  }
});

// Test API endpoint - execute requests from dashboard
router.post('/test-endpoint', async (req, res) => {
  try {
    const { method, url, headers, body } = req.body;

    if (!method || !url) {
      return res.status(400).json({
        error: 'Method and URL are required'
      });
    }

    const axios = require('axios');
    const startTime = Date.now();

    // Build request config
    const config = {
      method: method.toUpperCase(),
      url: url.startsWith('http') ? url : `http://localhost:${process.env.PORT || 3000}${url}`,
      headers: headers || {},
      timeout: 30000
    };

    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(config.method) && body) {
      config.data = body;
    }

    try {
      const response = await axios(config);
      const responseTime = Date.now() - startTime;

      res.json({
        success: true,
        request: {
          method: config.method,
          url: config.url,
          headers: config.headers
        },
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
          responseTime: responseTime
        }
      });
    } catch (axiosError) {
      const responseTime = Date.now() - startTime;
      res.json({
        success: false,
        request: {
          method: config.method,
          url: config.url,
          headers: config.headers
        },
        response: {
          status: axiosError.response?.status || 0,
          statusText: axiosError.response?.statusText || axiosError.message,
          headers: axiosError.response?.headers || {},
          data: axiosError.response?.data || null,
          error: axiosError.message,
          responseTime: responseTime
        }
      });
    }

  } catch (error) {
    logger.error('Error testing endpoint:', error);
    res.status(500).json({
      error: 'Failed to test endpoint',
      details: error.message
    });
  }
});

// Get detailed endpoint documentation
router.get('/endpoints/:name', (req, res) => {
  try {
    const { name } = req.params;
    const routesDir = path.join(__dirname);
    const filePath = path.join(routesDir, `${name}.js`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'Endpoint file not found'
      });
    }

    const content = fs.readFileSync(filePath, 'utf8');

    // Parse routes from file content
    const routePatterns = [];
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let match;

    while ((match = routeRegex.exec(content)) !== null) {
      routePatterns.push({
        method: match[1].toUpperCase(),
        path: `/api/v1/${name}${match[2]}`,
        pattern: match[2]
      });
    }

    // Extract JSDoc comments for documentation
    const jsdocRegex = /\/\*\*\s*([\s\S]*?)\*\//g;
    const comments = [];
    while ((match = jsdocRegex.exec(content)) !== null) {
      comments.push(match[1].replace(/\s*\*\s*/g, ' ').trim());
    }

    res.json({
      name: name,
      file: `${name}.js`,
      basePath: `/api/v1/${name}`,
      routes: routePatterns,
      totalRoutes: routePatterns.length,
      documentation: comments.slice(0, 5), // First 5 comments
      fileSize: content.length,
      lastModified: fs.statSync(filePath).mtime
    });

  } catch (error) {
    logger.error('Error getting endpoint details:', error);
    res.status(500).json({
      error: 'Failed to get endpoint details',
      details: error.message
    });
  }
});

// Dashboard authentication endpoint
// Only users with 'superadmin' role can access the API dashboard
// Uses JWT tokens for persistence across backend restarts
router.post('/dashboard-auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    const bcrypt = require('bcrypt');
    const jwt = require('jsonwebtoken');
    const { query: dbQuery, getOne } = require('../../../config/database');

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'kilusi-dashboard-secret-key';

    // Authenticate from users table
    try {
      const user = await getOne(
        'SELECT id, username, email, password, role FROM users WHERE username = $1',
        [username]
      );

      if (user) {
        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
          });
        }

        // Check if user has superadmin role (required for API dashboard)
        if (user.role !== 'superadmin') {
          return res.status(403).json({
            success: false,
            error: 'Access denied. Superadmin role required for API dashboard.'
          });
        }

        // Update last login
        await dbQuery(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );

        // Generate JWT token (survives backend restarts)
        const token = jwt.sign(
          {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            type: 'dashboard'
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        return res.json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          }
        });
      }
    } catch (dbError) {
      logger.warn('users table lookup failed:', dbError.message);
    }

    // Fallback: Check env variables (for backward compatibility during setup)
    const DASHBOARD_USERNAME = process.env.DASHBOARD_USERNAME;
    const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

    if (DASHBOARD_USERNAME && DASHBOARD_PASSWORD &&
      username === DASHBOARD_USERNAME && password === DASHBOARD_PASSWORD) {

      const token = jwt.sign(
        {
          userId: 'env-admin',
          username,
          role: 'superadmin',
          type: 'dashboard'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.json({
        success: true,
        token,
        user: {
          username,
          role: 'superadmin'
        }
      });
    }

    // No valid credentials found
    res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  } catch (error) {
    logger.error('Error in dashboard auth:', error);
    res.status(500).json({
      error: 'Authentication failed',
      details: error.message
    });
  }
});

// Verify dashboard token (JWT based)
router.get('/dashboard-auth/verify', (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'kilusi-dashboard-secret-key';

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Check if it's a dashboard token
      if (decoded.type !== 'dashboard') {
        return res.status(401).json({ valid: false, error: 'Invalid token type' });
      }

      res.json({
        valid: true,
        user: {
          id: decoded.userId,
          username: decoded.username,
          email: decoded.email,
          role: decoded.role
        }
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ valid: false, error: 'Token expired' });
      }
      return res.status(401).json({ valid: false, error: 'Invalid token' });
    }
  } catch (error) {
    res.status(500).json({ valid: false, error: error.message });
  }
});

// Logout
router.post('/dashboard-auth/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      global.dashboardTokens?.delete(token);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// OpenAPI/Swagger spec endpoint
router.get('/openapi', (req, res) => {
  try {
    const { generateOpenAPISpec } = require('../../../config/swagger-generator');
    const spec = generateOpenAPISpec();
    res.json(spec);
  } catch (error) {
    logger.error('Failed to generate OpenAPI spec:', error);
    res.status(500).json({
      error: 'Failed to generate OpenAPI specification',
      details: error.message
    });
  }
});

// Export untuk digunakan di middleware tracking
module.exports = { router, trackApiCall, apiStats };