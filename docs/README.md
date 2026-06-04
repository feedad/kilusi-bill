# Kilusi Bill Documentation

Welcome to Kilusi Bill documentation. This folder contains essential public documentation for the project.

## 📚 Available Documentation

### Getting Started
- [Installation Guide](../README-SETUP.md) - Complete installation instructions
- [Quick Start](../README.md#quick-start) - Get up and running quickly

### Core Documentation
- **[Product Requirements Document (PRD)](product/PRD.md)** - Complete product specification including:
  - Executive summary and product overview
  - Target users and user roles
  - Core features and functional requirements
  - Non-functional requirements
  - Integration requirements
  - User stories and success metrics
  - Product roadmap

- **[Technical Specification (TechSpec)](technical/TechSpec.md)** - Comprehensive technical documentation including:
  - System architecture and design patterns
  - Technology stack (backend, frontend, infrastructure)
  - Complete database schema with all tables
  - API specifications with examples
  - Frontend and backend architecture
  - Security specifications
  - Deployment architecture
  - Performance considerations
  - Monitoring and logging
  - Development guidelines

- **[Application Flow Document](flows/ApplicationFlow.md)** - Detailed operational flows including:
  - User authentication flows (admin and customer)
  - Customer registration flows
  - Service activation and modification flows
  - Billing and payment flows (automated and manual)
  - RADIUS authentication flows
  - SNMP monitoring flows
  - WhatsApp notification flows
  - Support ticket flows
  - Installation scheduling and execution flows
  - Data synchronization flows
  - System startup and error handling flows

### Deployment
- See [Docker Compose](../docker-compose.yml) for container deployment
- See [Installation Script](../install.sh) for automated setup
- Review [Environment Template](../.env.docker.example) for configuration

### Database
- [Master Schema](../scripts/master-schema.sql) - Complete database schema
- [Migration Script](../backend/migrations/001_rename_nas_servers_to_nas.sql) - Upgrade existing installations

### Configuration
- [FreeRADIUS SQL Module](../freeradius/config/mods-available/sql) - RADIUS database configuration
- [Environment Example](../.env.docker.example) - Configuration template

## 📖 Documentation Structure

```
docs/
├── product/
│   └── PRD.md              # Product Requirements Document
├── technical/
│   └── TechSpec.md         # Technical Specification
├── flows/
│   └── ApplicationFlow.md  # Application Flow Diagrams
└── README.md               # This file
```

## 📖 Additional Resources

### Project Information
- [README](../README.md) - Main project documentation
- [Changelog](../CHANGELOG.md) - Version history
- [License](../LICENSE) - MIT License

### Support
For questions and support:
- Open an issue on GitHub
- Check the README for contact information

## 🔒 Internal Documentation

Development notes, planning documents, and internal documentation are maintained separately and not included in the public repository for security and clarity.
