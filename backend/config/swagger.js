const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

// Load OpenAPI specification
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));

// Swagger options
const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "Kilusi Bill API Docs"
};

module.exports = {
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(swaggerDocument, options)
};
