# API Migration Strategy: EJS Backend → Next.js Frontend

## Overview
This document outlines the API migration strategy to connect the new Next.js frontend with the existing Node.js/EJS backend.

## Current Backend Architecture
```
kilusi-bill/
├── app.js                 # Main Express server
├── routes/               # Route handlers
│   ├── adminAuth.js
│   ├── adminBilling.js
│   ├── adminPelangganOnline.js
│   └── adminRadius.js
├── config/               # Business logic modules
│   ├── mikrotik.js
│   ├── radius-sync.js
│   └── billing.js
└── settings.json         # Configuration
```

## Migration Phases

### Phase 1: API Endpoints Enhancement (Week 1-2)

#### 1.1 Add API Routes Structure
```javascript
// routes/api/v1/index.js
const express = require('express');
const router = express.Router();

// Authentication routes
router.use('/auth', require('./auth'));

// Customer management
router.use('/customers', require('./customers'));

// Billing and invoices
router.use('/billing', require('./billing'));

// Admin functions
router.use('/admin', require('./admin'));

// Real-time data
router.use('/realtime', require('./realtime'));

module.exports = router;
```

#### 1.2 Standardize API Response Format
```javascript
// middleware/apiResponse.js
const apiResponse = (req, res, next) => {
  res.apiSuccess = (data, message = 'Success', meta = {}) => {
    res.json({
      success: true,
      data,
      message,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    });
  };

  res.apiError = (message, statusCode = 500, error = null) => {
    res.status(statusCode).json({
      success: false,
      message,
      error,
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  };

  next();
};

module.exports = apiResponse;
```

#### 1.3 Authentication API Routes
```javascript
// routes/api/v1/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate admin credentials from settings
    const adminUsername = getSetting('admin_username');
    const adminPassword = getSetting('admin_password');

    if (username === adminUsername && password === adminPassword) {
      const token = jwt.sign(
        {
          username,
          role: 'admin',
          name: 'Administrator'
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.apiSuccess({
        user: {
          username,
          role: 'admin',
          name: 'Administrator'
        },
        token
      }, 'Login successful');
    }

    // Check database users (customers, technicians)
    const user = await User.findOne({ where: { username } });
    if (user && await bcrypt.compare(password, user.password)) {
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.apiSuccess({
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        },
        token
      }, 'Login successful');
    }

    res.apiError('Invalid credentials', 401);
  } catch (error) {
    res.apiError('Login failed', 500, error.message);
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  // Implement token blacklisting if needed
  res.apiSuccess(null, 'Logout successful');
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    res.apiSuccess(user);
  } catch (error) {
    res.apiError('Failed to fetch profile', 500, error.message);
  }
});

module.exports = router;
```

### Phase 2: Customer Management API (Week 2-3)

#### 2.1 Customer CRUD Operations
```javascript
// routes/api/v1/customers.js
const express = require('express');
const router = express.Router();
const { Customer, Package } = require('../../models');
const { authenticateToken, requireRole } = require('../../middleware/auth');

// Get all customers with pagination and filtering
router.get('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, status, packageId } = req.query;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (status) where.status = status;
    if (packageId) where.packageId = packageId;

    const { count, rows } = await Customer.findAndCountAll({
      where,
      include: [{ model: Package, as: 'package' }],
      limit: parseInt(pageSize),
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.apiSuccess(rows, 'Customers retrieved successfully', {
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(count / pageSize)
    });
  } catch (error) {
    res.apiError('Failed to fetch customers', 500, error.message);
  }
});

// Create new customer
router.post('/', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const customerData = req.body;

    // Validate required fields
    const requiredFields = ['name', 'username'];
    for (const field of requiredFields) {
      if (!customerData[field]) {
        return res.apiError(`${field} is required`, 400);
      }
    }

    // Check if username already exists
    const existingCustomer = await Customer.findOne({
      where: { username: customerData.username }
    });
    if (existingCustomer) {
      return res.apiError('Username already exists', 400);
    }

    const customer = await Customer.create(customerData);

    // Trigger RADIUS sync if PPPoE credentials provided
    if (customer.pppoeUsername && customer.pppoePassword) {
      const radiusSync = require('../../config/radius-sync');
      await radiusSync.syncCustomerToRadius(customer);
    }

    res.apiSuccess(customer, 'Customer created successfully', 201);
  } catch (error) {
    res.apiError('Failed to create customer', 500, error.message);
  }
});

// Update customer
router.put('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.apiError('Customer not found', 404);
    }

    const updatedCustomer = await customer.update(req.body);

    // Trigger RADIUS sync if PPPoE credentials changed
    if (req.body.pppoeUsername || req.body.pppoePassword) {
      const radiusSync = require('../../config/radius-sync');
      await radiusSync.syncCustomerToRadius(updatedCustomer);
    }

    res.apiSuccess(updatedCustomer, 'Customer updated successfully');
  } catch (error) {
    res.apiError('Failed to update customer', 500, error.message);
  }
});

// Delete customer
router.delete('/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const customer = await Customer.findByPk(req.params.id);
    if (!customer) {
      return res.apiError('Customer not found', 404);
    }

    await customer.destroy();
    res.apiSuccess(null, 'Customer deleted successfully');
  } catch (error) {
    res.apiError('Failed to delete customer', 500, error.message);
  }
});

module.exports = router;
```

