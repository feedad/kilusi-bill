'use client'

import { io, Socket } from 'socket.io-client'

export interface WhatsAppStatusUpdate {
  connected: boolean
  status: string
  phoneNumber?: string
  profileName?: string
  qrCode?: string
  message: string
  timestamp: string
}

class WebSocketService {
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  connect() {
    if (this.socket?.connected) return

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3002'

    this.socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 20000
    })

    this.setupEventListeners()
  }

  private setupEventListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket connected')
      this.reconnectAttempts = 0
      // Subscribe to WhatsApp status updates
      this.socket?.emit('subscribe-whatsapp')
    })

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason)
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.socket?.connect()
      }
    })

    this.socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error)
      this.reconnectAttempts++

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('🔌 Max reconnection attempts reached')
      }
    })

    // WhatsApp status updates
    this.socket.on('whatsapp-status', (data: WhatsAppStatusUpdate) => {
      console.log('📱 WhatsApp status update:', data)
      this.emit('whatsapp-status-update', data)
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  subscribeToWhatsAppStatus() {
    this.socket?.emit('subscribe-whatsapp')
  }

  unsubscribeFromWhatsAppStatus() {
    this.socket?.emit('unsubscribe-whatsapp')
  }

  // Event emitter for component listeners
  private eventListeners: Map<string, Set<(data: any) => void>> = new Map()

  on(event: string, callback: (data: any) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)?.add(callback)
  }

  off(event: string, callback: (data: any) => void) {
    this.eventListeners.get(event)?.delete(callback)
  }

  private emit(event: string, data: any) {
    this.eventListeners.get(event)?.forEach(callback => callback(data))
  }

  get isConnected() {
    return this.socket?.connected || false
  }

  get socketId() {
    return this.socket?.id || null
  }
}

// Create singleton instance
export const wsService = new WebSocketService()

// Auto-connect in browser environment
if (typeof window !== 'undefined') {
  wsService.connect()
}