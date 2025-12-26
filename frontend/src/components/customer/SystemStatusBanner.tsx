/**
 * System Status Banner Component
 * Displays system-wide status including maintenance mode, service outages, and critical errors
 * This component monitors system health and displays appropriate banners
 */

'use client'

import React, { useState, useEffect } from 'react'
import {
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  X,
  Server,
  Database,
  Radio
} from 'lucide-react'
import { customerAPI } from '@/lib/customer-api'

export interface SystemStatusBannerProps {
  className?: string
  allowDismiss?: boolean
  refreshInterval?: number
}

interface ServiceStatus {
  name: string
  status: 'online' | 'offline' | 'degraded'
  last_check: string
  description?: string
}

interface SystemStatus {
  maintenance_mode: boolean
  maintenance_message?: string
  maintenance_start?: string
  maintenance_end?: string
  system_health: 'healthy' | 'degraded' | 'down'
  services: ServiceStatus[]
  critical_errors?: Array<{
    id: number
    message: string
    service: string
    timestamp: string
  }>
}

const SystemStatusBanner: React.FC<SystemStatusBannerProps> = ({
  className = '',
  allowDismiss = false,
  refreshInterval = 60 // seconds
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Load dismissed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('system-status-banner-dismissed')
      if (stored) {
        const data = JSON.parse(stored)
        const dismissedTime = new Date(data.dismissed_at)
        const now = new Date()
        const minutesDiff = (now.getTime() - dismissedTime.getTime()) / (1000 * 60)

        // Only keep dismissed state for 30 minutes
        if (minutesDiff < 30) {
          setDismissed(true)
        } else {
          localStorage.removeItem('system-status-banner-dismissed')
        }
      }
    } catch (err) {
      console.warn('Error loading dismissed state:', err)
    }
  }, [])

  // Fetch system status
  const fetchSystemStatus = async () => {
    try {
      const response = await customerAPI.getSystemStatus()

      if (response.success && response.data) {
        setSystemStatus(response.data)
        setError(null)
      } else {
        setError(response.error || 'Failed to fetch system status')
      }

      setLastRefresh(new Date())
    } catch (err: any) {
      console.error('Error fetching system status:', err)
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh system status
  useEffect(() => {
    fetchSystemStatus()

    if (refreshInterval > 0) {
      const interval = setInterval(fetchSystemStatus, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [refreshInterval])

  // Handle dismissal
  const handleDismiss = () => {
    if (allowDismiss) {
      setDismissed(true)
      try {
        localStorage.setItem('system-status-banner-dismissed', JSON.stringify({
          dismissed_at: new Date().toISOString()
        }))
      } catch (err) {
        console.warn('Error saving dismissed state:', err)
      }
    }
  }

  // Don't show if dismissed and no critical issues
  if (dismissed && !systemStatus?.maintenance_mode && systemStatus?.system_health !== 'down') {
    return null
  }

  // Don't show if system is healthy and no maintenance
  if (!loading && !error && systemStatus?.system_health === 'healthy' && !systemStatus?.maintenance_mode) {
    return null
  }

  // Render maintenance mode banner
  if (systemStatus?.maintenance_mode) {
    return (
      <div className={`w-full bg-orange-600 text-white ${className}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5" />
              <span className="font-medium">System Maintenance</span>
            </div>

            <div className="flex-1 mx-4">
              <p className="text-sm">
                {systemStatus.maintenance_message || 'System is currently under maintenance. Some features may be unavailable.'}
              </p>
              {systemStatus.maintenance_start && systemStatus.maintenance_end && (
                <p className="text-xs mt-1 opacity-90">
                  Maintenance window: {new Date(systemStatus.maintenance_start).toLocaleString('id-ID')} - {new Date(systemStatus.maintenance_end).toLocaleString('id-ID')}
                </p>
              )}
            </div>

            {allowDismiss && (
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-orange-500 rounded-full transition-colors"
                aria-label="Dismiss maintenance notice"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render critical system errors
  if (systemStatus?.system_health === 'down' || systemStatus?.critical_errors?.length) {
    return (
      <div className={`w-full bg-red-600 text-white ${className}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <WifiOff className="w-5 h-5" />
              <span className="font-medium">System Outage</span>
            </div>

            <div className="flex-1 mx-4">
              <p className="text-sm">
                We&apos;re experiencing technical difficulties. Our team is working to resolve the issue.
              </p>

              {systemStatus.critical_errors?.length && (
                <div className="mt-2 space-y-1">
                  {systemStatus.critical_errors.slice(0, 2).map((error) => (
                    <p key={error.id} className="text-xs opacity-90">
                      • {error.message}
                    </p>
                  ))}
                  {systemStatus.critical_errors.length > 2 && (
                    <p className="text-xs opacity-90">
                      +{systemStatus.critical_errors.length - 2} more issues...
                    </p>
                  )}
                </div>
              )}
            </div>

            {allowDismiss && (
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-red-500 rounded-full transition-colors"
                aria-label="Dismiss outage notice"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render degraded performance banner
  if (systemStatus?.system_health === 'degraded') {
    const offlineServices = systemStatus.services.filter(s => s.status === 'offline')
    const degradedServices = systemStatus.services.filter(s => s.status === 'degraded')

    return (
      <div className={`w-full bg-yellow-600 text-white ${className}`}>
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">Limited Service Availability</span>
            </div>

            <div className="flex-1 mx-4">
              <p className="text-sm">
                Some services may be experiencing issues. We&apos;re working to restore full functionality.
              </p>

              {(offlineServices.length > 0 || degradedServices.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {offlineServices.map(service => (
                    <span key={service.name} className="inline-flex items-center px-2 py-1 rounded-full bg-yellow-700 text-xs">
                      <WifiOff className="w-3 h-3 mr-1" />
                      {service.name}
                    </span>
                  ))}
                  {degradedServices.map(service => (
                    <span key={service.name} className="inline-flex items-center px-2 py-1 rounded-full bg-yellow-500 text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {service.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {allowDismiss && (
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-yellow-500 rounded-full transition-colors"
                aria-label="Dismiss performance notice"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Render loading or error state
  if (loading) {
    return (
      <div className={`w-full bg-gray-100 ${className}`}>
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-gray-600" />
            <span className="text-sm text-gray-600">Checking system status...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`w-full bg-gray-100 border-b border-gray-200 ${className}`}>
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-600">Unable to check system status</span>
            </div>
            <button
              onClick={fetchSystemStatus}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center space-x-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default SystemStatusBanner