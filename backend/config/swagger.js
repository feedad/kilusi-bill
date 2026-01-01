const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const fs = require('fs');
const path = require('path');

// Load OpenAPI specification
const swaggerPath = path.join(__dirname, '../docs/openapi.yaml');
let swaggerDocument;

try {
  if (fs.existsSync(swaggerPath)) {
    swaggerDocument = YAML.load(swaggerPath);
  } else {
    // Create a minimal default swagger document
    swaggerDocument = {
      openapi: '3.0.0',
      info: {
        title: 'Kilusi Bill API',
        version: '1.0.0',
        description: 'ISP Billing & Management System API'
      },
      paths: {}
    };
  }
} catch (error) {
  console.warn('Warning: Could not load swagger document:', error.message);
  // Fallback to minimal document
  swaggerDocument = {
    openapi: '3.0.0',
    info: {
      title: 'Kilusi Bill API',
      version: '1.0.0',
      description: 'ISP Billing & Management System API'
    },
    paths: {}
  };
}

// Swagger options
const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Kilusi Bill API Docs"
};

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocument, options)
};
