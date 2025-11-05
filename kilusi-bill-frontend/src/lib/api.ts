import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
})

// Request interceptor for authentication
api.interceptors.request.use(
  (config) => {
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
    profile: '/auth/profile',
    refresh: '/auth/refresh',
  },

  // Customers
  customers: {
    list: '/customers',
    create: '/customers',
    update: (id: string) => `/customers/${id}`,
    delete: (id: string) => `/customers/${id}`,
    detail: (id: string) => `/customers/${id}`,
    search: '/customers/search',
  },

  // Billing
  billing: {
    invoices: '/billing/invoices',
    payments: '/billing/payments',
    packages: '/billing/packages',
    generateInvoice: '/billing/invoices/generate',
    markPaid: (id: string) => `/billing/invoices/${id}/pay`,
  },

  // Admin
  admin: {
    dashboard: '/admin/dashboard',
    settings: '/admin/settings',
    users: '/admin/users',
    activity: '/admin/activity',
  },

  // Real-time
  realtime: {
    sessions: '/realtime/sessions',
    stats: '/realtime/stats',
    notifications: '/realtime/notifications',
  },
}

export default api