import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // Increased timeout to 30 seconds
  withCredentials: true,
})

// Request interceptor for authentication
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage - JWT only for OTP login
    try {
      let token = null
      let tokenSource = ''

      // For customer portal routes, prioritize customer_token over auth-storage
      const isCustomerRoute = config.url?.includes('/api/v1/customer') ||
        config.url?.includes('/api/v1/support/') ||
        config.url?.includes('/api/v1/billing/customer/') ||
        config.url?.includes('/api/v1/billing/my-') ||
        config.url?.includes('/api/v1/customer-billing/')

      if (isCustomerRoute) {
        // Customer portal: prioritize customer_token
        token = localStorage.getItem('customer_token')
        tokenSource = 'customer_token'

        // Fallback to auth-storage if customer_token not found
        if (!token) {
          const authStorage = localStorage.getItem('auth-storage')
          if (authStorage) {
            const parsed = JSON.parse(authStorage)
            token = parsed.state?.token
            tokenSource = 'auth-storage (fallback)'
          }
        }
      } else {
        // Admin portal: use auth-storage
        const authStorage = localStorage.getItem('auth-storage')
        if (authStorage) {
          const parsed = JSON.parse(authStorage)
          token = parsed.state?.token
          tokenSource = 'auth-storage (JWT)'
        }
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log('🔑 API Request:', config.method?.toUpperCase(), config.url, `- JWT Token found (${tokenSource})`)
        console.log('🔑 Request Headers:', config.headers)
      } else {
        // Only show warning for protected routes that require authentication
        const protectedRoutes = ['/api/v1/customers/', '/api/v1/billing/', '/api/v1/admin/', '/api/v1/dashboard/', '/api/v1/support/']
        const isProtectedRoute = protectedRoutes.some(route => config.url?.includes(route)) && !config.url?.includes('/api/v1/billing/customer/')

        if (isProtectedRoute) {
          console.warn('⚠️ API Request:', config.method?.toUpperCase(), config.url, '- No JWT token found for protected route')
        }
      }
    } catch (error) {
      console.error('Error parsing auth storage:', error)
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear all auth storage
      console.warn('Unauthorized - clearing all auth storage and redirecting to login')

      try {
        localStorage.removeItem('auth-storage')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_data')
        localStorage.removeItem('customer_token')
        localStorage.removeItem('customer_data')
      } catch (e) {
        console.error('Error clearing localStorage:', e)
      }

      // Emit custom event for auth error to trigger redirect
      if (typeof window !== 'undefined') {
        console.log('🔑 401 Error detected, emitting auth:expired event')
        window.dispatchEvent(new CustomEvent('auth:expired', {
          detail: { message: 'Authentication expired', status: 401 }
        }))
      }
    }
    return Promise.reject(error)
  }
)

// API endpoints
export { API_BASE_URL }

