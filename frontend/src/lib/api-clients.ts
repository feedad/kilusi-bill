/**
 * Standardized API Clients
 * Separates admin and customer API clients with proper authentication
 */

import axios from 'axios'
import { CONFIG } from './config'

// ============= ADMIN API CLIENT =============
// For JWT-based authentication (admin panel)

export const adminApi = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: CONFIG.API_TIMEOUT,
  withCredentials: false, // Changed to false to prevent CORS issues
})

// Admin JWT interceptor
adminApi.interceptors.request.use(
  (config) => {
    try {
      console.log('🌐 Admin API Request:', config.method?.toUpperCase(), config.baseURL + config.url)

      // Only add auth header for non-auth endpoints
      const isAuthEndpoint = config.url?.includes('/auth/login') ||
        config.url?.includes('/auth/refresh')

      if (!isAuthEndpoint) {
        const authStorage = localStorage.getItem(CONFIG.TOKEN_KEYS.ADMIN_JWT)
        if (authStorage) {
          const parsed = JSON.parse(authStorage)
          const token = parsed.state?.token
          if (token) {
            config.headers.Authorization = `Bearer ${token}`
            console.log('🔐 Admin API Auth Request:', config.method?.toUpperCase(), config.url)
          }
        }
      } else {
        console.log('🔐 Admin API Auth Request (no token):', config.method?.toUpperCase(), config.url)
      }
    } catch (error) {
      console.error('Error parsing admin auth storage:', error)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Admin response interceptor
adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('⚠️ Admin token expired - clearing auth')
      // Clear admin auth storage
      localStorage.removeItem(CONFIG.TOKEN_KEYS.ADMIN_JWT)
      localStorage.removeItem(CONFIG.TOKEN_KEYS.AUTH_TOKEN)
      localStorage.removeItem(CONFIG.TOKEN_KEYS.USER_DATA)

      // Redirect to login if in browser
      if (typeof window !== 'undefined') {
        window.location.href = '/admin/login'
      }
    }
    return Promise.reject(error)
  }
)

// ============= CUSTOMER API CLIENT =============
// For token-based authentication (customer portal)

export const customerApi = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: CONFIG.API_TIMEOUT,
  withCredentials: false, // JWT tokens in headers, no cookies needed
})

// Customer token interceptor
customerApi.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem(CONFIG.TOKEN_KEYS.CUSTOMER_TOKEN)
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        console.log('👤 Customer API Request:', config.method?.toUpperCase(), config.url)
      }
    } catch (error) {
      console.error('Error getting customer token:', error)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Customer response interceptor
customerApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('⚠️ Customer token expired - clearing auth')
      // Clear customer auth storage
      localStorage.removeItem(CONFIG.TOKEN_KEYS.CUSTOMER_TOKEN)
      localStorage.removeItem(CONFIG.TOKEN_KEYS.CUSTOMER_DATA)

      // Redirect to customer login if in browser
      if (typeof window !== 'undefined') {
        window.location.href = '/customer/login'
      }
    }
    return Promise.reject(error)
  }
)

// ============= PUBLIC API CLIENT =============
// For endpoints that don't require authentication

export const publicApi = axios.create({
  baseURL: CONFIG.API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: CONFIG.API_TIMEOUT,
  withCredentials: false, // No credentials for public endpoints
})

// Public request interceptor (no auth headers)
publicApi.interceptors.request.use(
  (config) => {
    console.log('🌐 Public API Request:', config.method?.toUpperCase(), config.url)
    return config
  },
  (error) => Promise.reject(error)
)

// ============= UTILITY FUNCTIONS =============

/**
 * Determine which API client to use based on user type
 */
export function getApiClient(userType: 'admin' | 'customer' | 'public' = 'public') {
  switch (userType) {
    case 'admin':
      return adminApi
    case 'customer':
      return customerApi
    default:
      return publicApi
  }
}

/**
 * Check if user is authenticated (admin or customer)
 */
export function isAuthenticated(userType: 'admin' | 'customer'): boolean {
  switch (userType) {
    case 'admin':
      try {
        const authStorage = localStorage.getItem(CONFIG.TOKEN_KEYS.ADMIN_JWT)
        const parsed = authStorage ? JSON.parse(authStorage) : null
        return !!(parsed?.state?.token && parsed?.state?.isAuthenticated)
      } catch {
        return false
      }
    case 'customer':
      return !!localStorage.getItem(CONFIG.TOKEN_KEYS.CUSTOMER_TOKEN)
    default:
      return false
  }
}

/**
 * Get current user type based on available tokens
 */
export function getCurrentUserType(): 'admin' | 'customer' | 'guest' {
  if (isAuthenticated('admin')) return 'admin'
  if (isAuthenticated('customer')) return 'customer'
  return 'guest'
}

/**
 * Centralized error handler
 */
export function handleApiError(error: any, customMessage?: string): string {
  if (error?.response?.data?.message) {
    return error.response.data.message
  }

  if (error?.response?.status) {
    const status = error.response.status
    switch (status) {
      case 401:
        return 'Authentication required. Please log in.'
      case 403:
        return 'You do not have permission to access this resource.'
      case 404:
        return 'The requested resource was not found.'
      case 500:
        return 'Server error. Please try again later.'
      default:
        return `Request failed with status ${status}.`
    }
  }

  if (error?.message) {
    return error.message
  }

  return customMessage || 'An unexpected error occurred.'
}

// ============= API ENDPOINTS =============
// Centralized endpoint definitions for better maintainability

export const endpoints = {
  // Admin endpoints
  admin: {
    auth: {
      login: '/api/v1/auth/login',
      logout: '/api/v1/auth/logout',
      refresh: '/api/v1/auth/refresh',
      profile: '/api/v1/auth/profile',
    },
    odp: {
      list: '/api/v1/odp',
      create: '/api/v1/odp',
      update: '/api/v1/odp/:id',
      delete: '/api/v1/odp/:id',
      stats: '/api/v1/odp/stats',
    },
    customers: '/api/v1/customers',
    billing: '/api/v1/billing',
    packages: '/api/v1/packages',
    regions: '/api/v1/regions',
    dashboard: '/api/v1/dashboard',
    whatsapp: '/api/v1/whatsapp',
    radius: '/api/v1/radius',
    genieacs: '/api/v1/genieacs',
    tokens: '/api/v1/tokens',
    settings: '/api/v1/settings',
    monitoring: {
      stats: '/api/v1/monitoring/stats',
      monitors: '/api/v1/monitoring/monitors',
    },
    technician: {
      dashboard: '/api/v1/technician/dashboard',
      online: '/api/v1/technician/online-customers',
    },
  },
  // Customer endpoints
  customer: {
    auth: {
      login: '/api/v1/customer-auth-nextjs/login',
      logout: '/api/v1/customer-auth-nextjs/logout',
      register: '/api/v1/customer-auth-nextjs/register',
      profile: '/api/v1/customer-auth-nextjs/get-customer-data',
      updateProfile: '/api/v1/customer-auth-nextjs/update-profile',
    },
    billing: '/api/v1/customer-billing',
    invoices: '/api/v1/customer-invoices',
    tickets: '/api/v1/support-tickets',
    devices: '/api/v1/customer-devices',
    usage: '/api/v1/customer-usage',
  },
  // Public endpoints
  public: {
    health: '/health',
    packages: '/api/v1/public/packages',
    regions: '/api/v1/public/regions',
    register: '/api/v1/customer-auth-nextjs/register',
  }
}

// Export for backward compatibility (legacy)
export { adminApi as api } from './api-clients'