/**
 * Centralized Configuration for Frontend
 * Standardizes API URLs, timeouts, and environment-specific settings
 */

export const CONFIG = {
  // API Configuration
  API_BASE_URL: getApiBaseUrl(),
  API_TIMEOUT: 30000,

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',

  // Authentication
  TOKEN_KEYS: {
    ADMIN_JWT: 'auth-storage',
    CUSTOMER_TOKEN: 'customer_token',
    AUTH_TOKEN: 'auth_token',
    USER_DATA: 'user_data',
    CUSTOMER_DATA: 'customer_data'
  }
}

/**
 * Smart API Base URL resolution
 * Priority: Environment variable -> Development fallback -> Production fallback
 */
function getApiBaseUrl(): string {
  // 1. Check explicit environment variable FIRST (highest priority)
  if (process.env.NEXT_PUBLIC_API_URL) {
    console.log('🔧 Using NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL)
    return process.env.NEXT_PUBLIC_API_URL
  }

  // 2. Server-side development fallback
  if (process.env.NODE_ENV === 'development') {
    console.log('🔧 Using development fallback: relative path')
    return ''
  }

  // 3. Production fallback (change to your actual production domain)
  console.log('🔧 Using production fallback')
  return 'https://your-production-domain.com'
}

/**
 * Validates if API is accessible
 */
export async function validateApiConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    })
    return response.ok
  } catch (error) {
    console.error('API Connection validation failed:', error)
    return false
  }
}

/**
 * Get current API configuration for debugging
 */
export function getApiConfig() {
  return {
    baseURL: CONFIG.API_BASE_URL,
    environment: CONFIG.NODE_ENV,
    isDevelopment: CONFIG.IS_DEVELOPMENT,
    tokenKeys: CONFIG.TOKEN_KEYS
  }
}

// Export for easy access in components
export default CONFIG