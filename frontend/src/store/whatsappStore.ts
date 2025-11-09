import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  WhatsAppSettings,
  WhatsAppStatus,
  WhatsAppTemplate,
  NotificationResult,
  WhatsAppAnalytics,
  WhatsAppTestConfig,
  WhatsAppBroadcast
} from '@/types'
import { whatsappAPI } from '@/lib/whatsapp-api'
import { useAppStore } from './appStore'

interface WhatsAppStore {
  // State
  status: WhatsAppStatus | null
  settings: WhatsAppSettings | null
  templates: Record<string, WhatsAppTemplate> | null
  analytics: WhatsAppAnalytics | null
  broadcasts: WhatsAppBroadcast[] | null

  // UI State
  loading: boolean
  connecting: boolean
  qrCode: string | null
  showQRCode: boolean
  showSettingsModal: boolean
  showTestModal: boolean
  showBroadcastModal: boolean

  // Queue State
  queueStatus: 'idle' | 'processing' | 'paused'
  queueLength: number

  // Error & Messages
  error: string | null
  success: string | null

  // Real-time data
  lastUpdated: number
  refreshInterval: number
  autoRefresh: boolean

  // Actions
  // Connection Management
  fetchStatus: () => Promise<void>
  connect: () => Promise<boolean>
  disconnect: () => Promise<boolean>
  restart: () => Promise<boolean>
  getQRCode: () => Promise<void>
  refreshQRCode: () => Promise<void>

  // Settings Management
  fetchSettings: () => Promise<void>
  updateSettings: (settings: Partial<WhatsAppSettings>) => Promise<boolean>
  fetchTemplates: () => Promise<void>
  updateTemplate: (key: string, template: Partial<WhatsAppTemplate>) => Promise<boolean>
  enableTemplate: (key: string, enabled: boolean) => Promise<boolean>
  testTemplate: (config: WhatsAppTestConfig) => Promise<boolean>

  // Message Sending
  sendMessage: (config: any) => Promise<NotificationResult | null>
  sendBulkMessage: (config: any) => Promise<NotificationResult | null>
  sendInvoiceNotification: (customerId: string, invoiceId: string) => Promise<boolean>

  // Broadcast Management
  fetchBroadcasts: () => Promise<void>
  createBroadcast: (broadcast: any) => Promise<WhatsAppBroadcast | null>
  executeBroadcast: (id: string) => Promise<NotificationResult | null>

  // Queue Management
  fetchQueueStatus: () => Promise<void>
  pauseQueue: () => Promise<boolean>
  resumeQueue: () => Promise<boolean>
  clearQueue: () => Promise<boolean>

  // Analytics & Reports
  fetchAnalytics: (period?: { start: string; end: string }) => Promise<void>

  // UI Actions
  setLoading: (loading: boolean) => void
  setConnecting: (connecting: boolean) => void
  setError: (error: string | null) => void
  setSuccess: (success: string | null) => void
  showNotification: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
  clearMessages: () => void

  // Modal Actions
  showQRCodeModal: () => void
  hideQRCodeModal: () => void
  showSettings: () => void
  hideSettings: () => void
  showTestModal: () => void
  hideTestModal: () => void
  showBroadcastModal: () => void
  hideBroadcastModal: () => void

  // Auto Refresh
  startAutoRefresh: () => void
  stopAutoRefresh: () => void
  toggleAutoRefresh: () => void
}

