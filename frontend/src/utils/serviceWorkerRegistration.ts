/**
 * Service Worker Registration Utility
 * Handles service worker registration for push notifications and offline functionality
 */

export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registration successful:', registration)

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content is available
                  console.log('New service worker available')
                }
              })
            }
          })

          // Handle push notification subscription changes
          if ('pushManager' in registration) {
            registration.pushManager.getSubscription()
              .then((subscription) => {
                if (subscription) {
                  console.log('Push subscription found:', subscription)
                } else {
                  console.log('No push subscription found')
                }
              })
              .catch((error) => {
                console.error('Error getting push subscription:', error)
              })
          }

        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error)
        })
    })
  } else {
    console.warn('Service Workers are not supported in this browser')
  }
}

export function unregisterServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
          .then(() => {
            console.log('Service Worker unregistered successfully')
          })
          .catch((error) => {
            console.error('Error unregistering service worker:', error)
          })
      })
      .catch((error) => {
        console.error('Error getting service worker registration:', error)
      })
  }
}

// Function to check if service worker is ready
export function isServiceWorkerReady(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      resolve(false)
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => {
        resolve(!!registration.active)
      })
      .catch(() => {
        resolve(false)
      })
  })
}

// Function to send message to service worker
export function sendMessageToServiceWorker(message: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      reject(new Error('Service Workers not supported'))
      return
    }

    navigator.serviceWorker.ready
      .then((registration) => {
        const messageChannel = new MessageChannel()
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data)
        }

        registration.active?.postMessage(message, [messageChannel.port2])
      })
      .catch(reject)
  })
}

const serviceWorkerRegistration = {
  register: registerServiceWorker,
  unregister: unregisterServiceWorker,
  isReady: isServiceWorkerReady,
  sendMessage: sendMessageToServiceWorker
}

export default serviceWorkerRegistration