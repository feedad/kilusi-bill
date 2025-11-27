'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { wsService, WhatsAppStatusUpdate } from '@/lib/ws-service'

interface UseWhatsAppWebSocketOptions {
  onConnectionChange?: (connected: boolean) => void
  onMessageReceived?: (message: any) => void
  onQueueUpdate?: (queueData: any) => void
  onError?: (error: Error) => void
}

export function useWhatsAppWebSocket(options: UseWhatsAppWebSocketOptions = {}) {
  const {
    onConnectionChange,
    onMessageReceived,
    onQueueUpdate,
    onError
  } = options

  const {
    handleRealtimeStatusUpdate,
    fetchStatus,
    fetchQueueStatus,
    fetchAnalytics,
    initializeWebSocket,
    cleanupWebSocket
  } = useWhatsAppStore()

  const isInitialized = useRef(false)

  // Handle WhatsApp status updates
  const handleStatusUpdate = useCallback((update: WhatsAppStatusUpdate) => {
    try {
      console.log('📱 WhatsApp WebSocket status update:', update)

      // Update store with real-time data
      handleRealtimeStatusUpdate(update)

      // Call custom callback
      if (onConnectionChange && update.connected !== undefined) {
        onConnectionChange(update.connected)
      }

      // If status changed significantly, refresh related data
      if (update.connected !== undefined) {
        // Refresh queue status when connection changes
        setTimeout(() => {
          fetchQueueStatus()
          fetchAnalytics()
        }, 1000)
      }
    } catch (error) {
      console.error('Error handling WhatsApp status update:', error)
      if (onError) onError(error as Error)
    }
  }, [handleRealtimeStatusUpdate, onConnectionChange, onError, fetchQueueStatus, fetchAnalytics])

  // Handle message received events
  const handleMessageReceived = useCallback((data: any) => {
    try {
      console.log('📨 WhatsApp message received:', data)

      // Refresh queue status to get latest data
      fetchQueueStatus()

      // Call custom callback
      if (onMessageReceived) {
        onMessageReceived(data)
      }
    } catch (error) {
      console.error('Error handling message received:', error)
      if (onError) onError(error as Error)
    }
  }, [onMessageReceived, onError, fetchQueueStatus])

  // Handle queue updates
  const handleQueueUpdate = useCallback((data: any) => {
    try {
      console.log('📋 WhatsApp queue update:', data)

      // Refresh queue status
      fetchQueueStatus()

      // Call custom callback
      if (onQueueUpdate) {
        onQueueUpdate(data)
      }
    } catch (error) {
      console.error('Error handling queue update:', error)
      if (onError) onError(error as Error)
    }
  }, [onQueueUpdate, onError, fetchQueueStatus])

  // Handle connection errors
  const handleConnectionError = useCallback((error: Error) => {
    console.error('🔌 WhatsApp WebSocket connection error:', error)
    if (onError) onError(error)
  }, [onError])

  // Initialize WebSocket connection
  useEffect(() => {
    if (!isInitialized.current && typeof window !== 'undefined') {
      console.log('🔌 Initializing WhatsApp WebSocket...')

      // Initialize WebSocket service
      initializeWebSocket()

      // Set up event listeners
      wsService.on('whatsapp-status-update', handleStatusUpdate)
      wsService.on('whatsapp-message-received', handleMessageReceived)
      wsService.on('whatsapp-queue-update', handleQueueUpdate)
      wsService.on('websocket-error', handleConnectionError)

      // Ensure we're subscribed to WhatsApp updates
      if (wsService.isConnected) {
        wsService.subscribeToWhatsAppStatus()
      }

      isInitialized.current = true

      return () => {
        // Cleanup event listeners
        wsService.off('whatsapp-status-update', handleStatusUpdate)
        wsService.off('whatsapp-message-received', handleMessageReceived)
        wsService.off('whatsapp-queue-update', handleQueueUpdate)
        wsService.off('websocket-error', handleConnectionError)

        console.log('🔌 WhatsApp WebSocket cleaned up')
      }
    }
  }, [
    handleStatusUpdate,
    handleMessageReceived,
    handleQueueUpdate,
    handleConnectionError,
    initializeWebSocket
  ])

  // Reconnect logic
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wsService.isConnected) {
        console.log('📱 Page became visible, attempting WebSocket reconnection...')
        wsService.connect()
      }
    }

    const handleOnline = () => {
      console.log('🌐 Network connection restored, attempting WebSocket reconnection...')
      if (!wsService.isConnected) {
        wsService.connect()
      }
    }

    // Add event listeners for reconnection scenarios
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // Periodic health check
  useEffect(() => {
    const healthCheckInterval = setInterval(() => {
      if (!wsService.isConnected) {
        console.log('🔌 WebSocket health check: attempting reconnection...')
        wsService.connect()
      }
    }, 30000) // Check every 30 seconds

    return () => {
      clearInterval(healthCheckInterval)
    }
  }, [])

  return {
    isConnected: wsService.isConnected,
    socketId: wsService.socketId,
    subscribe: () => wsService.subscribeToWhatsAppStatus(),
    unsubscribe: () => wsService.unsubscribeFromWhatsAppStatus(),
    reconnect: () => wsService.connect(),
    disconnect: () => wsService.disconnect()
  }
}