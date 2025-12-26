'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function ProtectedRoute({ children, fallback = null }: ProtectedRouteProps) {
  const router = useRouter()
  const { isAuthenticated, loading } = useCustomerAuth()

  useEffect(() => {
    // If not authenticated and not loading, redirect to login
    if (!loading && !isAuthenticated) {
      router.push('/customer/login')
    }
  }, [isAuthenticated, loading, router])

  // Show loading state
  if (loading) {
    return fallback || (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memverifikasi autentikasi...</p>
        </div>
      </div>
    )
  }

  // If not authenticated, don't render children
  if (!isAuthenticated) {
    return null // Will be redirected by useEffect
  }

  // If authenticated, render children
  return <>{children}</>
}