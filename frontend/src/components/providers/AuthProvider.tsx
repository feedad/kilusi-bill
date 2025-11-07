'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth)

  useEffect(() => {
    // Initialize authentication state when the app loads
    initializeAuth()
  }, [initializeAuth])

  return <>{children}</>
}