export const useWhatsAppStore = create<WhatsAppStore>()(
  persist(
    (set, get) => {
      let refreshTimer: NodeJS.Timeout | null = null

      return {
        // Initial state
        status: null,
        settings: null,
        templates: null,
        analytics: null,
        broadcasts: null,
        loading: false,
        connecting: false,
        qrCode: null,
        showQRCode: false,
        showSettingsModal: false,
        showTestModal: false,
        showBroadcastModal: false,
        queueStatus: 'idle',
        queueLength: 0,
        error: null,
        success: null,
        lastUpdated: 0,
        refreshInterval: 30000, // 30 seconds
        autoRefresh: true,

        // Connection Management
        fetchStatus: async () => {
          const { setLoading, setError } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.getStatus()
            if (response.success && response.data) {
              set({
                status: response.data,
                lastUpdated: Date.now(),
                error: null
              })

              // Update queue status
              set({
                queueStatus: response.data.queueStatus || 'idle',
                queueLength: response.data.queueLength || 0
              })

              // Check if QR code is needed
              if (!response.data.connected && !get().qrCode) {
                get().getQRCode()
              }
            } else {
              setError(response.error || 'Failed to fetch WhatsApp status')
            }
          } catch (error) {
            setError('Network error while fetching status')
            console.error('Error fetching WhatsApp status:', error)
          } finally {
            setLoading(false)
          }
        },

        connect: async () => {
          const { setConnecting, setError, setSuccess, fetchStatus } = get()
          try {
            setConnecting(true)
            setError(null)
            const response = await whatsappAPI.connect()
            if (response.success) {
              setSuccess(response.message || 'WhatsApp connection initiated')
              // Show QR code modal
              get().showQRCodeModal()
              // Start polling for QR code
              get().getQRCode()
              return true
            } else {
              setError(response.error || 'Failed to connect WhatsApp')
              return false
            }
          } catch (error) {
            setError('Network error while connecting WhatsApp')
            return false
          } finally {
            setConnecting(false)
          }
        },

        disconnect: async () => {
          const { setLoading, setError, setSuccess } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.disconnect()
            if (response.success) {
              setSuccess(response.message || 'WhatsApp disconnected successfully')
              set({ qrCode: null, showQRCode: false })
              get().fetchStatus()
              return true
            } else {
              setError(response.error || 'Failed to disconnect WhatsApp')
              return false
            }
          } catch (error) {
            setError('Network error while disconnecting WhatsApp')
            return false
          } finally {
            setLoading(false)
          }
        },

        restart: async () => {
          const { setLoading, setError, setSuccess, fetchStatus } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.restart()
            if (response.success) {
              setSuccess(response.message || 'WhatsApp service restarted successfully')
              get().fetchStatus()
              return true
            } else {
              setError(response.error || 'Failed to restart WhatsApp')
              return false
            }
          } catch (error) {
            setError('Network error while restarting WhatsApp')
            return false
          } finally {
            setLoading(false)
          }
        },

        getQRCode: async () => {
          try {
            const response = await whatsappAPI.getQRCode()
            if (response.success && response.data) {
              set({
                qrCode: response.data.qrCode,
                showQRCode: !response.data.connected
              })

              // If connected, hide QR modal and refresh status
              if (response.data.connected) {
                get().hideQRCodeModal()
                get().fetchStatus()
              }
            }
          } catch (error) {
            console.error('Error fetching QR code:', error)
          }
        },

        refreshQRCode: async () => {
          const { setError } = get()
          try {
            await get().getQRCode()
          } catch (error) {
            setError('Failed to refresh QR code')
          }
        },

        // Settings Management
        fetchSettings: async () => {
          const { setLoading, setError } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.getSettings()
            if (response.success && response.data) {
              set({
                settings: response.data,
                templates: response.data.templates,
                error: null
              })
            } else {
              setError(response.error || 'Failed to fetch WhatsApp settings')
            }
          } catch (error) {
            setError('Network error while fetching settings')
          } finally {
            setLoading(false)
          }
        },

        updateSettings: async (newSettings) => {
          const { setLoading, setError, setSuccess, fetchSettings } = get()
          try {
            setLoading(true)
            setError(null)
            const response = await whatsappAPI.updateSettings(newSettings)
            if (response.success) {
              setSuccess('Settings updated successfully')
              await fetchSettings()
              return true
            } else {
              setError(response.error || 'Failed to update settings')
              return false
            }
          } catch (error) {
            setError('Network error while updating settings')
            return false
          } finally {
            setLoading(false)
          }
        },

        fetchTemplates: async () => {
          try {
            const response = await whatsappAPI.getTemplates()
            if (response.success && response.data) {
              set({ templates: response.data })
            }
          } catch (error) {
            console.error('Error fetching templates:', error)
          }
        },

        updateTemplate: async (key, template) => {
          const { setLoading, setError, setSuccess, fetchTemplates } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.updateTemplate(key, template)
            if (response.success) {
              setSuccess('Template updated successfully')
              await fetchTemplates()
              return true
            } else {
              setError(response.error || 'Failed to update template')
              return false
            }
          } catch (error) {
            setError('Network error while updating template')
            return false
          } finally {
            setLoading(false)
          }
        },

        enableTemplate: async (key, enabled) => {
          const { setLoading, setError, setSuccess, fetchTemplates } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.enableTemplate(key, enabled)
            if (response.success) {
              setSuccess(`Template ${enabled ? 'enabled' : 'disabled'} successfully`)
              await fetchTemplates()
              return true
            } else {
              setError(response.error || 'Failed to toggle template')
              return false
            }
          } catch (error) {
            setError('Network error while toggling template')
            return false
          } finally {
            setLoading(false)
          }
        },

        testTemplate: async (config) => {
          const { setLoading, setError, setSuccess } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.testTemplate(config)
            if (response.success) {
              setSuccess('Test notification sent successfully')
              return true
            } else {
              setError(response.error || 'Failed to send test notification')
              return false
            }
          } catch (error) {
            setError('Network error while sending test notification')
            return false
          } finally {
            setLoading(false)
          }
        },

        // Message Sending
        sendMessage: async (config) => {
          const { setLoading, setError, setSuccess } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.sendMessage(config)
            if (response.success && response.data) {
              setSuccess('Message sent successfully')
              return response.data
            } else {
              setError(response.error || 'Failed to send message')
              return null
            }
          } catch (error) {
            setError('Network error while sending message')
            return null
          } finally {
            setLoading(false)
          }
        },

        sendBulkMessage: async (config) => {
          const { setLoading, setError, setSuccess } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.sendBulkMessage(config)
            if (response.success && response.data) {
              setSuccess('Bulk messages sent successfully')
              return response.data
            } else {
              setError(response.error || 'Failed to send bulk messages')
              return null
            }
          } catch (error) {
            setError('Network error while sending bulk messages')
            return null
          } finally {
            setLoading(false)
          }
        },

        sendInvoiceNotification: async (customerId, invoiceId) => {
          const { setLoading, setError, setSuccess } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.sendInvoiceNotification(customerId, invoiceId)
            if (response.success) {
              setSuccess('Invoice notification sent successfully')
              return true
            } else {
              setError(response.error || 'Failed to send invoice notification')
              return false
            }
          } catch (error) {
            setError('Network error while sending invoice notification')
            return false
          } finally {
            setLoading(false)
          }
        },

        // Broadcast Management
        fetchBroadcasts: async () => {
          try {
            const response = await whatsappAPI.getBroadcasts()
            if (response.success && response.data) {
              set({ broadcasts: response.data })
            }
          } catch (error) {
            console.error('Error fetching broadcasts:', error)
          }
        },

        createBroadcast: async (broadcast) => {
          const { setLoading, setError, setSuccess, fetchBroadcasts } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.createBroadcast(broadcast)
            if (response.success && response.data) {
              setSuccess('Broadcast created successfully')
              await fetchBroadcasts()
              return response.data
            } else {
              setError(response.error || 'Failed to create broadcast')
              return null
            }
          } catch (error) {
            setError('Network error while creating broadcast')
            return null
          } finally {
            setLoading(false)
          }
        },

        executeBroadcast: async (id) => {
          const { setLoading, setError, setSuccess } = get()
          try {
            setLoading(true)
            const response = await whatsappAPI.executeBroadcast(id)
            if (response.success && response.data) {
              setSuccess('Broadcast executed successfully')
              return response.data
            } else {
              setError(response.error || 'Failed to execute broadcast')
              return null
            }
          } catch (error) {
            setError('Network error while executing broadcast')
            return null
          } finally {
            setLoading(false)
          }
        },

        // Queue Management
        fetchQueueStatus: async () => {
          try {
            const response = await whatsappAPI.getQueue()
            if (response.success && response.data) {
              set({
                queueStatus: response.data.status,
                queueLength: response.data.length
              })
            }
          } catch (error) {
            console.error('Error fetching queue status:', error)
          }
        },

        pauseQueue: async () => {
          const { setError, setSuccess, fetchQueueStatus } = get()
          try {
            const response = await whatsappAPI.pauseQueue()
            if (response.success) {
              setSuccess('Queue paused successfully')
              await fetchQueueStatus()
              return true
            } else {
              setError(response.error || 'Failed to pause queue')
              return false
            }
          } catch (error) {
            setError('Network error while pausing queue')
            return false
          }
        },

        resumeQueue: async () => {
          const { setError, setSuccess, fetchQueueStatus } = get()
          try {
            const response = await whatsappAPI.resumeQueue()
            if (response.success) {
              setSuccess('Queue resumed successfully')
              await fetchQueueStatus()
              return true
            } else {
              setError(response.error || 'Failed to resume queue')
              return false
            }
          } catch (error) {
            setError('Network error while resuming queue')
            return false
          }
        },

        clearQueue: async () => {
          const { setError, setSuccess, fetchQueueStatus } = get()
          try {
            const response = await whatsappAPI.clearQueue()
            if (response.success) {
              setSuccess('Queue cleared successfully')
              await fetchQueueStatus()
              return true
            } else {
              setError(response.error || 'Failed to clear queue')
              return false
            }
          } catch (error) {
            setError('Network error while clearing queue')
            return false
          }
        },

        // Analytics & Reports
        fetchAnalytics: async (period) => {
          try {
            const response = await whatsappAPI.getAnalytics(period)
            if (response.success && response.data) {
              set({ analytics: response.data })
            }
          } catch (error) {
            console.error('Error fetching analytics:', error)
          }
        },

        // UI Actions
        setLoading: (loading) => set({ loading }),
        setConnecting: (connecting) => set({ connecting }),
        setError: (error) => set({ error }),
        setSuccess: (success) => set({ success }),
        showNotification: (message, type) => {
          const { addNotification } = useAppStore.getState()
          addNotification({
            id: Date.now().toString(),
            type,
            title: 'WhatsApp',
            message,
            duration: 5000,
            timestamp: Date.now()
          })
        },
        clearMessages: () => set({ error: null, success: null }),

        // Modal Actions
        showQRCodeModal: () => set({ showQRCode: true }),
        hideQRCodeModal: () => set({ showQRCode: false }),
        showSettings: () => set({ showSettingsModal: true }),
        hideSettings: () => set({ showSettingsModal: false }),
        showTestModal: () => set({ showTestModal: true }),
        hideTestModal: () => set({ showTestModal: false }),
        showBroadcastModal: () => set({ showBroadcastModal: true }),
        hideBroadcastModal: () => set({ showBroadcastModal: false }),

        // Auto Refresh
        startAutoRefresh: () => {
          const { refreshInterval, autoRefresh, fetchStatus } = get()
          if (!autoRefresh || refreshTimer) return

          refreshTimer = setInterval(() => {
            fetchStatus()
          }, refreshInterval)
        },

        stopAutoRefresh: () => {
          if (refreshTimer) {
            clearInterval(refreshTimer)
            refreshTimer = null
          }
        },

        toggleAutoRefresh: () => {
          const { autoRefresh, startAutoRefresh, stopAutoRefresh } = get()
          const newAutoRefresh = !autoRefresh
          set({ autoRefresh: newAutoRefresh })

          if (newAutoRefresh) {
            startAutoRefresh()
          } else {
            stopAutoRefresh()
          }
        }
      }
    },
    {
      name: 'whatsapp-store',
      partialize: (state) => ({
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
        // Don't persist live data
      })
    }
  )
)

// Auto-start refresh when store is initialized
if (typeof window !== 'undefined') {
  useWhatsAppStore.getState().startAutoRefresh()
}