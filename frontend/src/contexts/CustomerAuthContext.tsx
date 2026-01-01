'use client'

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import CustomerAuth, { Customer, AuthState } from '@/lib/customer-auth'

interface CustomerAuthContextType extends AuthState {
  login: (phone: string, otp?: string) => Promise<boolean>
  loginWithToken: (token: string) => Promise<boolean>
  logout: () => void
  requestOTP: (phone: string) => Promise<{ success: boolean, message: string }>
  refreshCustomerData: () => Promise<void>
  regenerateToken: () => Promise<{ token: string; loginUrl: string } | null>
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { customer: Customer; token: string } }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CUSTOMER_UPDATE'; payload: Customer }
  | { type: 'CLEAR_ERROR' }

const initialState: AuthState = {
  isAuthenticated: false,
  customer: null,
  token: null,
  loading: true,
  error: null
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        loading: true,
        error: null
      }

    case 'AUTH_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        customer: action.payload.customer,
        token: action.payload.token,
        loading: false,
        error: null
      }

    case 'AUTH_ERROR':
      return {
        ...state,
        isAuthenticated: false,
        customer: null,
        token: null,
        loading: false,
        error: action.payload
      }

    case 'AUTH_LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        customer: null,
        token: null,
        loading: false,
        error: null
      }

    case 'CUSTOMER_UPDATE':
      return {
        ...state,
        customer: action.payload
      }

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null
      }

    default:
      return state
  }
}

const CustomerAuthContext = createContext<CustomerAuthContextType | undefined>(undefined)

interface CustomerAuthProviderProps {
  children: ReactNode
}

export function CustomerAuthProvider({ children }: CustomerAuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Initialize auth state from stored data (simplified to avoid loop)
  useEffect(() => {
    const initializeAuth = () => {
      console.log('🔑 Context: Initializing auth state...')
      const { customer, token } = CustomerAuth.getStoredAuth()
      console.log('🔑 Context: Found stored auth:', { hasCustomer: !!customer, hasToken: !!token })

      if (customer && token) {
        console.log('🔑 Context: Dispatching AUTH_SUCCESS for stored auth data')
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            customer,
            token
          }
        })
      } else {
        console.log('🔑 Context: No stored auth found, setting AUTH_ERROR')
        dispatch({ type: 'AUTH_ERROR', payload: 'No session found' })
      }
    }

    // Only initialize on client side
    if (typeof window !== 'undefined') {
      initializeAuth()
    }
  }, [])

  // Listen for authentication state changes
  useEffect(() => {
    const handleAuthUpdated = (event: CustomEvent) => {
      console.log('🔑 Auth updated event received:', event.detail)
      const { customer, token } = event.detail

      if (customer && token) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            customer,
            token
          }
        })
      }
    }

    const handleAuthExpired = (event: CustomEvent) => {
      console.log('🔑 Auth expired event received:', event.detail)
      dispatch({ type: 'AUTH_LOGOUT' })

      // Redirect to login page after a short delay to ensure state update
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = '/customer/login'
        }
      }, 100)
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'customer_token' || event.key === 'customer_data') {
        console.log('🔑 Storage changed for:', event.key, 'newValue:', event.newValue)
        const { customer, token } = CustomerAuth.getStoredAuth()
        console.log('🔑 Storage change - Current auth:', { hasCustomer: !!customer, hasToken: !!token })

        if (customer && token) {
          console.log('🔑 Storage change - Dispatching AUTH_SUCCESS')
          dispatch({
            type: 'AUTH_SUCCESS',
            payload: {
              customer,
              token
            }
          })
        } else {
          console.log('🔑 Storage change - Dispatching AUTH_LOGOUT')
          dispatch({ type: 'AUTH_LOGOUT' })
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:updated', handleAuthUpdated as EventListener)
      window.addEventListener('auth:expired', handleAuthExpired as EventListener)
      window.addEventListener('storage', handleStorageChange)

      return () => {
        window.removeEventListener('auth:updated', handleAuthUpdated as EventListener)
        window.removeEventListener('auth:expired', handleAuthExpired as EventListener)
        window.removeEventListener('storage', handleStorageChange)
      }
    }
  }, [])

  const login = async (phone: string, otp?: string): Promise<boolean> => {
    dispatch({ type: 'AUTH_START' })

    try {
      // Use OTP authentication if OTP is provided, otherwise use password authentication
      const result = otp
        ? await CustomerAuth.authenticateWithPhoneAndOTP(phone, otp)
        : await CustomerAuth.authenticateWithPhone(phone, otp) // otp will be undefined for password login

      if (result.valid && result.customer) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            customer: result.customer,
            token: CustomerAuth.getCurrentToken()!
          }
        })
        return true
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: result.error || 'Login failed' })
        return false
      }
    } catch (error) {
      dispatch({ type: 'AUTH_ERROR', payload: 'Login failed' })
      return false
    }
  }

  const loginWithToken = async (token: string): Promise<boolean> => {
    console.log('🔑 Context: loginWithToken called with token:', token)
    dispatch({ type: 'AUTH_START' })

    try {
      console.log('📞 Context: Calling CustomerAuth.validateToken...')
      const result = await CustomerAuth.validateToken(token)
      console.log('📋 Context: validateToken result:', result)

      if (result.valid && result.customer) {
        console.log('✅ Context: Token valid, dispatching AUTH_SUCCESS')
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            customer: result.customer,
            token
          }
        })
        return true
      } else {
        console.log('❌ Context: Token invalid, dispatching AUTH_ERROR')
        dispatch({ type: 'AUTH_ERROR', payload: result.error || 'Token validation failed' })
        return false
      }
    } catch (error) {
      console.error('💥 Context: loginWithToken error:', error)
      dispatch({ type: 'AUTH_ERROR', payload: 'Token validation failed' })
      return false
    }
  }

  const requestOTP = async (phone: string): Promise<{ success: boolean, message: string }> => {
    try {
      const result = await CustomerAuth.requestOTP(phone)
      return result
    } catch (error) {
      return { success: false, message: 'Failed to send OTP' }
    }
  }

  const logout = () => {
    CustomerAuth.logout()
    dispatch({ type: 'AUTH_LOGOUT' })
  }

  const refreshCustomerData = async (): Promise<void> => {
    if (!state.isAuthenticated || !state.customer) {
      return
    }

    try {
      // Re-validate current token to get updated customer data
      const token = CustomerAuth.getCurrentToken()
      if (token) {
        const result = await CustomerAuth.validateToken(token)
        if (result.valid && result.customer) {
          dispatch({
            type: 'CUSTOMER_UPDATE',
            payload: result.customer
          })
        }
      }
    } catch (error) {
      console.error('Failed to refresh customer data:', error)
    }
  }

  const regenerateToken = async (): Promise<{ token: string; loginUrl: string } | null> => {
    if (!state.isAuthenticated || !state.customer) {
      return null
    }

    try {
      const response = await CustomerAuth.apiRequest('/api/v1/customer/token/regenerate', {
        method: 'POST'
      })

      if (response.success) {
        // Update auth state with new token
        CustomerAuth.setAuthData(state.customer, response.token)
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            customer: state.customer,
            token: response.token
          }
        })

        return {
          token: response.token,
          loginUrl: response.loginUrl
        }
      }

      return null
    } catch (error) {
      console.error('Failed to regenerate token:', error)
      return null
    }
  }

  const value: CustomerAuthContextType = {
    ...state,
    login,
    loginWithToken,
    logout,
    requestOTP,
    refreshCustomerData,
    regenerateToken
  }

  // Show loading state only during initial authentication check, not for missing tokens
  if (state.loading && !state.isAuthenticated && typeof window !== 'undefined') {
    // Check if we have auth data in localStorage - if not, finish loading
    const hasToken = localStorage.getItem('customer_token')
    const hasCustomer = localStorage.getItem('customer_data')

    if (!hasToken && !hasCustomer) {
      // No auth data found, finish loading to allow redirect
      // IMPORTANT: Must wrap with Provider even here, otherwise useCustomerAuth hook throws error
      return (
        <CustomerAuthContext.Provider value={value}>
          {children}
        </CustomerAuthContext.Provider>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memverifikasi autentikasi...</p>
        </div>
      </div>
    )
  }

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  )
}

