'use client'

import React, { useEffect } from 'react'
import { useAppStore } from '@/store/appStore'

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { theme, setTheme } = useAppStore()

  useEffect(() => {
    // Initialize theme on mount
    const storedTheme = localStorage.getItem('app-storage')
    if (storedTheme) {
      try {
        const parsed = JSON.parse(storedTheme)
        if (parsed.state?.theme) {
          setTheme(parsed.state.theme)
        }
      } catch (error) {
        console.error('Failed to parse stored theme:', error)
      }
    }
  }, [setTheme])

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  return <>{children}</>
}