# Changelog

All notable changes to Kilusi Bill ISP Billing System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-12-26

### 🎉 Initial Release - Modern ISP Billing & Management System

This is the first public release of Kilusi Bill, a comprehensive ISP billing system with FreeRADIUS integration and multi-NAS SNMP monitoring.

### Core Features

#### 💼 Customer Management
- Split architecture (customers, services, technical_details, network_infrastructure)
- Multi-service support per customer
- Regional management with geographical organization
- Customer portal with token-based authentication
- Referral system with automated commission tracking

#### 📊 Billing & Invoicing
- Multiple billing cycles (profile-based, fixed day, monthly)
- Automated invoice generation
- Multi-payment gateway integration (Tripay)
- Discount management (percentage & fixed amount)
- Tax calculation (PPh 23, PPN)
- Payment history & financial reports

####  🔐 FreeRADIUS Integration
- Native `nas` table compatible with FreeRADIUS standard
- Multi-NAS support out of the box
- PPPoE authentication (radcheck/radreply)
- Group-based policies (radgroupcheck/radgroupreply)
- Real-time accounting (radacct)
- Session tracking & connection monitoring
- Post-authentication logging

#### 📡 Multi-NAS SNMP Monitoring
- **20+ monitoring metrics** per NAS device
- CPU & Memory usage tracking
- Interface traffic statistics (real-time)
- Active connections monitoring
- System uptime & health status
- SNMPv2c & SNMPv3 support
- Automatic health checks (configurable interval)
- Batch monitoring for efficiency
- Support for MikroTik, Cisco, and other network devices

#### 🌐 Network Infrastructure
- ODP (Optical Distribution Point) management
- Cable routing & port management
- Signal quality monitoring
- Installation tracking
- Network topology visualization

#### 📱 Notifications & Communication
- WhatsApp Cloud API integration
- Broadcast messaging system
- Automated payment reminders
- Installation notifications
- Service status alerts

#### 📈 Dashboard & Reports
- Real-time monitoring dashboard
- Financial reports (revenue, expenses)
- Customer analytics
- Service statistics
- SNMP monitoring dashboard
- Network performance metrics

### Installation & Deployment

#### Automated Installation
- `install.sh` - Interactive automated installer with dependency auto-install
- Support for **5 deployment scenarios**:
  1. **Docker DB + RADIUS**, Native Backend + Frontend
  2. **DB + RADIUS Only** (Multi-server with 3 sub-options: DB only, RADIUS only, or both)
  3. **Docker DB + RADIUS + Backend**, Native Frontend
  4. **All Native** (full server installation)
  5. **All Docker** (full containerized deployment)
- Auto-detection of OS (Ubuntu, Debian, CentOS, RHEL, Fedora)
- Automatic dependency installation (Docker, Node.js, PostgreSQL client, Git)
- Environment file generation
- Database initialization
- FreeRADIUS configuration
- Admin user creation
- Systemd service creation

#### Docker Support
- `docker-compose.yml` - Flexible container orchestration
- PostgreSQL container with auto-initialization
- FreeRADIUS container with SQL module
- Backend & Frontend containers
- Health checks for all services
- Volume persistence for data
- Network isolation

### Database

#### Master Schema
- `scripts/master-schema.sql` - Complete unified database schema
- 25+ tables for comprehensive ISP management
- All FreeRADIUS standard tables included
- Functions & triggers for automation
- Comprehensive indexes for performance
- Default seed data included
- Documentation comments on tables and columns

#### Migration Support
- `backend/migrations/001_rename_nas_servers_to_nas.sql`
- Safe migration for future schema updates
- Idempotent design (can run multiple times)
- Preserves all data and relationships

### Technology Stack

**Backend:**
- Node.js 18+ with Express.js
- PostgreSQL 13+ database
- FreeRADIUS 3.x integration
- SNMP monitoring (net-snmp)
- RESTful API architecture

**Frontend:**
- Next.js 14 with App Router
- React 18
- TailwindCSS for styling
- Shadcn/ui component library
- Responsive design

**Infrastructure:**
- Docker & Docker Compose support
- Nginx reverse proxy ready
- PM2 process management
- Systemd service integration
- Multi-server deployment support

### Configuration

- `.env.docker.example` - Comprehensive environment template
- All deployment scenarios documented
- Security settings included
- Optional integrations (WhatsApp, Tripay, SNMP)
- Database connection configuration
- FreeRADIUS integration settings

### Documentation

- **README.md** - Project overview & quick start
- **README-SETUP.md** - Detailed installation guide
- **CHANGELOG.md** - Version history (this file)
- **LICENSE** - MIT License
- **docs/README.md** - Documentation index
- Inline code documentation
- Environment configuration examples

### Security

- Secure environment variable handling
- Automatic session secret generation
- Database credential protection
- SSL/TLS support ready
- Role-based access control
- Token-based authentication for customer portal

### Compatibility

- **OS**: Ubuntu 20.04+, Debian 11+, CentOS 8+, RHEL 8+, Fedora 34+
- **Node.js**: v18.0.0+
- **PostgreSQL**: v13+
- **FreeRADIUS**: v3.0+
- **Docker** (optional): v20.10+
- **Docker Compose** (optional): v2.0+

### Known Limitations

- Frontend deployment not yet included in automated installer
- Manual docker-compose.yml editing required for some hybrid scenarios
- Remote server setup for separate-server mode requires manual configuration

### Future Roadmap

- Frontend automated deployment
- Web-based installation wizard
- Advanced reporting features
- Multi-tenancy support
- Mobile app (iOS/Android)
- API v2 with GraphQL

---

## Support

For support and questions:
- 📧 Email: support@kilusi-bill.local
- 📖 Documentation: [docs.kilusi-bill.local](https://docs.kilusi-bill.local)
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/kilusi-bill/issues)

---

## Contributors

- **Kilusi Development Team**

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
