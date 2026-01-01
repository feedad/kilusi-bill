/**
 * Customer Authentication Utilities
 * Handles token-based and phone-based authentication
 */

export interface Customer {
  id: number
  name: string
  phone: string
  username?: string
  email?: string
  status: 'active' | 'inactive' | 'suspended'
  package_name?: string
  package_price?: number
  ssid?: string
  password?: string
  customer_id?: string
  accounts?: Customer[] // Linked accounts for multi-service
}

export interface AuthState {
  isAuthenticated: boolean
  customer: Customer | null
  token: string | null
  loading: boolean
  error: string | null
}

export interface TokenValidation {
  valid: boolean
  customer?: Customer
  error?: string
}

class CustomerAuth {
  private static readonly TOKEN_KEY = 'customer_token'
  private static readonly CUSTOMER_KEY = 'customer_data'
  private static readonly ACCOUNTS_KEY = 'customer_accounts'
  private static readonly API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

  /**
   * Validate token and authenticate customer
   */
  static async validateToken(token: string): Promise<TokenValidation> {
    console.log('🔍 Auth Library: validateToken called with:', token.substring(0, 20) + '...')
    console.log('🌐 API_BASE:', this.API_BASE)

    try {
      // First try to validate as session token via get-customer-data endpoint
      console.log('📡 Trying session token validation...')
      try {
        const customerDataUrl = `${this.API_BASE}/api/v1/customer-auth-nextjs/get-customer-data`
        const customerResponse = await fetch(customerDataUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })

        if (customerResponse.ok) {
          const customerData = await customerResponse.json()
          console.log('✅ Auth Library: Session token valid')
          if (customerData.success && customerData.data && customerData.data.customer) {
            return {
              valid: true,
              customer: customerData.data.customer
            }
          }
        }
      } catch (sessionError) {
        console.log('📡 Session token validation failed, trying login token...')
      }

      // If session validation fails, try login token validation
      const url = `${this.API_BASE}/api/v1/customer-auth-nextjs/login-with-token`
      console.log('📡 Making login token request to:', url)

      // Create AbortController for timeout handling
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ token }),
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        console.log('📡 Login token response status:', response.status)
        const data = await response.json()
        console.log('📡 Login token response data:', data)

        if (data.success && data.data) {
          console.log('✅ Auth Library: Login token valid, storing auth data')
          // Preserve existing accounts if not returned
          const existingAccounts = this.getAccounts()
          if (!data.data.customer.accounts && existingAccounts.length > 0) {
            data.data.customer.accounts = existingAccounts
          }
          this.setAuthData(data.data.customer, data.data.sessionToken)
          return {
            valid: true,
            customer: data.data.customer
          }
        }

        console.log('❌ Auth Library: Token invalid:', data.message)
        return {
          valid: false,
          error: data.message || 'Token tidak valid'
        }
      } catch (fetchError) {
        clearTimeout(timeoutId)
        console.error('💥 Auth Library: Login token validation error:', fetchError)

        // Check if it's a timeout error
        if ((fetchError as Error).name === 'AbortError') {
          console.error('💥 Auth Library: Token validation timed out after 8 seconds')
          return {
            valid: false,
            error: 'Token validation timeout - server tidak merespon'
          }
        }

        return {
          valid: false,
          error: 'Terjadi kesalahan saat validasi token'
        }
      }
    } catch (outerError) {
      console.error('💥 Auth Library: Unexpected error in validateToken:', outerError)
      return {
        valid: false,
        error: 'Terjadi kesalahan yang tidak terduga saat validasi token'
      }
    }
  }

  /**
   * Authenticate with phone and password
   */
  static async authenticateWithPhone(phone: string, password: string): Promise<TokenValidation> {
    try {
      const response = await fetch(`${this.API_BASE}/api/v1/customer-auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone, password })
      })

      const data = await response.json()

      if (data.success && data.data) {
        this.setAuthData(data.data.customer, data.data.token)
        return {
          valid: true,
          customer: data.data.customer
        }
      }

      return {
        valid: false,
        error: data.message || 'Autentikasi gagal'
      }
    } catch (error) {
      console.error('Phone authentication error:', error)
      return {
        valid: false,
        error: 'Terjadi kesalahan saat login'
      }
    }
  }

  /**
   * Authenticate with phone and OTP
   */
  static async authenticateWithPhoneAndOTP(phone: string, otp: string): Promise<TokenValidation> {
    try {
      console.log('🔐 Authenticating with phone and OTP:', phone, otp)

      const response = await fetch(`${this.API_BASE}/api/v1/customer-auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone, otp })
      })

      console.log('📡 Response status:', response.status)
      const data = await response.json()
      console.log('📋 Response data:', data)

      if (data.success && data.data) {
        console.log('✅ OTP valid, setting auth data')
        this.setAuthData(data.data.customer, data.data.token)
        return {
          valid: true,
          customer: data.data.customer
        }
      }

      console.log('❌ OTP invalid:', data.message)
      return {
        valid: false,
        error: data.message || 'OTP tidak valid'
      }
    } catch (error) {
      console.error('OTP authentication error:', error)
      return {
        valid: false,
        error: 'Terjadi kesalahan saat verifikasi OTP'
      }
    }
  }

  /**
   * Login with phone only (bypassing OTP)
   */
  static async loginByPhone(phone: string): Promise<TokenValidation> {
    try {
      console.log('Login by phone:', phone)

      const response = await fetch(`${this.API_BASE}/api/v1/customer-auth/login-by-phone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      })

      const data = await response.json()

      if (data.success && data.data) {
        this.setAuthData(data.data.customer, data.data.token)
        return {
          valid: true,
          customer: data.data.customer
        }
      }

      return {
        valid: false,
        error: data.message || 'Login gagal'
      }
    } catch (error) {
      console.error('Login by phone error:', error)
      return {
        valid: false,
        error: 'Terjadi kesalahan saat login'
      }
    }
  }

  /**
   * Request OTP for phone number
   */
  static async requestOTP(phone: string): Promise<{ success: boolean, message: string, data?: any }> {
    try {
      console.log('📱 Requesting OTP for phone:', phone)

      const response = await fetch(`${this.API_BASE}/api/v1/customer-auth/otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone })
      })

      console.log('📡 OTP Request response status:', response.status)
      const data = await response.json()
      console.log('📋 OTP Request response data:', data)

      return {
        success: data.success,
        message: data.message || 'OTP gagal dikirim',
        data: data.data
      }
    } catch (error) {
      console.error('OTP request error:', error)
      return {
        success: false,
        message: 'Terjadi kesalahan saat meminta OTP'
      }
    }
  }

  /**
   * Set authentication data in localStorage
   */
  static setAuthData(customer: Customer, token: string): void {
    if (typeof window !== 'undefined') {
      console.log('💾 CustomerAuth: Storing auth data')
      console.log('💾 CustomerAuth: Token length:', token.length)
      console.log('💾 CustomerAuth: Customer:', customer.name)
      console.log('💾 CustomerAuth: Customer ID:', customer.id)
      console.log('💾 CustomerAuth: Customer ID (business):', customer.customer_id)

      try {
        localStorage.setItem(this.TOKEN_KEY, token)
        console.log('✅ CustomerAuth: Token set successfully')

        localStorage.setItem(this.CUSTOMER_KEY, JSON.stringify(customer))
        console.log('✅ CustomerAuth: Customer data set successfully')

        // Verify it was stored
        const storedToken = localStorage.getItem(this.TOKEN_KEY)
        const storedCustomer = localStorage.getItem(this.CUSTOMER_KEY)

        console.log('💾 CustomerAuth: Verification - Token stored:', !!storedToken)
        console.log('💾 CustomerAuth: Verification - Customer stored:', !!storedCustomer)
        console.log('💾 CustomerAuth: Stored token length:', storedToken?.length || 0)

        // Debug: Check what was actually stored
        if (storedCustomer) {
          const parsedCustomer = JSON.parse(storedCustomer)
          console.log('💾 CustomerAuth: Parsed stored customer:', parsedCustomer)
          console.log('💾 CustomerAuth: Stored customer has customer_id:', !!parsedCustomer.customer_id)
          console.log('💾 CustomerAuth: Stored customer.customer_id:', parsedCustomer.customer_id)
        }

        if (!storedToken || !storedCustomer) {
          console.error('❌ CustomerAuth: FAILED TO STORE DATA IN LOCAL STORAGE!')
        }

        // Store accounts separately if available
        if (customer.accounts && customer.accounts.length > 0) {
          this.setAccounts(customer.accounts)
        }
      } catch (error) {
        console.error('💥 CustomerAuth: Error storing in localStorage:', error)
      }
    } else {
      console.warn('💾 CustomerAuth: Window not available, cannot store data')
    }
  }

  /**
   * Get stored authentication data
   */
  static getStoredAuth(): { customer: Customer | null, token: string | null } {
    if (typeof window === 'undefined') {
      console.log('🔍 CustomerAuth: getStoredAuth called on server side')
      return { customer: null, token: null }
    }

    try {
      const token = localStorage.getItem(this.TOKEN_KEY)
      const customerStr = localStorage.getItem(this.CUSTOMER_KEY)

      console.log('🔍 CustomerAuth: Reading stored auth data')
      console.log('🔍 CustomerAuth: Token exists:', !!token)
      console.log('🔍 CustomerAuth: Customer string exists:', !!customerStr)

      if (token) {
        console.log('🔍 CustomerAuth: Token length:', token.length)
        console.log('🔍 CustomerAuth: Token preview:', token.substring(0, 20) + '...')
      }

      const customer = customerStr ? JSON.parse(customerStr) : null
      if (customer) {
        console.log('🔍 CustomerAuth: Customer name:', customer.name)
        console.log('🔍 CustomerAuth: Customer ID:', customer.id)
        console.log('🔍 CustomerAuth: Customer ID (business):', customer.customer_id)
      }

      return {
        token,
        customer
      }
    } catch (error) {
      console.error('Error reading stored auth data:', error)
      return { customer: null, token: null }
    }
  }

  /**
   * Store customer accounts list
   */
  static setAccounts(accounts: Customer[]): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(this.ACCOUNTS_KEY, JSON.stringify(accounts))
        console.log('✅ CustomerAuth: Accounts list stored, count:', accounts.length)
      } catch (error) {
        console.error('💥 CustomerAuth: Error storing accounts:', error)
      }
    }
  }

  /**
   * Get stored accounts list
   */
  static getAccounts(): Customer[] {
    if (typeof window === 'undefined') return []

    try {
      const accountsStr = localStorage.getItem(this.ACCOUNTS_KEY)
      return accountsStr ? JSON.parse(accountsStr) : []
    } catch (error) {
      console.error('Error reading stored accounts:', error)
      return []
    }
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    const { customer, token } = this.getStoredAuth()
    return !(!customer && !token)  // Both customer and token must exist
  }

  /**
   * Get current authenticated customer
   */
  static getCurrentCustomer(): Customer | null {
    const { customer } = this.getStoredAuth()
    return customer
  }

  /**
   * Get current token
   */
  static getCurrentToken(): string | null {
    const { token } = this.getStoredAuth()
    return token
  }

  /**
   * Logout user
   */
  static logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.TOKEN_KEY)
      localStorage.removeItem(this.CUSTOMER_KEY)
      localStorage.removeItem(this.ACCOUNTS_KEY)
    }
  }

  /**
   * Initialize authentication from stored data
   */
  static async initializeAuth(): Promise<AuthState> {
    const { customer, token } = this.getStoredAuth()

    if (!customer || !token) {
      return {
        isAuthenticated: false,
        customer: null,
        token: null,
        loading: false,
        error: null
      }
    }

    // Validate stored token with server
    try {
      const validation = await this.validateToken(token)

      if (validation.valid) {
        return {
          isAuthenticated: true,
          customer: validation.customer || null,
          token,
          loading: false,
          error: null
        }
      } else {
        // Token is invalid, clear stored data
        this.logout()
        return {
          isAuthenticated: false,
          customer: null,
          token: null,
          loading: false,
          error: validation.error || 'Session expired'
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error)
      return {
        isAuthenticated: false,
        customer: null,
        token: null,
        loading: false,
        error: 'Authentication initialization failed'
      }
    }
  }

  /**
   * API client with authentication headers
   */
  static getAuthenticatedHeaders(): Record<string, string> {
    const { token } = this.getStoredAuth()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    console.log('🔍 CustomerAuth Debug - Token from storage:', token)

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
      console.log('🔍 CustomerAuth Debug - Authorization header set:', headers['Authorization'])
    } else {
      console.log('🔍 CustomerAuth Debug - No token found in storage')
    }

    return headers
  }

  /**
   * Make authenticated API request
   */
  static async apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.API_BASE}${endpoint}`
    const headers = {
      ...this.getAuthenticatedHeaders(),
      ...options.headers
    }

    // Create AbortController for timeout handling
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, logout (disabled for debugging)
          console.log('🔍 CustomerAuth Debug - 401 Unauthorized, token validation failed')
          // this.logout()
          throw new Error('Session expired. Please login again.')
        }
        throw new Error(`API request failed: ${response.statusText}`)
      }

      return response.json()
    } catch (error) {
      clearTimeout(timeoutId)

      // Check if it's a timeout error
      if ((error as Error).name === 'AbortError') {
        console.error('💥 API request timed out after 10 seconds:', endpoint)
        throw new Error('API request timeout - server tidak merespon')
      }

      throw error
    }
  }

  /**
   * Get customer portal data with token
   */
  static async getPortalData(): Promise<{
    customer: Customer
    portalData: {
      loginUrl: string
      token: string
      expiresAt: string
    }
  }> {
    return this.apiRequest('/api/v1/customer/portal/data')
  }

  /**
   * Format phone number for display
   */
  static formatPhone(phone: string): string {
    // Remove country code if present
    if (phone.startsWith('62')) {
      return '0' + phone.substring(2)
    }
    return phone
  }

  /**
   * Validate phone number format
   */
  static validatePhone(phone: string): boolean {
    const phoneRegex = /^(?:\+62|62|0)[0-9]{9,13}$/
    return phoneRegex.test(phone)
  }

  /**
   * Regenerate customer token
   */
  static async regenerateToken(): Promise<{ success: boolean, loginUrl?: string, message?: string }> {
    try {
      const response = await fetch(`${this.API_BASE}/api/v1/customer-auth/refresh`, {
        method: 'POST',
        headers: {
          ...this.getAuthenticatedHeaders()
        }
      })

      const data = await response.json()

      if (data.success && data.data) {
        this.setAuthData(data.data.customer, data.data.token)
        return {
          success: true,
          loginUrl: this.getLoginUrl(data.data.token)
        }
      }

      return {
        success: false,
        message: data.message || 'Token gagal diperbarui'
      }
    } catch (error) {
      console.error('Token regeneration error:', error)
      return {
        success: false,
        message: 'Terjadi kesalahan saat memperbarui token'
      }
    }
  }

  /**
   * Get login URL from token
   */
  static getLoginUrl(token: string): string {
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    return `${baseUrl}/customer/login/${token}`
  }
}

export default CustomerAuth