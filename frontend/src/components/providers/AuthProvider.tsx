'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const { isAuthenticated, user, initializeAuth } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register', '/forgot-password']
  // Check if route is public (starts with any public route)
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route)) || pathname.startsWith('/customer/')

  useEffect(() => {
    // Initialize authentication state when the app loads
    if (typeof window !== 'undefined') {
      initializeAuth()
    }
    setIsInitialized(true)
  }, [])

  useEffect(() => {
    console.log('AuthProvider Debug - pathname:', pathname)
    console.log('AuthProvider Debug - isInitialized:', isInitialized)
    console.log('AuthProvider Debug - isAuthenticated:', isAuthenticated)
    console.log('AuthProvider Debug - isPublicRoute:', isPublicRoute)

    // Handle redirect after logout or unauthorized access
    if (isInitialized && !isAuthenticated && !isPublicRoute && pathname !== '/') {
      console.log('Redirecting to login - not authenticated, pathname:', pathname)
      router.push('/login')
    }
  }, [isInitialized, isAuthenticated, isPublicRoute, pathname, router])

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