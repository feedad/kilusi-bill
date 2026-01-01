/**
 * Browser Push Notification Service
 * Handles push notifications for broadcast messages
 */

import { BroadcastMessage } from '@/services/broadcastWebSocket'

interface NotificationPermission {
  granted: boolean
  denied: boolean
  default: boolean
}

interface NotificationOptions {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, unknown>
  requireInteraction?: boolean
  actions?: NotificationAction[]
  vibrate?: number[]
  silent?: boolean
}

interface NotificationAction {
  action: string
  title: string
  icon?: string
}



class PushNotificationService {
  private isSupported: boolean = false
  private subscription: PushSubscription | null = null
  private isSubscribed: boolean = false

  constructor() {
    this.checkSupport()
  }

  /**
   * Check if push notifications are supported
   */
  private checkSupport(): void {
    this.isSupported = 'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window

    if (!this.isSupported) {
      console.warn('Push notifications not supported in this browser')
    }
  }

  /**
   * Get current permission status
   */
  async getPermissionStatus(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      return { granted: false, denied: false, default: true }
    }

    const permission = await Notification.requestPermission()
    return {
      granted: permission === 'granted',
      denied: permission === 'denied',
      default: permission === 'default'
    }
  }

  /**
   * Request permission for push notifications
   */
  async requestPermission(): Promise<boolean> {
    if (!this.isSupported) {
      console.warn('Push notifications not supported')
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    } catch (error) {
      console.error('Error requesting notification permission:', error)
      return false
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribeToPush(serverPublicKey: string): Promise<PushSubscription | null> {
    if (!this.isSupported) {
      console.warn('Push notifications not supported')
      return null
    }

    try {
      // Request permission first
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.warn('Notification permission not granted')
        return null
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(serverPublicKey) as any
      })

      this.subscription = subscription
      this.isSubscribed = true

      console.log('Push subscription created:', subscription)
      return subscription

    } catch (error) {
      console.error('Error subscribing to push notifications:', error)
      return null
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPush(): Promise<boolean> {
    if (!this.subscription || !this.isSubscribed) {
      return true
    }

    try {
      const success = await this.subscription.unsubscribe()
      this.subscription = null
      this.isSubscribed = false

      console.log('Push subscription removed:', success)
      return success
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error)
      return false
    }
  }

  /**
   * Get current subscription
   */
  getSubscription(): PushSubscription | null {
    return this.subscription
  }

  /**
   * Check if subscribed
   */
  getIsSubscribed(): boolean {
    return this.isSubscribed
  }

  /**
   * Show local notification (not push notification)
   */
  showNotification(options: NotificationOptions): boolean {
    if (!this.isSupported || Notification.permission !== 'granted') {
      console.warn('Cannot show notification: not supported or permission not granted')
      return false
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        badge: options.badge || '/favicon-32x32.png',
        tag: options.tag,
        data: options.data || {},
        requireInteraction: options.requireInteraction || false,
        actions: options.actions || [],
        vibrate: options.vibrate || [200, 100, 200],
        silent: options.silent || false
      } as any)

      // Auto close after 5 seconds unless requireInteraction is true
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close()
        }, 5000)
      }

      // Handle click events
      notification.onclick = (event) => {
        event.preventDefault()
        notification.close()

        // Focus or open the window
        if (window.focus) {
          window.focus()
        } else {
          window.open(window.location.href, '_blank')
        }

        // Handle custom actions
        if ((options.data as any)?.onClick) {
          (options.data as any).onClick()
        }
      }

      return true
    } catch (error) {
      console.error('Error showing notification:', error)
      return false
    }
  }

  /**
   * Show broadcast message notification
   */
  showBroadcastNotification(message: BroadcastMessage): boolean {
    const notificationOptions: NotificationOptions = {
      title: message.title,
      body: message.message,
      tag: `broadcast-${message.id}`,
      data: {
        type: 'broadcast',
        messageId: message.id,
        messageType: message.type,
        priority: message.priority
      },
      requireInteraction: message.priority === 'urgent',
      vibrate: message.priority === 'urgent' ? [200, 100, 200, 100, 200] : [200, 100, 200]
    }

    // Add custom actions for different message types
    if (message.type === 'maintenance') {
      notificationOptions.actions = [
        {
          action: 'view-details',
          title: 'Lihat Detail',
          icon: '/icons/view.svg'
        },
        {
          action: 'dismiss',
          title: 'Tutup',
          icon: '/icons/close.svg'
        }
      ]
    }

    // Customize icon based on message type
    switch (message.type) {
      case 'info':
        notificationOptions.icon = '/icons/info-notification.png'
        break
      case 'warning':
        notificationOptions.icon = '/icons/warning-notification.png'
        break
      case 'error':
        notificationOptions.icon = '/icons/error-notification.png'
        break
      case 'maintenance':
        notificationOptions.icon = '/icons/maintenance-notification.png'
        break
      case 'success':
        notificationOptions.icon = '/icons/success-notification.png'
        break
      default:
        notificationOptions.icon = '/favicon.ico'
    }

    return this.showNotification(notificationOptions)
  }

  /**
   * Convert URL base64 to Uint8Array for VAPID keys
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  /**
   * Get push subscription status for server
   */
  getSubscriptionForServer(): Record<string, unknown> | null {
    if (!this.subscription) {
      return null
    }

    return {
      endpoint: this.subscription.endpoint,
      keys: {
        p256dh: Array.from(new Uint8Array(this.subscription.getKey('p256dh')!))
          .map(byte => String.fromCharCode(byte))
          .join(''),
        auth: Array.from(new Uint8Array(this.subscription.getKey('auth')!))
          .map(byte => String.fromCharCode(byte))
          .join('')
      }
    }
  }

  /**
   * Check if service worker is ready
   */
  async isServiceWorkerReady(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      return false
    }

    try {
      const registration = await navigator.serviceWorker.ready
      return !!registration.active
    } catch (error) {
      console.error('Service worker not ready:', error)
      return false
    }
  }
}

// Create singleton instance
const pushNotificationService = new PushNotificationService()

export default pushNotificationService
export { PushNotificationService, type NotificationOptions }