export function useCustomerAuth(): CustomerAuthContextType {
  const context = useContext(CustomerAuthContext)
  if (context === undefined) {
    // Check if we're on the server side or in a non-client environment
    if (typeof window === 'undefined') {
      // Return default values for server-side rendering
      return {
        isAuthenticated: false,
        customer: null,
        token: null,
        loading: true,
        error: null,
        login: async () => false,
        loginWithToken: async () => false,
        logout: () => { },
        requestOTP: async () => ({ success: false, message: 'Not available' }),
        refreshCustomerData: async () => { },
        regenerateToken: async () => null
      }
    }

    console.error('useCustomerAuth must be used within a CustomerAuthProvider')
    // Return safe defaults instead of throwing error to prevent crashes
    return {
      isAuthenticated: false,
      customer: null,
      token: null,
      loading: true,
      error: null,
      login: async () => false,
      loginWithToken: async () => false,
      logout: () => { },
      requestOTP: async () => ({ success: false, message: 'Not available' }),
      refreshCustomerData: async () => { },
      regenerateToken: async () => null
    }
  }
  return context
}

// Hook for protected routes
export function useRequireAuth() {
  const { isAuthenticated, loading } = useCustomerAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && typeof window !== 'undefined') {
      // Check BOTH React state AND localStorage before redirecting
      // localStorage is more reliable during hydration
      const hasLocalStorageAuth =
        localStorage.getItem('customer_token') &&
        localStorage.getItem('customer_data')

      if (!isAuthenticated && !hasLocalStorageAuth) {
        // Use Next.js router instead of hard redirect
        router.push('/customer/login')
      }
    }
  }, [isAuthenticated, loading, router])

  return { isAuthenticated, loading }
}

// Higher-order component for protecting routes
export function withCustomerAuth<P extends object>(
  Component: React.ComponentType<P>
) {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated, loading } = useRequireAuth()

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )
    }

    if (!isAuthenticated) {
      return null // Will redirect to login automatically
    }

    return <Component {...props} />
  }
}