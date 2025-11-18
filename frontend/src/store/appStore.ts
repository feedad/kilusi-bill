import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  // UI States
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  notifications: Notification[]

  // Loading states
  globalLoading: boolean

  // Settings
  settings: {
    companyName: string
    logo: string
    currency: string
    dateFormat: string
  }

  // Actions
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
  setGlobalLoading: (loading: boolean) => void
  addNotification: (notification: NotificationInput) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  updateSettings: (settings: Partial<AppState['settings']>) => void
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
  timestamp: number
}

export type NotificationInput = Omit<Notification, 'id' | 'timestamp'>

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial states
      sidebarOpen: true,
      theme: 'light',
      notifications: [],
      globalLoading: false,

      settings: {
        companyName: 'Kilusi ISP',
        currency: 'IDR',
        dateFormat: 'DD/MM/YYYY',
      },

      // Actions
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

      setTheme: (theme: 'light' | 'dark') => {
        set({ theme })
        // Apply theme to document
        if (theme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
      },

      setGlobalLoading: (loading: boolean) => set({ globalLoading: loading }),

      addNotification: (notification: NotificationInput) => {
        const newNotification: Notification = {
          ...notification,
          id: Date.now().toString(),
          timestamp: Date.now(),
        }

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }))

        // Auto remove notification after duration
        if (notification.duration !== 0) {
          setTimeout(() => {
            get().removeNotification(newNotification.id)
          }, notification.duration || 5000)
        }
      },

      removeNotification: (id: string) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }))
      },

      clearNotifications: () => set({ notifications: [] }),

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }))
      },
    }),
    {
      name: 'app-storage',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        theme: state.theme,
        settings: state.settings,
      }),
    }
  )
)

// Initialize theme from persisted state
if (typeof window !== 'undefined') {
  const storedTheme = localStorage.getItem('app-storage')
  if (storedTheme) {
    try {
      const parsed = JSON.parse(storedTheme)
      if (parsed.state?.theme === 'dark') {
        document.documentElement.classList.add('dark')
      }
    } catch (error) {
      console.error('Failed to parse stored theme:', error)
    }
  }
}