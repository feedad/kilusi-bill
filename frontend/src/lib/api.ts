import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: true,
})

// Request interceptor for authentication
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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
      // Clear token and redirect to login
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user_data')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// API endpoints
export const endpoints = {
  // Authentication
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    verify: '/auth/verify',
  },

  // Customers
  customers: {
    list: '/customers',
    create: '/customers',
    update: (id: string) => `/customers/${id}`,
    delete: (id: string) => `/customers/${id}`,
    detail: (id: string) => `/customers/${id}`,
  },

  // Packages
  packages: {
    list: '/packages',
    create: '/packages',
    update: (id: string) => `/packages/${id}`,
    delete: (id: string) => `/packages/${id}`,
    detail: (id: string) => `/packages/${id}`,
  },

  // Billing
  billing: {
    invoices: '/billing/invoices',
    payments: '/billing/payments',
    packages: '/billing/packages',
    invoiceDetail: (id: string) => `/billing/invoices/${id}`,
    createInvoice: '/billing/invoices',
  },

  // Dashboard
  dashboard: {
    stats: '/dashboard/stats',
    recentActivities: '/dashboard/recent-activities',
    revenueChart: '/dashboard/revenue-chart',
    monthlyRevenue: '/dashboard/monthly-revenue',
    customerStatus: '/dashboard/customer-status',
    topCustomers: '/dashboard/top-customers',
  },

  // Settings
  settings: {
    all: '/settings',
    update: '/settings',
    get: (key: string) => `/settings/${key}`,
  },

  // Real-time
  realtime: {
    traffic: '/realtime/traffic',
    interfaces: '/realtime/interfaces',
    onlineCustomers: '/realtime/online-customers',
    systemStats: '/realtime/system-stats',
  },

  // GenieACS
  genieacs: {
    devices: '/genieacs/devices',
    device: (id: string) => `/genieacs/devices/${id}`,
    action: '/genieacs/action',
    edit: '/genieacs/edit',
    reboot: (id: string) => `/genieacs/devices/${id}/reboot`,
    resync: (id: string) => `/genieacs/devices/${id}/resync`,
    config: (id: string) => `/genieacs/devices/${id}/config`,
    diagnostics: (id: string) => `/genieacs/devices/${id}/diagnostics`,
    wifiConfig: (id: string) => `/genieacs/devices/${id}/wifi-config`,
    wifiInfo: (id: string) => `/genieacs/devices/${id}/wifi-info`,
    performance: (id: string) => `/genieacs/devices/${id}/performance`,
    locations: '/genieacs/locations',
    stats: '/genieacs/stats',
  },

  // RADIUS
  radius: {
    nas: '/radius/nas',
    nasDetail: (id: string) => `/radius/nas/${id}`,
    testNas: (id: string) => `/radius/nas/${id}/test`,
    snmpStats: (id: string) => `/radius/nas/${id}/snmp-stats`,
  },

  // Technician
  technician: {
    systemStatus: '/technician/system-status',
    alerts: '/technician/alerts',
    acknowledgeAlert: (id: number) => `/technician/alerts/${id}/acknowledge`,
    performance: (timeframe?: string) => `/technician/performance${timeframe ? `?timeframe=${timeframe}` : ''}`,
    activities: '/technician/activities',
  },
}

export default api