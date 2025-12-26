/**
 * React Hook for managing customer broadcast messages
 * Integrates with WebSocket service for real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'react-hot-toast'
import broadcastWebSocketService, { BroadcastEvent, BroadcastMessage } from '@/services/broadcastWebSocket'
import { publicApi } from '@/lib/api-clients'

interface UseBroadcastMessagesOptions {
  customerId?: number
  customerRegion?: string
  autoConnect?: boolean
  enableWebSocket?: boolean
  maxMessages?: number
  refreshInterval?: number // Auto refresh interval in ms (0 to disable)
}

interface UseBroadcastMessagesReturn {
  messages: BroadcastMessage[]
  loading: boolean
  error: string | null
  isConnected: boolean
  hasNewMessages: boolean
  refreshMessages: () => Promise<void>
  markAsRead: (messageId: number) => void
  dismissMessage: (messageId: number) => void
  connectionStats: any
}

export function useBroadcastMessages({
  customerId,
  customerRegion,
  autoConnect = true,
  enableWebSocket = true,
  maxMessages = 10,
  refreshInterval = 0
}: UseBroadcastMessagesOptions = {}): UseBroadcastMessagesReturn {
  const [messages, setMessages] = useState<BroadcastMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [dismissedMessages, setDismissedMessages] = useState<Set<number>>(new Set())

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastMessageCountRef = useRef(0)

  // Load dismissed messages from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('dismissed_broadcast_messages')
    if (dismissed) {
      try {
        setDismissedMessages(new Set(JSON.parse(dismissed)))
      } catch (error) {
        console.error('Error parsing dismissed messages:', error)
      }
    }
  }, [])

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Build query parameters
      const params = new URLSearchParams()
      if (customerId) {
        params.append('customer_id', customerId.toString())
      } else if (customerRegion) {
        params.append('region', customerRegion)
      }

      const response = await publicApi.get(`/api/v1/broadcast-public/messages/active?${params.toString()}`)

      if (response.data.success) {
        const fetchedMessages = response.data.data.messages || []

        // Filter out dismissed messages and expired messages
        const activeMessages = fetchedMessages
          .filter((msg: BroadcastMessage) => {
            // Check if dismissed
            if (dismissedMessages.has(msg.id)) return false

            // Check if expired
            if (msg.expires_at && new Date(msg.expires_at) < new Date()) return false

            return true
          })
          .sort((a: BroadcastMessage, b: BroadcastMessage) => {
            // Sort by priority first
            const priorityOrder = { urgent: 1, high: 2, medium: 3, low: 4 }
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
            if (priorityDiff !== 0) return priorityDiff

            // Then by creation date (newest first)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          })
          .slice(0, maxMessages)

        setMessages(activeMessages)

        // Check for new messages
        if (activeMessages.length > lastMessageCountRef.current) {
          setHasNewMessages(true)
          lastMessageCountRef.current = activeMessages.length

          // Show toast for urgent messages
          const urgentMessages = activeMessages.filter(msg => msg.priority === 'urgent')
          if (urgentMessages.length > 0) {
            urgentMessages.forEach(msg => {
              toast.error(`🚨 ${msg.title}: ${msg.message}`, {
                duration: 10000,
                style: {
                  background: '#dc2626',
                  color: '#fff'
                }
              })
            })
          } else {
            // Show generic toast for regular messages
            const newMsgs = activeMessages.slice(0, activeMessages.length - lastMessageCountRef.current + 1)
            if (newMsgs.length > 0) {
              toast.success(`📢 Anda memiliki ${newMsgs.length} pesan baru`, {
                duration: 5000
              })
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching broadcast messages:', err)
      setError(err.message || 'Gagal mengambil pesan broadcast')
    } finally {
      setLoading(false)
    }
  }, [customerId, customerRegion, maxMessages, dismissedMessages])

  // Handle WebSocket events
  const handleBroadcastEvent = useCallback((event: BroadcastEvent) => {
    console.log('📡 Received broadcast event:', event)

    if (event.type === 'new') {
      // Add new message if not dismissed and not expired
      if (!dismissedMessages.has(event.message.id) &&
          (!event.message.expires_at || new Date(event.message.expires_at) > new Date())) {
        setMessages(prev => {
          const updated = [event.message, ...prev]
            .sort((a, b) => {
              const priorityOrder = { urgent: 1, high: 2, medium: 3, low: 4 }
              const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
              if (priorityDiff !== 0) return priorityDiff
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            })
            .slice(0, maxMessages)
          return updated
        })

        setHasNewMessages(true)

        // Show appropriate toast based on priority
        if (event.message.priority === 'urgent') {
          toast.error(`🚨 ${event.message.title}`, {
            duration: 15000,
            style: {
              background: '#dc2626',
              color: '#fff'
            }
          })
        } else if (event.message.priority === 'high') {
          toast.error(`⚠️ ${event.message.title}`, {
            duration: 10000,
            style: {
              background: '#f59e0b',
              color: '#fff'
            }
          })
        } else {
          toast.success(`📢 ${event.message.title}`, {
            duration: 5000
          })
        }
      }
    } else if (event.type === 'update') {
      // Update existing message
      setMessages(prev => prev.map(msg =>
        msg.id === event.message.id ? event.message : msg
      ))
    } else if (event.type === 'delete') {
      // Remove message
      setMessages(prev => prev.filter(msg => msg.id !== event.message.id))
    }
  }, [dismissedMessages, maxMessages])

  // Connect to WebSocket
  const connectWebSocket = useCallback(async () => {
    if (!enableWebSocket || !customerId) return

    try {
      await broadcastWebSocketService.connect(customerId, customerRegion)
      setIsConnected(true)

      // Add event listener
      broadcastWebSocketService.on('broadcast', handleBroadcastEvent)

    } catch (err: any) {
      console.error('Failed to connect to broadcast WebSocket:', err)
      setIsConnected(false)
    }
  }, [enableWebSocket, customerId, customerRegion, handleBroadcastEvent])

  // Disconnect from WebSocket
  const disconnectWebSocket = useCallback(() => {
    broadcastWebSocketService.off('broadcast', handleBroadcastEvent)
    broadcastWebSocketService.disconnect()
    setIsConnected(false)
  }, [handleBroadcastEvent])

  // Manual refresh
  const refreshMessages = useCallback(async () => {
    await fetchMessages()
    if (enableWebSocket && !isConnected) {
      await connectWebSocket()
    }
  }, [fetchMessages, enableWebSocket, isConnected, connectWebSocket])

  // Mark message as read
  const markAsRead = useCallback((messageId: number) => {
    // This could be integrated with a backend API to track read status
    console.log('Marking message as read:', messageId)
  }, [])

  // Dismiss message
  const dismissMessage = useCallback((messageId: number) => {
    const newDismissed = new Set([...dismissedMessages, messageId])
    setDismissedMessages(newDismissed)

    // Save to localStorage
    localStorage.setItem('dismissed_broadcast_messages', JSON.stringify([...newDismissed]))

    // Remove from current messages
    setMessages(prev => prev.filter(msg => msg.id !== messageId))
  }, [dismissedMessages])

  // Initial setup
  useEffect(() => {
    if (autoConnect) {
      fetchMessages()

      if (enableWebSocket) {
        connectWebSocket()
      }
    }

    // Set up auto refresh if specified
    if (refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        fetchMessages()
      }, refreshInterval)
    }

    return () => {
      disconnectWebSocket()
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [autoConnect, enableWebSocket, refreshInterval])

  // Update WebSocket connection when customer info changes
  useEffect(() => {
    if (isConnected && enableWebSocket) {
      broadcastWebSocketService.updateCustomerInfo(customerId, customerRegion)
    }
  }, [customerId, customerRegion, isConnected, enableWebSocket])

  // Get connection stats
  const connectionStats = broadcastWebSocketService.getConnectionStats()

  return {
    messages,
    loading,
    error,
    isConnected,
    hasNewMessages,
    refreshMessages,
    markAsRead,
    dismissMessage,
    connectionStats
  }
}

export default useBroadcastMessages