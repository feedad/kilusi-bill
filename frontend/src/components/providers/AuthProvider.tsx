'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const { isAuthenticated, initializeAuth } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()

  // Public routes that don't require authentication
  const publicRoutes = ['/admin/login', '/register', '/forgot-password', '/blog', '/support', '/terms']
  // Customer login and registration routes
  const customerPublicRoutes = ['/customer/login', '/customer/register']

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/')) ||
    customerPublicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))

  // Check if this is a customer route (all /customer/ routes are handled by CustomerAuthProvider)
  const isCustomerRoute = pathname.startsWith('/customer/')

  // Check if this is an admin protected route (not customer routes)
  const isAdminProtectedRoute = !isCustomerRoute && !isPublicRoute && pathname !== '/'

  useEffect(() => {
    // For public routes, immediately mark as initialized
    if (isPublicRoute || isCustomerRoute) {
      setIsInitialized(true)
      return
    }

    // Initialize authentication state for protected routes
    const init = async () => {
      if (typeof window !== 'undefined') {
        await initializeAuth()
      }
      setIsInitialized(true)
    }
    init()
  }, [pathname, isPublicRoute, isCustomerRoute])

  useEffect(() => {
    // Handle redirect for admin routes only
    if (isInitialized && !isAuthenticated && isAdminProtectedRoute) {
      router.push('/admin/login')
    }
  }, [isInitialized, isAuthenticated, isAdminProtectedRoute, router])

  // For public routes, render immediately
  if (isPublicRoute || isCustomerRoute) {
    return <>{children}</>
  }

  if (!isInitialized) {
    // Show loading screen while initializing auth for protected routes
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return <>{children}</>
}