### Phase 3: Billing API (Week 3-4)

#### 3.1 Invoice Management
```javascript
// routes/api/v1/billing.js
const express = require('express');
const router = express.Router();
const { Invoice, Customer, Package, Payment } = require('../../models');
const { authenticateToken, requireRole } = require('../../middleware/auth');

// Get invoices with filtering
router.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status, customerId, month, year } = req.query;
    const offset = (page - 1) * pageSize;

    const where = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      where.createdAt = {
        [Op.between]: [startDate, endDate]
      };
    }

    const { count, rows } = await Invoice.findAndCountAll({
      where,
      include: [
        { model: Customer, as: 'customer' },
        { model: Package, as: 'package' }
      ],
      limit: parseInt(pageSize),
      offset,
      order: [['createdAt', 'DESC']]
    });

    res.apiSuccess(rows, 'Invoices retrieved successfully', {
      total: count,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(count / pageSize)
    });
  } catch (error) {
    res.apiError('Failed to fetch invoices', 500, error.message);
  }
});

// Generate monthly invoices
router.post('/invoices/generate', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { month, year } = req.body;

    // Get all active customers
    const customers = await Customer.findAll({
      where: { status: 'active' },
      include: [{ model: Package, as: 'package' }]
    });

    const invoices = [];
    for (const customer of customers) {
      if (!customer.package) continue;

      const existingInvoice = await Invoice.findOne({
        where: {
          customerId: customer.id,
          status: 'unpaid',
          createdAt: {
            [Op.gte]: new Date(year, month - 1, 1),
            [Op.lt]: new Date(year, month, 1)
          }
        }
      });

      if (!existingInvoice) {
        const invoice = await Invoice.create({
          customerId: customer.id,
          packageId: customer.packageId,
          amount: customer.package.price,
          dueDate: new Date(year, month, getSetting('billing_due_date')),
          description: `${customer.package.name} - ${month}/${year}`
        });
        invoices.push(invoice);
      }
    }

    res.apiSuccess(invoices, `${invoices.length} invoices generated successfully`);
  } catch (error) {
    res.apiError('Failed to generate invoices', 500, error.message);
  }
});

module.exports = router;
```

### Phase 4: Real-time API (Week 4)

#### 4.1 WebSocket Integration
```javascript
// routes/api/v1/realtime.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

// Get active sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const mikrotik = require('../../config/mikrotik');
    const sessions = await mikrotik.getActiveSessions();

    res.apiSuccess(sessions, 'Active sessions retrieved successfully');
  } catch (error) {
    res.apiError('Failed to fetch active sessions', 500, error.message);
  }
});

// Get system statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [customerCount, activeSessions, monthlyRevenue] = await Promise.all([
      Customer.count(),
      mikrotik.getActiveSessionCount(),
      Invoice.sum('amount', {
        where: {
          status: 'paid',
          createdAt: {
            [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ]);

    const stats = {
      totalCustomers: customerCount,
      activeSessions,
      monthlyRevenue: monthlyRevenue || 0,
      serverUptime: process.uptime(),
      lastUpdated: new Date()
    };

    res.apiSuccess(stats, 'System statistics retrieved successfully');
  } catch (error) {
    res.apiError('Failed to fetch statistics', 500, error.message);
  }
});

module.exports = router;
```

