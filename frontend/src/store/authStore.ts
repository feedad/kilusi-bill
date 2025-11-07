import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { User } from '@/types'
import { api, endpoints } from '@/lib/api'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
  updateProfile: (userData: Partial<User>) => Promise<void>
  initializeAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (username: string, password: string) => {
        set({ isLoading: true })
        try {
          // Use JWT API for login
          const response = await api.post(endpoints.auth.login, {
            username,
            password
          })

          if (response.data.success) {
            const { user, token } = response.data.data

            // Store the token in API defaults and local state
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`

            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
            })
          } else {
            throw new Error(response.data.message || 'Login failed')
          }
        } catch (error: any) {
          set({ isLoading: false })
          throw new Error(error.response?.data?.message || 'Login failed')
        }
      },

      logout: async () => {
        try {
          await api.post(endpoints.auth.logout)
        } catch (error) {
          // Ignore logout API errors
        } finally {
          // Clear authorization header
          delete api.defaults.headers.common['Authorization']
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          })
        }
      },

      refreshToken: async () => {
        const { token } = get()
        if (!token) return

        try {
          const response = await api.post('/auth/refresh')
          set({ token: response.data.data.token })
        } catch (error) {
          get().logout()
        }
      },

      updateProfile: async (userData: Partial<User>) => {
        const { user } = get()
        if (!user) return

        try {
          const response = await api.put('/auth/profile', userData)
          set({ user: response.data.data })
        } catch (error: any) {
          throw new Error(error.response?.data?.message || 'Failed to update profile')
        }
      },

      initializeAuth: () => {
        const { token } = get()
        if (token && token !== 'session') {
          // Restore the authorization header
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)