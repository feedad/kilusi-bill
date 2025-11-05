# Kilusi Bill Frontend

Modern ISP billing and management system built with Next.js 14, TypeScript, and Tailwind CSS.

## 🚀 Features

- **Modern Tech Stack**: Next.js 14 with App Router, TypeScript, Tailwind CSS
- **Component-Based Architecture**: Reusable UI components with Radix UI
- **State Management**: Zustand for global state, React Query for server state
- **Authentication**: JWT-based authentication with role-based access
- **Real-time Updates**: WebSocket integration for live data
- **Responsive Design**: Mobile-first design with dark mode support
- **Type Safety**: Full TypeScript coverage
- **Performance**: Optimized with code splitting and lazy loading

## 📋 Prerequisites

- Node.js 18.0 or higher
- npm or yarn
- PostgreSQL database (backend)
- Existing Kilusi Bill backend API

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kilusi-bill-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` with your configuration:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3000
   NEXT_PUBLIC_APP_NAME=Kilusi Bill
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3001](http://localhost:3001)

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes
│   │   ├── login/
│   │   └── register/
│   ├── admin/             # Admin routes
│   │   ├── dashboard/
│   │   ├── customers/
│   │   ├── billing/
│   │   └── settings/
│   ├── customer/          # Customer portal
│   ├── technician/        # Technician interface
│   └── api/               # API routes
├── components/            # Reusable components
│   ├── ui/               # Base UI components
│   ├── forms/            # Form components
│   ├── tables/           # Table components
│   ├── charts/           # Chart components
│   └── layout/           # Layout components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions
├── store/                # State management
├── types/                # TypeScript definitions
└── styles/               # Global styles
```

## 🎨 Design System

### Colors
- **Primary**: Blue (#3b82f6)
- **Success**: Green (#10b981)
- **Warning**: Orange (#f59e0b)
- **Error**: Red (#ef4444)

### Components
- **Button**: Multiple variants and sizes
- **Input**: Form inputs with validation
- **Modal**: Dialog components
- **Table**: Data tables with sorting and filtering
- **Card**: Content containers

## 🔐 Authentication

The application supports multiple user roles:

- **Admin**: Full system access
- **Technician**: Limited access to relevant features
- **Customer**: Self-service portal access

### Login Credentials (Demo)
- **Admin**: admin / password
- **Technician**: tech / password
- **Customer**: customer / password

## 📊 Features Overview

### Admin Dashboard
- Customer management
- Billing and invoicing
- Package management
- Real-time monitoring
- System settings

### Customer Portal
- View invoices and payments
- Update profile information
- Check internet usage
- Submit support tickets

### Technician Interface
- Field service management
- Installation job tracking
- Trouble ticket handling

## 🔧 Development

### Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint code
npm run lint

# Type checking
npm run type-check

# Run tests
npm test

# Watch tests
npm run test:watch
```

### Code Quality

- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **TypeScript**: Type safety
- **Jest**: Unit and integration testing

## 🚀 Deployment

### Production Build

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm start
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables

```env
# API Configuration
NEXT_PUBLIC_API_URL=https://your-api-domain.com

# Application
NEXT_PUBLIC_APP_NAME=Kilusi Bill
NEXT_PUBLIC_APP_VERSION=1.0.0

# Analytics (optional)
NEXT_PUBLIC_GA_ID=your-ga-id

# Feature Flags
NEXT_PUBLIC_DARK_MODE=true
NEXT_PUBLIC_PWA_SUPPORT=true
```

## 🔌 API Integration

The frontend integrates with the Kilusi Bill backend API:

### Authentication Endpoints
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/profile` - User profile

### Customer Endpoints
- `GET /api/v1/customers` - List customers
- `POST /api/v1/customers` - Create customer
- `PUT /api/v1/customers/:id` - Update customer
- `DELETE /api/v1/customers/:id` - Delete customer

### Billing Endpoints
- `GET /api/v1/billing/invoices` - List invoices
- `POST /api/v1/billing/invoices/generate` - Generate invoices
- `GET /api/v1/billing/payments` - List payments

## 🧪 Testing

### Unit Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### End-to-End Tests
```bash
# Run E2E tests
npm run test:e2e
```

## 📈 Performance

### Optimization Features
- **Code Splitting**: Automatic route-based splitting
- **Tree Shaking**: Remove unused code
- **Image Optimization**: Next.js Image component
- **Caching**: Multi-level caching strategy
- **Bundle Analysis**: Webpack Bundle Analyzer

### Performance Metrics
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1
- **First Input Delay**: < 100ms

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔄 Migration from EJS

This frontend replaces the original EJS templates. For migration details, see:

- [Migration Guide](./MIGRATION_GUIDE.md)
- [API Documentation](./API_DOCS.md)
- [Component Library](./COMPONENT_LIB.md)

## 🗺️ Roadmap

### Phase 1: Foundation ✅
- [x] Project setup
- [x] Design system
- [x] Basic components
- [x] Authentication

### Phase 2: Core Features 🚧
- [ ] Customer management
- [ ] Billing system
- [ ] Real-time monitoring
- [ ] Admin dashboard

### Phase 3: Advanced Features 📋
- [ ] Analytics and reporting
- [ ] Advanced settings
- [ ] API documentation
- [ ] Performance optimization

### Phase 4: Enhancement 📋
- [ ] PWA features
- [ ] Mobile app
- [ ] Integration testing
- [ ] Documentation

---

Built with ❤️ by [Kilusi Digital Network](https://kilusi.id)