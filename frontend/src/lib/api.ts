import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1` : 'http://localhost:3000/api/v1'

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
    // Get token from localStorage (authStore persist key)
    try {
      const authStorage = localStorage.getItem('auth-storage')
      if (authStorage) {
        const parsed = JSON.parse(authStorage)
        const token = parsed.state?.token
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
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
      // Clear auth storage tapi JANGAN auto-redirect
      // Biarkan komponen React yang menghandle redirect
      console.warn('Unauthorized - clearing auth storage')

      try {
        localStorage.removeItem('auth-storage')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('user_data')
      } catch (e) {
        console.error('Error clearing localStorage:', e)
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
    login: '/auth/login',
    logout: '/auth/logout',
    verify: '/auth/verify',
  },

  // Regions
  regions: {
    list: '/regions',
    create: '/regions',
    update: (id: string) => `/regions/${id}`,
    delete: (id: string) => `/regions/${id}`,
  },

  // Customers
  customers: {
    list: '/customers',
    create: '/customers',
    update: (id: string) => `/customers/${id}`,
    delete: (id: string) => `/customers/${id}`,
    detail: (id: string) => `/customers/${id}`,
    nextSequence: '/customers/next-sequence',
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
    recordPayment: '/billing/payments',
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
    connectionStatus: (username: string) => `/radius/connection-status/${username}`,
  },

  // Technician
  technician: {
    systemStatus: '/technician/system-status',
    alerts: '/technician/alerts',
    acknowledgeAlert: (id: number) => `/technician/alerts/${id}/acknowledge`,
    performance: (timeframe?: string) => `/technician/performance${timeframe ? `?timeframe=${timeframe}` : ''}`,
    activities: '/technician/activities',
  },

  // ODP (Optical Distribution Point)
  odp: {
    list: '/odp',
    create: '/odp',
    update: (id: string) => `/odp/${id}`,
    delete: (id: string) => `/odp/${id}`,
    detail: (id: string) => `/odp/${id}`,
  },

  // WhatsApp
  whatsapp: {
    templates: '/whatsapp/templates',
    template: (id: string) => `/whatsapp/templates/${id}`,
    createTemplate: '/whatsapp/templates',
    updateTemplate: (id: string) => `/whatsapp/templates/${id}`,
    deleteTemplate: (id: string) => `/whatsapp/templates/${id}`,
    testTemplate: (id: string) => `/whatsapp/templates/${id}/test`,
    schedule: {
      messages: '/whatsapp/schedule/messages',
      message: '/whatsapp/schedule/message',
      cancelMessage: (id: string) => `/whatsapp/schedule/messages/${id}`,
    },
    send: '/whatsapp/send/broadcast',
    status: '/whatsapp/status',
  },

  // Customer Settings
  customerSettings: {
    defaults: '/customer-settings/defaults',
    default: (fieldName: string) => `/customer-settings/defaults/${fieldName}`,
  },

  // Installation Fees
  installationFees: {
    list: '/installation-fees',
    create: '/installation-fees',
    update: (id: string) => `/installation-fees/${id}`,
    delete: (id: string) => `/installation-fees/${id}`,
    calculate: (billingType: string) => `/installation-fees/calculate/${billingType}`,
    getByType: (billingType: string) => `/installation-fees/${billingType}`,
  },

  // Accounting
  accounting: {
    categories: '/accounting/categories',
    transactions: '/accounting/transactions',
    summary: '/accounting/summary',
    profitLossReport: '/accounting/report/profit-loss',
  },

  // Auto Expenses
  autoExpenses: {
    settings: '/auto-expenses/settings',
    recurring: '/auto-expenses/recurring',
    triggerTechnicianFee: '/auto-expenses/trigger-technician-fee',
    triggerMarketingFee: '/auto-expenses/trigger-marketing-fee',
  },
}

export default api