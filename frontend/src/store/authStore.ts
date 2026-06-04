import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { User } from '@/types'
import { adminApi, endpoints } from '@/lib/api-clients'

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
          console.log('🔐 AuthStore: Starting login for username:', username)
          console.log('🔐 AuthStore: API endpoint:', endpoints.admin.auth.login)
          console.log('🔐 AuthStore: Full API URL:', `${adminApi.defaults.baseURL}${endpoints.admin.auth.login}`)
          if (typeof window !== 'undefined') {
            console.log('🔐 AuthStore: Browser at:', window.location.origin)
          }

          // Use JWT API for login
          const response = await adminApi.post(endpoints.admin.auth.login, {
            username,
            password
          })

          console.log('🔐 AuthStore: Login response status:', response.status)
          console.log('🔐 AuthStore: Full login response:', response.data)
          console.log('🔐 AuthStore: Response data.data:', response.data.data)

          if (response.data.success) {
            const { user, token } = response.data.data

            console.log('🔐 AuthStore: Login successful, user:', user)
            console.log('🔐 AuthStore: User role:', user?.role)
            console.log('🔐 AuthStore: Token received:', token ? 'Yes' : 'No')

            // Store the token in API defaults and local state
            adminApi.defaults.headers.common['Authorization'] = `Bearer ${token}`

            const newState = {
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
            }
            set(newState)
            console.log('🔐 AuthStore: State updated successfully:', newState)
            console.log('🔐 AuthStore: Current state after login:', get())
          } else {
            console.error('🔐 AuthStore: Login failed - success:false, message:', response.data.message)
            throw new Error(response.data.message || 'Login failed')
          }
        } catch (error: any) {
          console.error('🔐 AuthStore: Login error caught:', error)
          console.error('🔐 AuthStore: Error response:', error.response)
          console.error('🔐 AuthStore: Error status:', error.response?.status)
          console.error('🔐 AuthStore: Error data:', error.response?.data)

          set({ isLoading: false })
          throw new Error(error.response?.data?.message || error.message || 'Login failed')
        }
      },

      logout: () => {
        // Clear authorization header
        delete adminApi.defaults.headers.common['Authorization']

        // Clear all auth state
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })

        // Redirect immediately (instant logout)
        if (typeof window !== 'undefined') {
          window.location.href = '/admin/login'
        }

        // Fire-and-forget: call logout API in background
        adminApi.post(endpoints.admin.auth.logout).catch(error => {
          console.log('Logout API error:', error)
        })
      },

      refreshToken: async () => {
        const { token } = get()
        if (!token) return

        try {
          const response = await adminApi.post(endpoints.admin.auth.refresh)
          set({ token: response.data.data.token })
        } catch (error) {
          get().logout()
        }
      },

      updateProfile: async (userData: Partial<User>) => {
        const { user } = get()
        if (!user) return

        try {
          const response = await adminApi.put(endpoints.admin.auth.profile, userData)
          set({ user: response.data.data })
        } catch (error: any) {
          throw new Error(error.response?.data?.message || 'Failed to update profile')
        }
      },

      initializeAuth: () => {
        const { token } = get()
        if (token && token !== 'session') {
          // Restore the authorization header
          adminApi.defaults.headers.common['Authorization'] = `Bearer ${token}`
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => {
        // Prevent SSR access to localStorage
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        console.log('🔐 AuthStore: Hydration complete')
        console.log('🔐 AuthStore: Hydrated state:', state)
        console.log('🔐 AuthStore: User after hydration:', state?.user)
        console.log('🔐 AuthStore: User role after hydration:', state?.user?.role)

        // Check if user is null (old format or logged out)
        if (!state?.user && state?.token) {
          console.warn('⚠️ AuthStore: User is null but token exists - possible old auth format')
          console.log('🔐 AuthStore: Clearing invalid auth data')
          // Clear the invalid auth data
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth-storage')
          }
        }
      },
    }
  )
)