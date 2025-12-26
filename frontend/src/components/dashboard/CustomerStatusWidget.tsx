'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui'
import { RefreshCw, Users, Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { CustomerStatusIndicator, CustomerStatusGrid, CustomerStatusBadge } from '@/components/ui'
import { adminApi } from '@/lib/api-clients'

interface CustomerData {
  id: string
  name: string
  status: 'online' | 'offline' | 'warning' | 'unknown'
  lastSeen?: string
  signalStrength?: number
  ipAddress?: string
  planName?: string
}

interface CustomerStatusWidgetProps {
  limit?: number
  refreshInterval?: number
  compact?: boolean
}

export function CustomerStatusWidget({
  limit = 10,
  refreshInterval = 30000,
  compact = false
}: CustomerStatusWidgetProps) {
  const [customers, setCustomers] = useState<CustomerData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      console.log('🔍 CustomerStatusWidget: Fetching customers from:', '/api/v1/realtime/online-customers')

      // Check if we have auth token
      const authStorage = localStorage.getItem('auth-storage')
      console.log('🔑 CustomerStatusWidget: Auth storage exists:', !!authStorage)
      if (authStorage) {
        const parsed = JSON.parse(authStorage)
        const token = parsed.state?.token
        console.log('🔑 CustomerStatusWidget: Token exists:', !!token)
        console.log('🔑 CustomerStatusWidget: Token preview:', token ? token.substring(0, 20) + '...' : 'null')
      }

      const response = await adminApi.get('/api/v1/realtime/online-customers')
      console.log('📡 CustomerStatusWidget: API Response status:', response.status)
      console.log('📡 CustomerStatusWidget: API Response data:', response.data)

      if (response.data.success) {
        console.log('✅ CustomerStatusWidget: API successful, mapping data...')
        console.log('📋 CustomerStatusWidget: Raw customers data:', response.data.data.customers)
        // Map backend data structure to frontend interface
        const customersData = response.data.data.customers.slice(0, limit).map(customer => ({
          id: customer.id,
          name: customer.name,
          status: customer.online_status === 'online' ? 'online' :
                 customer.online_status === 'idle' ? 'warning' :
                 customer.online_status === 'offline' ? 'offline' : 'unknown',
          lastSeen: customer.last_seen,
          signalStrength: customer.signal_strength || customer.rx_power,
          ipAddress: null, // Not provided by current API
          planName: customer.package_name
        }))

        console.log('Mapped customer data:', customersData) // Debug log
        setCustomers(customersData)
        setLastRefresh(new Date())
        setError(null)
      } else {
        setError('Failed to load customer data')
      }
    } catch (err) {
      console.error('💥 CustomerStatusWidget: Error fetching customers:', err)
      console.error('💥 CustomerStatusWidget: Error details:', {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data
      })
      setError(`Connection error: ${err.message}`)

      console.error('💥 CustomerStatusWidget: API FAILED - Will show ERROR instead of mock data')
      console.error('💥 CustomerStatusWidget: Mock data disabled to avoid confusion with real data')

      // Don't use mock data - show error state instead
      setCustomers([]) // Empty array to show 0 customers
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomers()

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchCustomers, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval, limit])

  const onlineCount = customers.filter(c => c.status === 'online').length
  const offlineCount = customers.filter(c => c.status === 'offline').length
  const warningCount = customers.filter(c => c.status === 'warning').length
  const totalCustomers = customers.length

  if (compact) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Customer Status</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchCustomers}
            disabled={loading}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-sm text-muted-foreground">Online: {onlineCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-sm text-muted-foreground">Offline: {offlineCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full" />
              <span className="text-sm text-muted-foreground">Warning: {warningCount}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Total: {totalCustomers}
            </div>
          </div>

          <div className="space-y-2">
            {customers.slice(0, 3).map((customer) => (
              <div key={customer.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CustomerStatusIndicator status={customer.status} size="sm" />
                  <span className="text-sm text-foreground truncate max-w-32">
                    {customer.name}
                  </span>
                </div>
                {customer.signalStrength !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {customer.signalStrength}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Status Overview
            </CardTitle>
            <CardDescription>
              Real-time status of connected customers
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', autoRefresh && 'animate-spin')} />
              {autoRefresh ? 'Auto' : 'Manual'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchCustomers}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Statistics Cards - 4 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wifi className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">Online</span>
            </div>
            <div className="text-2xl font-bold text-green-800 dark:text-green-300">{onlineCount}</div>
            <div className="text-xs text-green-700 dark:text-green-400">
              {totalCustomers > 0 ? Math.round((onlineCount / totalCustomers) * 100) : 0}% of total
            </div>
          </div>

          <div className="bg-red-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <WifiOff className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">Offline</span>
            </div>
            <div className="text-2xl font-bold text-red-800 dark:text-red-300">{offlineCount}</div>
            <div className="text-xs text-red-700 dark:text-red-400">
              {totalCustomers > 0 ? Math.round((offlineCount / totalCustomers) * 100) : 0}% of total
            </div>
          </div>

          <div className="bg-yellow-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Warning</span>
            </div>
            <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-300">{warningCount}</div>
            <div className="text-xs text-yellow-700 dark:text-yellow-400">
              {totalCustomers > 0 ? Math.round((warningCount / totalCustomers) * 100) : 0}% of total
            </div>
          </div>

          <div className="bg-muted rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Total</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{totalCustomers}</div>
            <div className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-yellow-500/10 rounded-xl p-3 mb-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">{error}</p>
          </div>
        )}

        {/* Customer Grid - Optimized for full width */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {customers.map((customer) => (
            <CustomerStatusBadge
              key={customer.id}
              status={customer.status}
              customerName={customer.name}
              lastSeen={customer.lastSeen}
              signalStrength={customer.signalStrength}
            />
          ))}
        </div>

        {customers.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No customers found</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}