export const endpoints = {
  // Authentication
  auth: {
    login: '/api/v1/auth/login',
    logout: '/api/v1/auth/logout',
    verify: '/api/v1/auth/verify',
  },

  // Regions
  regions: {
    list: '/api/v1/regions',
    create: '/api/v1/regions',
    update: (id: string) => `/api/v1/regions/${id}`,
    delete: (id: string) => `/api/v1/regions/${id}`,
  },

  // Customers
  customers: {
    list: '/api/v1/customers',
    create: '/api/v1/customers',
    update: (id: string) => `/api/v1/customers/${id}`,
    delete: (id: string) => `/api/v1/customers/${id}`,
    detail: (id: string) => `/api/v1/customers/${id}`,
    nextSequence: '/api/v1/customers/next-sequence',
  },

  // Packages
  packages: {
    list: '/api/v1/packages',
    create: '/api/v1/packages',
    update: (id: string) => `/api/v1/packages/${id}`,
    delete: (id: string) => `/api/v1/packages/${id}`,
    detail: (id: string) => `/api/v1/packages/${id}`,
  },

  // Billing
  billing: {
    invoices: '/api/v1/billing/invoices',
    payments: '/api/v1/billing/payments',
    packages: '/api/v1/billing/packages',
    invoiceDetail: (id: string) => `/api/v1/billing/invoices/${id}`,
    createInvoice: '/api/v1/billing/invoices',
    recordPayment: '/api/v1/billing/payments',
  },

  // Dashboard
  dashboard: {
    stats: '/api/v1/dashboard/stats',
    recentActivities: '/api/v1/dashboard/recent-activities',
    revenueChart: '/api/v1/dashboard/revenue-chart',
    monthlyRevenue: '/api/v1/dashboard/monthly-revenue',
    customerStatus: '/api/v1/dashboard/customer-status',
    topCustomers: '/api/v1/dashboard/top-customers',
  },

  // Settings
  settings: {
    all: '/api/v1/settings',
    update: '/api/v1/settings',
    get: (key: string) => `/api/v1/settings/${key}`,
  },

  // Real-time
  realtime: {
    traffic: '/api/v1/realtime/traffic',
    interfaces: '/api/v1/realtime/interfaces',
    onlineCustomers: '/api/v1/realtime/online-customers',
    systemStats: '/api/v1/realtime/system-stats',
  },

  // GenieACS
  genieacs: {
    devices: '/api/v1/genieacs/devices',
    device: (id: string) => `/api/v1/genieacs/devices/${id}`,
    action: '/api/v1/genieacs/action',
    edit: '/api/v1/genieacs/edit',
    reboot: (id: string) => `/api/v1/genieacs/devices/${id}/reboot`,
    resync: (id: string) => `/api/v1/genieacs/devices/${id}/resync`,
    config: (id: string) => `/api/v1/genieacs/devices/${id}/config`,
    diagnostics: (id: string) => `/api/v1/genieacs/devices/${id}/diagnostics`,
    wifiConfig: (id: string) => `/api/v1/genieacs/devices/${id}/wifi-config`,
    wifiInfo: (id: string) => `/api/v1/genieacs/devices/${id}/wifi-info`,
    performance: (id: string) => `/api/v1/genieacs/devices/${id}/performance`,
    locations: '/api/v1/genieacs/locations',
    stats: '/api/v1/genieacs/stats',
  },

  // RADIUS
  radius: {
    nas: '/api/v1/radius/nas',
    nasDetail: (id: string) => `/api/v1/radius/nas/${id}`,
    testNas: (id: string) => `/api/v1/radius/nas/${id}/test`,
    snmpStats: (id: string) => `/api/v1/radius/nas/${id}/snmp-stats`,
    connectionStatus: (username: string) => `/api/v1/radius/connection-status/${username}`,
  },

  // Technician
  technician: {
    systemStatus: '/api/v1/technician/system-status',
    alerts: '/api/v1/technician/alerts',
    acknowledgeAlert: (id: number) => `/api/v1/technician/alerts/${id}/acknowledge`,
    performance: (timeframe?: string) => `/api/v1/technician/performance${timeframe ? `?timeframe=${timeframe}` : ''}`,
    activities: '/api/v1/technician/activities',
  },

  // ODP (Optical Distribution Point)
  odp: {
    list: '/api/v1/odp',
    create: '/api/v1/odp',
    update: (id: string) => `/api/v1/odp/${id}`,
    delete: (id: string) => `/api/v1/odp/${id}`,
    detail: (id: string) => `/api/v1/odp/${id}`,
  },

  // WhatsApp
  whatsapp: {
    templates: '/api/v1/whatsapp/templates',
    template: (id: string) => `/api/v1/whatsapp/templates/${id}`,
    createTemplate: '/api/v1/whatsapp/templates',
    updateTemplate: (id: string) => `/api/v1/whatsapp/templates/${id}`,
    deleteTemplate: (id: string) => `/api/v1/whatsapp/templates/${id}`,
    testTemplate: (id: string) => `/api/v1/whatsapp/templates/${id}/test`,
    schedule: {
      messages: '/api/v1/whatsapp/schedule/messages',
      message: '/api/v1/whatsapp/schedule/message',
      cancelMessage: (id: string) => `/api/v1/whatsapp/schedule/messages/${id}`,
    },
    send: '/api/v1/whatsapp/send/broadcast',
    status: '/api/v1/whatsapp/status',
  },

  // Customer Settings
  customerSettings: {
    defaults: '/api/v1/customer-settings/defaults',
    default: (fieldName: string) => `/api/v1/customer-settings/defaults/${fieldName}`,
  },

  // Installation Fees
  installationFees: {
    list: '/api/v1/installation-fees',
    create: '/api/v1/installation-fees',
    update: (id: string) => `/api/v1/installation-fees/${id}`,
    delete: (id: string) => `/api/v1/installation-fees/${id}`,
    calculate: (billingType: string) => `/api/v1/installation-fees/calculate/${billingType}`,
    getByType: (billingType: string) => `/api/v1/installation-fees/${billingType}`,
  },

  // Accounting
  accounting: {
    categories: '/api/v1/accounting/categories',
    transactions: '/api/v1/accounting/transactions',
    summary: '/api/v1/accounting/summary',
    profitLossReport: '/api/v1/accounting/report/profit-loss',
  },

  // Auto Expenses
  autoExpenses: {
    settings: '/api/v1/auto-expenses/settings',
    recurring: '/api/v1/auto-expenses/recurring',
    triggerTechnicianFee: '/api/v1/auto-expenses/trigger-technician-fee',
    triggerMarketingFee: '/api/v1/auto-expenses/trigger-marketing-fee',
  },

  // Broadcast Messages
  broadcast: {
    // Public endpoints (no authentication required)
    public: {
      active: '/api/v1/broadcast-public/messages/active',
    },
    // Admin endpoints (authentication required)
    messages: '/api/v1/broadcast/messages',
    message: (id: string) => `/api/v1/broadcast/messages/${id}`,
    create: '/api/v1/broadcast/messages',
    update: (id: string) => `/api/v1/broadcast/messages/${id}`,
    delete: (id: string) => `/api/v1/broadcast/messages/${id}`,
    schedule: '/api/v1/broadcast/messages/schedule',
    // Maintenance endpoints
    maintenance: {
      schedule: '/api/v1/broadcast/maintenance/schedule',
      scheduled: '/api/v1/broadcast/maintenance/scheduled',
      upcoming: '/api/v1/broadcast/maintenance/upcoming',
    },
  },

  // Customer Portal (specific endpoints for customer functionality)
  customerPortal: {
    profile: '/api/v1/customer/profile',
    billing: '/api/v1/customer/billing',
    usage: '/api/v1/customer/usage',
    tickets: '/api/v1/customer/tickets',
    createTicket: '/api/v1/customer/tickets',
    notifications: '/api/v1/customer/notifications',
    markNotificationRead: (id: string) => `/api/v1/customer/notifications/${id}/read`,
  },
}

export default api