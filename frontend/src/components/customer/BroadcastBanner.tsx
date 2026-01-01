/**
 * Broadcast Banner Component
 * Persistent banner display for critical announcements (maintenance, errors, urgent notifications)
 * Unlike toast notifications, these banners remain visible until dismissed or expired
 */

'use client'

import React, { useState, useEffect } from 'react'
import { X, AlertTriangle, Info, AlertCircle, CheckCircle, Clock, Wifi, WifiOff, Bell, Settings, Activity } from 'lucide-react'
import { customerAPI, BroadcastMessage } from '@/lib/customer-api'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'

export interface BroadcastBannerProps {
  customerId?: number
  customerRegion?: string
  className?: string
  autoRefresh?: boolean
  refreshInterval?: number // in seconds
}

interface ExtendedBroadcastMessage extends BroadcastMessage {
  requires_persistence?: boolean // Override default persistence behavior
  is_dismissible?: boolean // Allow overriding dismissibility
  banner_type?: 'informasi' | 'gangguan' | 'maintenance' | 'selesai' | 'info' | 'warning' | 'error' | 'success'
}

const BroadcastBanner: React.FC<BroadcastBannerProps> = ({
  customerId,
  customerRegion,
  className = '',
  autoRefresh = true,
  refreshInterval = 30
}) => {
  const { isAuthenticated } = useCustomerAuth()
  const [messages, setMessages] = useState<ExtendedBroadcastMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<number>>(new Set())
  const [systemStatus, setSystemStatus] = useState<any>(null)

  // Load dismissed messages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('broadcast-banners-dismissed')
      if (stored) {
        const parsed = JSON.parse(stored)
        // Only keep dismissals for messages that are still recent (within 24 hours)
        const filtered = parsed.filter((item: { id: number; dismissed_at: string }) => {
          const dismissedTime = new Date(item.dismissed_at)
          const now = new Date()
          const hoursDiff = (now.getTime() - dismissedTime.getTime()) / (1000 * 60 * 60)
          return hoursDiff < 24
        })
        setDismissed(new Set(filtered.map((item: any) => item.id)))
        localStorage.setItem('broadcast-banners-dismissed', JSON.stringify(filtered))
      }
    } catch (err) {
      console.warn('Error loading dismissed banners:', err)
    }
  }, [])

  // Fetch broadcast messages and system status
  const fetchMessages = async () => {
    if (loading) return

    setLoading(true)
    setError(null)

    try {
      // Fetch broadcast messages
      const response = await customerAPI.getActiveBroadcastMessages({
        customer_id: customerId,
        region: customerRegion
      })

      if (response.success && response.data) {
        // Extract messages array from response
        const messagesArray = response.data.messages || []

        // Filter and enhance messages for banner display - Show all active messages
        const bannerMessages = messagesArray
          .filter(msg => {
            // Only show messages that should appear as banners
            if (dismissed.has(msg.id)) return false

            // Check if message is targeted to this customer
            if (msg.target_all) return true
            if (customerRegion && msg.target_areas?.includes(customerRegion)) return true

            return true // Show all messages that pass the targeting filter
          })
          .map(msg => ({
            ...msg,
            // Determine persistence based on type
            requires_persistence: msg.type === 'maintenance',
            is_dismissible: msg.type !== 'maintenance',
            // Use the type directly for banner type
            banner_type: msg.type
          })) as ExtendedBroadcastMessage[]

        setMessages(bannerMessages)
      } else {
        setError(response.error || 'Failed to load messages')
      }

      // Also fetch system status for additional context
      try {
        const statusResponse = await customerAPI.getSystemStatus()
        if (statusResponse.success) {
          setSystemStatus(statusResponse.data)
        }
      } catch (statusErr) {
        // System status fetch failure shouldn't break the component
        console.warn('Failed to fetch system status:', statusErr)
      }

    } catch (err) {
      console.error('Error fetching broadcast messages:', err)
      setError('Failed to load broadcast messages')
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh messages - only if authenticated
  useEffect(() => {
    // Don't fetch messages if user is not authenticated
    if (!isAuthenticated) {
      return
    }

    fetchMessages()

    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchMessages, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, customerId, customerRegion, autoRefresh, refreshInterval])

  // Handle message dismissal
  const handleDismiss = (messageId: number) => {
    const message = messages.find(m => m.id === messageId)
    if (message?.is_dismissible !== false) { // Only dismiss if allowed
      setDismissed(prev => {
        const newSet = new Set(prev).add(messageId)

        // Save to localStorage with timestamp
        try {
          const dismissed = Array.from(newSet).map(id => ({
            id,
            dismissed_at: new Date().toISOString()
          }))
          localStorage.setItem('broadcast-banners-dismissed', JSON.stringify(dismissed))
        } catch (err) {
          console.warn('Error saving dismissed banners:', err)
        }

        return newSet
      })
    }
  }

  // Get icon and styling based on banner type
  const getBannerConfig = (type: ExtendedBroadcastMessage['banner_type']) => {
    switch (type) {
      case 'informasi':
      case 'info':
        return {
          icon: Info,
          cardBg: 'bg-blue-500 dark:bg-blue-600',
          borderColor: 'border-blue-600 dark:border-blue-700',
          textColor: 'text-white dark:text-blue-50',
          iconColor: 'text-white',
          buttonColor: 'bg-blue-400 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-800 text-white',
          badgeColor: 'bg-blue-600 text-white dark:bg-blue-700',
          label: 'Informasi'
        }
      case 'gangguan':
      case 'error': // Map 'important'/'error' from admin to red
        return {
          icon: WifiOff,
          cardBg: 'bg-red-500 dark:bg-red-600',
          borderColor: 'border-red-600 dark:border-red-700',
          textColor: 'text-white dark:text-red-50',
          iconColor: 'text-white',
          buttonColor: 'bg-red-400 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-800 text-white',
          badgeColor: 'bg-red-600 text-white dark:bg-red-700',
          label: 'Gangguan'
        }
      case 'maintenance':
      case 'warning': // Map 'warning' from admin to yellow
        return {
          icon: Settings,
          cardBg: 'bg-yellow-500 dark:bg-yellow-600',
          borderColor: 'border-yellow-600 dark:border-yellow-700',
          textColor: 'text-white dark:text-yellow-50',
          iconColor: 'text-white',
          buttonColor: 'bg-yellow-400 hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-800 text-white',
          badgeColor: 'bg-yellow-600 text-white dark:bg-yellow-700',
          label: 'Maintenance'
        }
      case 'selesai':
      case 'success': // Map 'success' from admin to green
        return {
          icon: CheckCircle,
          cardBg: 'bg-green-500 dark:bg-green-600',
          borderColor: 'border-green-600 dark:border-green-700',
          textColor: 'text-white dark:text-green-50',
          iconColor: 'text-white',
          buttonColor: 'bg-green-400 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-800 text-white',
          badgeColor: 'bg-green-600 text-white dark:bg-green-700',
          label: 'Selesai'
        }
      default:
        return {
          icon: Info,
          cardBg: 'bg-gray-500 dark:bg-gray-600',
          borderColor: 'border-gray-600 dark:border-gray-700',
          textColor: 'text-white dark:text-gray-50',
          iconColor: 'text-white',
          buttonColor: 'bg-gray-400 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-800 text-white',
          badgeColor: 'bg-gray-600 text-white dark:bg-gray-700',
          label: 'Info'
        }
    }
  }

  // Show system-wide maintenance banner if system is in maintenance mode
  const renderSystemMaintenanceBanner = () => {
    if (systemStatus?.maintenance_mode) {
      return (
        <div className="w-full bg-red-600 text-white">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <WifiOff className="w-5 h-5" />
                <span className="font-medium">System Maintenance</span>
              </div>
              <div className="flex-1 mx-4">
                <p className="text-sm">
                  {systemStatus.maintenance_message || 'System is currently under maintenance. Some features may be unavailable.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // Don't render anything if user is not authenticated
  if (!isAuthenticated) {
    return null
  }

  if (loading && messages.length === 0) {
    return (
      <div className={`w-full ${className}`}>
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="animate-pulse">
            <div className="h-2 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`w-full ${className}`}>
      {/* System-wide maintenance banner */}
      {renderSystemMaintenanceBanner()}

      {/* Broadcast message banners */}
      {messages.map((message) => {
        const config = getBannerConfig(message.banner_type)
        const Icon = config.icon
        const isActive = message.is_active !== false
        const isExpired = message.expires_at ? new Date(message.expires_at) < new Date() : false

        // Don't show inactive or expired messages
        if (!isActive || isExpired) return null

        return (
          <div
            key={message.id}
            className="w-full px-4 sm:px-6 lg:px-8 py-3"
          >
            <div className={`
              max-w-7xl mx-auto rounded-xl shadow-lg hover:shadow-xl
              transition-all duration-300 ease-in-out ${config.cardBg}
              border-2 ${config.borderColor}
            `}>
              <div className="p-5">
                <div className="flex items-start space-x-4">
                  {/* Icon container */}
                  <div className={`
                    flex-shrink-0 w-12 h-12 rounded-full ${config.badgeColor}
                    flex items-center justify-center shadow-md
                  `}>
                    <Icon className={`w-6 h-6 ${config.iconColor}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-3">
                          <h3 className={`text-lg font-bold ${config.textColor}`}>
                            {message.title}
                          </h3>
                          <span className={`
                            px-3 py-1 text-xs font-bold rounded-full ${config.badgeColor}
                            ${config.textColor} shadow-sm
                          `}>
                            {config.label}
                          </span>
                        </div>
                        <p className={`text-sm leading-relaxed ${config.textColor} opacity-95`}>
                          {message.message}
                        </p>

                        {/* Timing info */}
                        <div className="mt-4 flex items-center space-x-6 text-xs">
                          <span className={`${config.textColor} opacity-80 flex items-center`}>
                            <Clock className="w-4 h-4 mr-2" />
                            {new Date(message.created_at).toLocaleString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {message.expires_at && (
                            <span className={`${config.textColor} opacity-80 flex items-center`}>
                              <Activity className="w-4 h-4 mr-2" />
                              Berlaku hingga: {new Date(message.expires_at).toLocaleString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dismiss button */}
                      {message.is_dismissible !== false && (
                        <button
                          onClick={() => handleDismiss(message.id)}
                          className={`
                            ml-4 p-2.5 rounded-lg ${config.buttonColor}
                            transition-all duration-200 hover:scale-110
                            focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50
                            shadow-md
                          `}
                          aria-label="Tutup pesan"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* Error state */}
      {error && (
        <div className="w-full bg-red-50 border-l-4 border-red-200">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-800">
                Unable to load system notifications: {error}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default BroadcastBanner