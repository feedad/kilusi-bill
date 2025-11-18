'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const initializeAuth = useAuthStore((state) => state.initializeAuth)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const pathname = usePathname()
  const router = useRouter()

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register', '/forgot-password']
  const isPublicRoute = publicRoutes.includes(pathname)

  useEffect(() => {
    // Initialize authentication state when the app loads
    initializeAuth()
    setIsInitialized(true)
  }, [initializeAuth])

  useEffect(() => {
    // Handle redirect after logout
    if (isInitialized && !isAuthenticated && !isPublicRoute && pathname !== '/') {
      console.log('Redirecting to login - not authenticated')
      router.push('/login')
    }
  }, [isInitialized, isAuthenticated, isPublicRoute, pathname, router])

  // Additional safety check - prevent infinite redirects
  useEffect(() => {
    if (!isAuthenticated && pathname === '/login') {
      console.log('Already on login page - no redirect needed')
    }
  }, [isAuthenticated, pathname])

  if (!isInitialized) {
    // Show loading screen while initializing auth
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return <>{children}</>
}