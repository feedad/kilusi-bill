/**
 * WebSocket Service for Real-time Broadcast Messages
 * Handles real-time delivery of broadcast messages to customer portal
 */

import { io, Socket } from 'socket.io-client'
import { CONFIG } from '@/lib/config'

export interface BroadcastMessage {
  id: number
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error' | 'maintenance'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  target_areas?: string[]
  target_all: boolean
  created_at: string
  expires_at?: string
  created_by?: string
}

export interface BroadcastEvent {
  type: 'new' | 'update' | 'delete'
  message: BroadcastMessage
  timestamp: string
}

class BroadcastWebSocketService {
  private socket: Socket | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners: Map<string, ((...args: unknown[]) => void)[]> = new Map()
  private customerId: number | null = null
  private customerRegion: string | null = null

  /**
   * Initialize WebSocket connection
   */
  connect(customerId?: number, customerRegion?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.customerId = customerId || null
        this.customerRegion = customerRegion || null

        // Get authentication token
        const token = typeof window !== 'undefined'
          ? localStorage.getItem('customer_token')
          : null

        // Configure socket connection
        this.socket = io(CONFIG.API_BASE_URL!, {
          auth: {
            token: token,
            userType: 'customer',
            customerId: this.customerId,
            customerRegion: this.customerRegion
          },
          transports: ['websocket', 'polling'],
          timeout: 10000,
          forceNew: true
        })

        // Connection event handlers
        this.socket.on('connect', () => {
          console.log('🔌 Broadcast WebSocket connected')
          this.isConnected = true
          this.reconnectAttempts = 0

          // Join customer-specific room for targeted messages
          if (this.customerId) {
            this.socket?.emit('join-customer-room', {
              customerId: this.customerId,
              customerRegion: this.customerRegion
            })
          }

          // Join global customer broadcast room
          this.socket?.emit('join-room', 'customer-broadcasts')

          resolve()
        })

        this.socket.on('disconnect', (reason) => {
          console.log('🔌 Broadcast WebSocket disconnected:', reason)
          this.isConnected = false

          if (reason === 'io server disconnect') {
            // Server disconnected, reconnect manually
            setTimeout(() => {
              this.reconnect()
            }, this.reconnectDelay)
          }
        })

        this.socket.on('connect_error', (error) => {
          console.error('🔌 Broadcast WebSocket connection error:', error)
          this.reconnectAttempts++

          if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnect()
            }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)) // Exponential backoff
          } else {
            console.error('🔌 Max reconnection attempts reached')
            reject(error)
          }
        })

        // Custom event handlers for broadcast messages
        this.socket.on('broadcast:new', (event: BroadcastEvent) => {
          this.handleBroadcastEvent(event)
        })

        this.socket.on('broadcast:update', (event: BroadcastEvent) => {
          this.handleBroadcastEvent(event)
        })

        this.socket.on('broadcast:delete', (event: BroadcastEvent) => {
          this.handleBroadcastEvent(event)
        })

        this.socket.on('broadcast:maintenance', (event: BroadcastEvent) => {
          this.handleBroadcastEvent(event)
        })

      } catch (error) {
        console.error('🔌 Error initializing broadcast WebSocket:', error)
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.emit('leave-room', 'customer-broadcasts')

      if (this.customerId) {
        this.socket.emit('leave-customer-room', {
          customerId: this.customerId
        })
      }

      this.socket.disconnect()
      this.socket = null
      this.isConnected = false
    }
  }

  /**
   * Reconnect to WebSocket
   */
  private reconnect(): void {
    if (!this.isConnected && this.reconnectAttempts <= this.maxReconnectAttempts) {
      console.log(`🔌 Reconnecting broadcast WebSocket (attempt ${this.reconnectAttempts + 1})...`)
      this.connect(this.customerId || undefined, this.customerRegion || undefined)
        .catch(error => {
          console.error('🔌 Reconnection failed:', error)
        })
    }
  }

  /**
   * Handle incoming broadcast events
   */
  private handleBroadcastEvent(event: BroadcastEvent): void {
    console.log('📢 Received broadcast event:', event)

    // Check if message is relevant to this customer
    if (!this.isMessageRelevant(event.message)) {
      return
    }

    // Emit to all registered listeners
    const listeners = this.listeners.get('broadcast') || []
    listeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in broadcast event listener:', error)
      }
    })

    // Also emit to specific event type listeners
    const typeListeners = this.listeners.get(`broadcast:${event.type}`) || []
    typeListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('Error in broadcast event listener:', error)
      }
    })
  }

  /**
   * Check if message is relevant to current customer
   */
  private isMessageRelevant(message: BroadcastMessage): boolean {
    // If message targets all customers, it's relevant
    if (message.target_all) {
      return true
    }

    // If message targets specific areas and we have customer region
    if (message.target_areas && this.customerRegion) {
      return message.target_areas.includes(this.customerRegion)
    }

    // Default to relevant if we can't determine
    return true
  }

  /**
   * Add event listener
   */
  on(event: string, callback: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Emit event to server
   */
  emit(event: string, data: any): void {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data)
    } else {
      console.warn('🔌 WebSocket not connected, cannot emit event:', event)
    }
  }

  /**
   * Get connection status
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true
  }

  /**
   * Update customer information
   */
  updateCustomerInfo(customerId?: number, customerRegion?: string): void {
    this.customerId = customerId || null
    this.customerRegion = customerRegion || null

    if (this.socket && this.isConnected) {
      // Leave old rooms and join new ones
      this.socket.emit('leave-customer-room', { customerId: this.customerId })

      this.socket.emit('join-customer-room', {
        customerId: this.customerId,
        customerRegion: this.customerRegion
      })
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): any {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      customerId: this.customerId,
      customerRegion: this.customerRegion,
      socketId: this.socket?.id,
      listeners: Array.from(this.listeners.keys())
    }
  }
}

// Singleton instance
const broadcastWebSocketService = new BroadcastWebSocketService()

export default broadcastWebSocketService