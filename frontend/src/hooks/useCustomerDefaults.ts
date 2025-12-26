import { useState, useEffect } from 'react'
import { adminApi } from '@/lib/api-clients'

interface DefaultSetting {
  value: string
  type: 'text' | 'select' | 'number' | 'boolean'
  description?: string
}

interface CustomerDefaults {
  [key: string]: DefaultSetting
}

export const useCustomerDefaults = () => {
  const [defaults, setDefaults] = useState<CustomerDefaults>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDefaults = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await adminApi.get('/api/v1/customer-settings/defaults')

      if (response.data.success) {
        setDefaults(response.data.data.defaults)
      }
    } catch (err: any) {
      console.error('Error fetching customer defaults:', err)
      setError(err.message || 'Failed to fetch customer defaults')
    } finally {
      setLoading(false)
    }
  }

  const updateDefaults = async (settings: { [key: string]: any }) => {
    try {
      // Format settings for API
      const formattedSettings: any = {}
      for (const [key, value] of Object.entries(settings)) {
        // Determine field type based on key and value
        let fieldType = 'text'
        if (typeof value === 'boolean') {
          fieldType = 'boolean'
        } else if (typeof value === 'number') {
          fieldType = 'number'
        } else if (key.includes('billing_type') || key.includes('reconnection_calculation')) {
          fieldType = 'select'
        } else if (key.includes('billing_cycle')) {
          fieldType = 'select'
        }

        formattedSettings[key] = {
          value: String(value),
          type: fieldType
        }
      }

      const response = await adminApi.put('/api/v1/customer-settings/defaults', {
        settings: formattedSettings
      })

      if (response.data.success) {
        await fetchDefaults() // Refresh defaults
        return { success: true }
      }

      return { success: false, message: response.data.message }
    } catch (err: any) {
      console.error('Error updating customer defaults:', err)
      return {
        success: false,
        message: err.response?.data?.message || 'Failed to update defaults'
      }
    }
  }

  // Helper function to get default value
  const getDefaultValue = (field: string, fallback?: any): any => {
    if (!defaults[field]) return fallback

    const setting = defaults[field]

    // Parse based on type
    switch (setting.type) {
      case 'boolean':
        return setting.value === 'true'
      case 'number':
        return parseFloat(setting.value)
      default:
        return setting.value
    }
  }

  // Helper function to check if value is default
  const isDefaultValue = (field: string, value: any): boolean => {
    const defaultValue = getDefaultValue(field)
    return String(defaultValue) === String(value)
  }

  useEffect(() => {
    fetchDefaults()
  }, [])

  return {
    defaults,
    loading,
    error,
    refetch: fetchDefaults,
    updateDefaults,
    getDefaultValue,
    isDefaultValue
  }
}