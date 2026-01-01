/**
 * Custom hooks for standardized API calls
 * Replaces direct fetch calls with consistent patterns
 */

import { useState, useEffect, useCallback } from 'react'
import { adminApi, customerApi, publicApi, handleApiError, getCurrentUserType } from '../lib/api-clients'

/**
 * Generic API hook for GET requests
 */
export function useApi<T = any>(
  endpoint: string,
  options: {
    immediate?: boolean
    userType?: 'admin' | 'customer' | 'public'
    params?: Record<string, any>
    dependencies?: any[]
  } = {}
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    immediate = true,
    userType = getCurrentUserType(),
    params = {},
    dependencies = []
  } = options

  const execute = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const apiClient = userType === 'admin' ? adminApi :
                      userType === 'customer' ? customerApi : publicApi

      const response = await apiClient.get(endpoint, { params })
      setData(response.data.data || response.data)
    } catch (err: any) {
      const errorMessage = handleApiError(err)
      setError(errorMessage)
      console.error('API Error:', err)
    } finally {
      setLoading(false)
    }
  }, [endpoint, userType, params])

  useEffect(() => {
    if (immediate) {
      execute()
    }
  }, [execute, immediate, ...dependencies])

  return {
    data,
    loading,
    error,
    refetch: execute
  }
}

/**
 * Generic API hook for POST/PUT/DELETE requests
 */
export function useApiMutation<T = any>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
  options: {
    userType?: 'admin' | 'customer' | 'public'
    onSuccess?: (data: T) => void
    onError?: (error: string) => void
  } = {}
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { userType = getCurrentUserType(), onSuccess, onError } = options

  const execute = useCallback(async (data?: any) => {
    setLoading(true)
    setError(null)

    try {
      const apiClient = userType === 'admin' ? adminApi :
                      userType === 'customer' ? customerApi : publicApi

      let response
      if (method === 'POST') {
        response = await apiClient.post(endpoint, data)
      } else if (method === 'PUT') {
        response = await apiClient.put(endpoint, data)
      } else if (method === 'DELETE') {
        response = await apiClient.delete(endpoint)
      }

      const result = response.data.data || response.data
      onSuccess?.(result)
      return result
    } catch (err: any) {
      const errorMessage = handleApiError(err)
      setError(errorMessage)
      onError?.(errorMessage)
      console.error('API Mutation Error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [endpoint, method, userType, onSuccess, onError])

  return {
    execute,
    loading,
    error
  }
}

/**
 * Specialized hooks for common patterns
 */

// ODP Management
export function useODPs() {
  return useApi('/api/v1/odp', { userType: 'admin' })
}

export function useODPStats() {
  return useApi('/api/v1/odp/stats', { userType: 'admin' })
}

export function useCreateODP() {
  return useApiMutation('/api/v1/odp', 'POST', { userType: 'admin' })
}

// Customer Management
export function useCustomers(params?: Record<string, any>) {
  return useApi('/api/v1/customers', { userType: 'admin', params })
}

export function useCustomerData() {
  return useApi('/api/v1/customer-auth-nextjs/get-customer-data', {
    userType: 'customer',
    immediate: true
  })
}

// Dashboard
export function useDashboardStats() {
  return useApi('/api/v1/dashboard/stats', { userType: 'admin' })
}

// Settings
export function useSettings() {
  return useApi('/api/v1/settings', { userType: 'admin' })
}

// Customer Portal Specific
export function useCustomerInvoices() {
  return useApi('/api/v1/customer-billing/my-invoices', { userType: 'customer' })
}

export function useCustomerInvoiceDetail(invoiceId: string) {
  return useApi(`/api/v1/customer-billing/invoices/${invoiceId}`, {
    userType: 'customer',
    immediate: !!invoiceId
  })
}

// WhatsApp Templates
export function useWhatsAppTemplates() {
  return useApi('/api/v1/whatsapp/templates', { userType: 'admin' })
}

export function useCreateWhatsAppTemplate() {
  return useApiMutation('/api/v1/whatsapp/templates', 'POST', { userType: 'admin' })
}

// Health Check
export function useHealthCheck() {
  return useApi('/api/v1/health', { userType: 'public' })
}

// Custom hook for form submissions
export function useFormSubmit<T = any>(
  endpoint: string,
  options: {
    method?: 'POST' | 'PUT' | 'DELETE'
    userType?: 'admin' | 'customer' | 'public'
    onSuccess?: (data: T) => void
    onError?: (error: string) => void
    resetOnSuccess?: boolean
  } = {}
) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    method = 'POST',
    userType = getCurrentUserType(),
    onSuccess,
    onError,
    resetOnSuccess = true
  } = options

  const submit = useCallback(async (data: any) => {
    setLoading(true)
    setSuccess(false)
    setError(null)

    try {
      const apiClient = userType === 'admin' ? adminApi :
                      userType === 'customer' ? customerApi : publicApi

      let response
      if (method === 'POST') {
        response = await apiClient.post(endpoint, data)
      } else if (method === 'PUT') {
        response = await apiClient.put(endpoint, data)
      } else if (method === 'DELETE') {
        response = await apiClient.delete(endpoint)
      }

      const result = response.data.data || response.data
      setSuccess(true)
      onSuccess?.(result)

      if (resetOnSuccess) {
        setTimeout(() => setSuccess(false), 3000)
      }

      return result
    } catch (err: any) {
      const errorMessage = handleApiError(err)
      setError(errorMessage)
      onError?.(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [endpoint, method, userType, onSuccess, onError, resetOnSuccess])

  const reset = useCallback(() => {
    setSuccess(false)
    setError(null)
  }, [])

  return {
    submit,
    loading,
    success,
    error,
    reset
  }
}

export default {
  useApi,
  useApiMutation,
  useODPs,
  useODPStats,
  useCreateODP,
  useCustomers,
  useCustomerData,
  useDashboardStats,
  useSettings,
  useCustomerInvoices,
  useCustomerInvoiceDetail,
  useWhatsAppTemplates,
  useCreateWhatsAppTemplate,
  useHealthCheck,
  useFormSubmit
}