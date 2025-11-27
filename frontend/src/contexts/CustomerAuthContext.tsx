'use client'

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react'
import CustomerAuth, { Customer, AuthState } from '@/lib/customer-auth'

interface CustomerAuthContextType extends AuthState {
  login: (phone: string, otp?: string) => Promise<boolean>
  loginWithToken: (token: string) => Promise<boolean>
  logout: () => void
  requestOTP: (phone: string) => Promise<{success: boolean, message: string}>
  refreshCustomerData: () => Promise<void>
  regenerateToken: () => Promise<{token: string; loginUrl: string} | null>
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
  fallback?: ReactNode
}

export function CustomerAuthProvider({ children, fallback }: CustomerAuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Initialize auth state from stored data (simplified to avoid loop)
  useEffect(() => {
    const initializeAuth = () => {
      const { customer, token } = CustomerAuth.getStoredAuth()

      if (customer && token) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            customer,
            token
          }
        })
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: 'No session found' })
      }
    }

    initializeAuth()
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

  const requestOTP = async (phone: string): Promise<{success: boolean, message: string}> => {
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

  const regenerateToken = async (): Promise<{token: string; loginUrl: string} | null> => {
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

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const value: CustomerAuthContextType = {
    ...state,
    login,
    loginWithToken,
    logout,
    requestOTP,
    refreshCustomerData,
    regenerateToken,
    clearError
  }

  // Show loading state during authentication
  if (state.loading && !state.isAuthenticated) {
    return fallback || (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat data pelanggan...</p>
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
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider')
  }
  return context
}

// Hook for protected routes
export function useRequireAuth() {
  const { isAuthenticated, loading } = useCustomerAuth()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      // Redirect to login page
      window.location.href = '/customer/login'
    }
  }, [isAuthenticated, loading])

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