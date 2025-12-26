/**
 * Service Worker for Push Notifications
 * Handles background push notifications and offline functionality
 */

const CACHE_NAME = 'kilusi-bill-v1'
const STATIC_CACHE_URLS = [
  '/',
  '/customer/login',
  '/customer/portal',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...')

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets')
        return cache.addAll(STATIC_CACHE_URLS)
      })
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...')

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Service Worker: Deleting old cache', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
      .then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Skip API requests - let them fail and handle in app
  if (event.request.url.includes('/api/')) {
    return
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          return response
        }

        // Otherwise fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response
            }

            // Clone the response since it can only be consumed once
            const responseToCache = response.clone()

            // Cache the response for future use
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache)
              })

            return response
          })
          .catch(() => {
            // If network fails, try to serve from cache for HTML pages
            if (event.request.destination === 'document') {
              return caches.match('/customer/login') || caches.match('/')
            }

            // For other requests, just let them fail
            return new Response('Offline', {
              status: 503,
              statusText: 'Service Unavailable'
            })
          })
      })
  )
})

// Push event - handle incoming push messages
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push message received', event)

  let pushData = {}

  try {
    if (event.data) {
      pushData = event.data.json()
    }
  } catch (error) {
    console.error('Service Worker: Error parsing push data', error)
    return
  }

  // Default notification options
  const options = {
    body: pushData.body || 'Anda memiliki pesan baru',
    icon: pushData.icon || '/favicon.ico',
    badge: '/favicon-32x32.png',
    tag: pushData.tag || 'broadcast',
    data: pushData.data || {},
    requireInteraction: pushData.requireInteraction || false,
    actions: pushData.actions || [],
    vibrate: pushData.vibrate || [200, 100, 200],
    silent: pushData.silent || false
  }

  // Customize based on message type
  if (pushData.data?.messageType) {
    switch (pushData.data.messageType) {
      case 'urgent':
        options.vibrate = [200, 100, 200, 100, 200]
        options.requireInteraction = true
        options.icon = '/icons/error-notification.png'
        break
      case 'warning':
        options.vibrate = [200, 100, 200]
        options.icon = '/icons/warning-notification.png'
        break
      case 'maintenance':
        options.icon = '/icons/maintenance-notification.png'
        options.actions = [
          {
            action: 'view-details',
            title: 'Lihat Detail'
          },
          {
            action: 'dismiss',
            title: 'Tutup'
          }
        ]
        break
      case 'success':
        options.icon = '/icons/success-notification.png'
        break
      case 'info':
      default:
        options.icon = '/icons/info-notification.png'
        break
    }
  }

  // Show notification
  if (pushData.title) {
    event.waitUntil(
      self.registration.showNotification(pushData.title, options)
    )
  }
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click received', event)

  const notification = event.notification
  const action = event.action
  const data = notification.data || {}

  // Close the notification
  notification.close()

  // Handle different actions
  if (action === 'dismiss') {
    return
  }

  // Default action - focus/open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus()
          }
        }

        // Open new window if no existing window
        if (clients.openWindow) {
          // Open specific page based on notification data
          let url = '/'
          if (data.type === 'broadcast' && data.messageId) {
            url = `/customer/portal?broadcast=${data.messageId}`
          } else if (data.url) {
            url = data.url
          }

          return clients.openWindow(url)
        }
      })
  )
})

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification closed', event)

  // Could track analytics here
  const data = event.notification.data || {}
  if (data.messageId) {
    // Optional: Send analytics to server that notification was closed
    console.log('Notification closed for message:', data.messageId)
  }
})

// Background sync event (for future use)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event)

  if (event.tag === 'background-sync-broadcasts') {
    event.waitUntil(
      // Could sync pending notification reads/dismissals here
      console.log('Syncing broadcast notification status')
    )
  }
})

// Periodic background sync (for future use)
self.addEventListener('periodicsync', (event) => {
  console.log('Service Worker: Periodic sync', event)

  if (event.tag === 'periodic-sync-broadcasts') {
    event.waitUntil(
      // Could periodically check for new broadcasts
      console.log('Periodic sync for broadcast messages')
    )
  }
})

// Message event - handle messages from main app
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data)

  const { type, payload } = event.data

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME })
      break
    case 'CLEAR_CACHE':
      event.waitUntil(
        caches.delete(CACHE_NAME).then(() => {
          event.ports[0].postMessage({ success: true })
        })
      )
      break
    default:
      console.warn('Service Worker: Unknown message type', type)
  }
})

// Handle service worker errors
self.addEventListener('error', (event) => {
  console.error('Service Worker: Error', event)
})

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker: Unhandled Promise Rejection', event)
})