## Backend Integration Steps

### Step 1: Install Required Dependencies
```bash
npm install jsonwebtoken bcryptjs cors helmet express-rate-limit
npm install sequelize # if not already installed
npm install --save-dev @types/jsonwebtoken
```

### Step 2: Add Middleware
```javascript
// middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.apiError('Access token required', 401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.apiError('Invalid token', 403);
    }
    req.user = user;
    next();
  });
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.apiError('Insufficient permissions', 403);
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole };
```

### Step 3: Update Main App.js
```javascript
// Add to app.js
const apiResponse = require('./middleware/apiResponse');
const { authenticateToken } = require('./middleware/auth');

// Apply middleware
app.use('/api/v1', apiResponse);
app.use('/api/v1', require('./routes/api/v1'));

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
  credentials: true
}));
```

## Frontend API Integration

### Step 1: Update API Client
```typescript
// src/lib/api.ts updates
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});
```

### Step 2: Create API Services
```typescript
// src/services/api.ts
import { api } from '@/lib/api';
import { Customer, Invoice, DashboardStats } from '@/types';

export const customerService = {
  getCustomers: async (params?: any) => {
    const response = await api.get('/customers', { params });
    return response.data;
  },

  createCustomer: async (data: Partial<Customer>) => {
    const response = await api.post('/customers', data);
    return response.data;
  },

  updateCustomer: async (id: string, data: Partial<Customer>) => {
    const response = await api.put(`/customers/${id}`, data);
    return response.data;
  },

  deleteCustomer: async (id: string) => {
    const response = await api.delete(`/customers/${id}`);
    return response.data;
  }
};

export const billingService = {
  getInvoices: async (params?: any) => {
    const response = await api.get('/billing/invoices', { params });
    return response.data;
  },

  generateInvoices: async (data: { month: number; year: number }) => {
    const response = await api.post('/billing/invoices/generate', data);
    return response.data;
  }
};

export const dashboardService = {
  getStats: async () => {
    const response = await api.get('/realtime/stats');
    return response.data;
  },

  getActiveSessions: async () => {
    const response = await api.get('/realtime/sessions');
    return response.data;
  }
};
```

## Testing Strategy

### Phase 1: API Testing
```javascript
// tests/api/auth.test.js
const request = require('supertest');
const app = require('../../app');

describe('Authentication API', () => {
  test('POST /api/v1/auth/login - successful admin login', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: 'admin',
        password: 'password'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toBeDefined();
  });
});
```

### Phase 2: Integration Testing
```typescript
// src/tests/api.test.ts
import { customerService } from '@/services/api';

describe('Customer API', () => {
  test('should fetch customers', async () => {
    const result = await customerService.getCustomers();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
```

## Migration Timeline

- **Week 1**: API structure setup and authentication
- **Week 2**: Customer management API
- **Week 3**: Billing and invoice API
- **Week 4**: Real-time API and WebSocket integration
- **Week 5**: Testing and documentation
- **Week 6**: Frontend integration and deployment

## Security Considerations

1. **JWT Token Management**
   - Implement token refresh mechanism
   - Set appropriate token expiration
   - Use secure HTTP-only cookies for production

2. **Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');

   const apiLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });

   app.use('/api/v1', apiLimiter);
   ```

3. **Input Validation**
   - Validate all incoming data
   - Sanitize inputs to prevent XSS
   - Use parameterized queries for database operations

4. **CORS Configuration**
   - Configure appropriate CORS headers
   - Only allow trusted origins in production

This migration strategy ensures a smooth transition from EJS to Next.js while maintaining all existing functionality and improving the overall architecture.