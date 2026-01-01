/**
 * OpenAPI/Swagger Spec Generator
 * Generates OpenAPI 3.0 specification from Express routes
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { getSetting } = require('./settingsManager');

/**
 * Generate OpenAPI specification from route files
 */
function generateOpenAPISpec() {
    const spec = {
        openapi: '3.0.0',
        info: {
            title: 'Kilusi Bill API',
            description: 'RESTful API for ISP Billing Management System',
            version: '1.0.0',
            contact: {
                name: 'Kilusi Support',
                email: 'support@kilusi.com'
            }
        },
        servers: [
            {
                url: `http://localhost:${getSetting('port', 3000)}`,
                description: 'Development server'
            }
        ],
        tags: [],
        paths: {},
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: false },
                        message: { type: 'string' },
                        error: { type: 'string' }
                    }
                },
                Success: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        data: { type: 'object' },
                        meta: { type: 'object' }
                    }
                }
            }
        }
    };

    // Define API endpoints manually (since dynamic parsing is complex)
    const apiEndpoints = {
        '/api/v1/health': {
            get: {
                tags: ['System'],
                summary: 'Health Check',
                description: 'Check if the API is running',
                responses: {
                    '200': { description: 'API is healthy' }
                }
            }
        },
        '/api/v1/auth/login': {
            post: {
                tags: ['Authentication'],
                summary: 'Admin Login',
                description: 'Authenticate admin user and get JWT token',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string', example: 'superadmin' },
                                    password: { type: 'string', example: 'admin123' }
                                },
                                required: ['username', 'password']
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Login successful, returns JWT token' },
                    '401': { description: 'Invalid credentials' }
                }
            }
        },
        '/api/v1/customers': {
            get: {
                tags: ['Customers'],
                summary: 'List Customers',
                description: 'Get list of all customers with pagination',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
                    { name: 'search', in: 'query', schema: { type: 'string' } },
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'suspended'] } }
                ],
                responses: {
                    '200': { description: 'List of customers' },
                    '401': { description: 'Unauthorized' }
                }
            },
            post: {
                tags: ['Customers'],
                summary: 'Create Customer',
                description: 'Create a new customer',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    phone: { type: 'string' },
                                    address: { type: 'string' },
                                    package_id: { type: 'integer' },
                                    pppoe_username: { type: 'string' },
                                    pppoe_password: { type: 'string' }
                                },
                                required: ['name', 'phone']
                            }
                        }
                    }
                },
                responses: {
                    '201': { description: 'Customer created' },
                    '400': { description: 'Validation error' }
                }
            }
        },
        '/api/v1/customers/{id}': {
            get: {
                tags: ['Customers'],
                summary: 'Get Customer',
                description: 'Get customer by ID',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': { description: 'Customer details' },
                    '404': { description: 'Customer not found' }
                }
            },
            put: {
                tags: ['Customers'],
                summary: 'Update Customer',
                description: 'Update customer by ID',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': { description: 'Customer updated' },
                    '404': { description: 'Customer not found' }
                }
            },
            delete: {
                tags: ['Customers'],
                summary: 'Delete Customer',
                description: 'Delete customer by ID',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: {
                    '200': { description: 'Customer deleted' },
                    '404': { description: 'Customer not found' }
                }
            }
        },
        '/api/v1/packages': {
            get: {
                tags: ['Packages'],
                summary: 'List Packages',
                description: 'Get list of all internet packages',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': { description: 'List of packages' }
                }
            }
        },
        '/api/v1/invoices': {
            get: {
                tags: ['Billing'],
                summary: 'List Invoices',
                description: 'Get list of all invoices',
                security: [{ bearerAuth: [] }],
                parameters: [
                    { name: 'status', in: 'query', schema: { type: 'string', enum: ['paid', 'unpaid', 'overdue'] } },
                    { name: 'customer_id', in: 'query', schema: { type: 'string' } }
                ],
                responses: {
                    '200': { description: 'List of invoices' }
                }
            }
        },
        '/api/v1/dashboard/stats': {
            get: {
                tags: ['Dashboard'],
                summary: 'Dashboard Statistics',
                description: 'Get dashboard statistics including customer counts, revenue, etc.',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': { description: 'Dashboard statistics' }
                }
            }
        },
        '/api/v1/api-management/stats': {
            get: {
                tags: ['API Management'],
                summary: 'API Statistics',
                description: 'Get API usage statistics',
                responses: {
                    '200': { description: 'API statistics' }
                }
            }
        },
        '/api/v1/api-management/logs': {
            get: {
                tags: ['API Management'],
                summary: 'Get Logs',
                description: 'Get application logs',
                parameters: [
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
                    { name: 'level', in: 'query', schema: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] } }
                ],
                responses: {
                    '200': { description: 'Log entries' }
                }
            }
        },
        '/api/v1/api-management/endpoints': {
            get: {
                tags: ['API Management'],
                summary: 'List API Endpoints',
                description: 'Get list of all available API endpoints',
                responses: {
                    '200': { description: 'List of endpoints' }
                }
            }
        },
        '/api/v1/api-management/test-endpoint': {
            post: {
                tags: ['API Management'],
                summary: 'Test API Endpoint',
                description: 'Execute a test request to any API endpoint',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
                                    url: { type: 'string' },
                                    headers: { type: 'object' },
                                    body: { type: 'object' }
                                },
                                required: ['method', 'url']
                            }
                        }
                    }
                },
                responses: {
                    '200': { description: 'Test result' }
                }
            }
        },
        '/api/v1/admins': {
            get: {
                tags: ['Admin Users'],
                summary: 'List Admin Users',
                description: 'Get list of all admin users',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': { description: 'List of admins' }
                }
            },
            post: {
                tags: ['Admin Users'],
                summary: 'Create Admin User',
                description: 'Create a new admin user',
                security: [{ bearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    username: { type: 'string' },
                                    password: { type: 'string' },
                                    role: { type: 'string', enum: ['superadmin', 'administrator', 'technician', 'finance', 'operator'] }
                                },
                                required: ['username', 'password']
                            }
                        }
                    }
                },
                responses: {
                    '201': { description: 'Admin created' }
                }
            }
        }
    };

    // Add endpoints to spec
    spec.paths = apiEndpoints;

    // Extract unique tags
    const tags = new Set();
    Object.values(apiEndpoints).forEach(methods => {
        Object.values(methods).forEach(endpoint => {
            if (endpoint.tags) {
                endpoint.tags.forEach(tag => tags.add(tag));
            }
        });
    });

    spec.tags = Array.from(tags).map(tag => ({ name: tag }));

    return spec;
}

/**
 * Save OpenAPI spec to file
 */
function saveOpenAPISpec() {
    const spec = generateOpenAPISpec();
    const outputPath = path.join(__dirname, '../public/api-docs/openapi.json');

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
    logger.info(`OpenAPI spec saved to ${outputPath}`);

    return spec;
}

module.exports = {
    generateOpenAPISpec,
    saveOpenAPISpec
};
