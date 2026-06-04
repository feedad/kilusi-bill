'use client'

import { useEffect, useRef } from 'react'
import { useBranding } from '@/hooks/useBranding'

/**
 * BrandingProvider - Dynamic branding updates
 * Handles logo, favicon, and title updates from server
 */
export default function BrandingProvider({
  children
}: {
  children: React.ReactNode
}) {
  const { branding, loading } = useBranding()
  const faviconInitialized = useRef(false)
  const titleInitialized = useRef(false)

  // Update favicon dynamically (only once)
  useEffect(() => {
    // Skip if already initialized or still loading
    if (faviconInitialized.current || loading || !branding?.faviconUrl) {
      return
    }

    // Only run in browser
    if (typeof document === 'undefined') {
      return
    }

    try {
      const faviconUrl = branding.faviconUrl.startsWith('/')
        ? (process.env.NEXT_PUBLIC_API_URL || 'https://api.kilusi.id') + branding.faviconUrl
        : branding.faviconUrl

      // Find and update existing favicon links instead of removing them
      let faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement
      if (!faviconLink) {
        faviconLink = document.createElement('link')
        faviconLink.rel = 'icon'
        document.head.appendChild(faviconLink)
      }
      faviconLink.href = faviconUrl

      // Find and update existing apple-touch-icon
      let appleTouchLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement
      if (!appleTouchLink) {
        appleTouchLink = document.createElement('link')
        appleTouchLink.rel = 'apple-touch-icon'
        document.head.appendChild(appleTouchLink)
      }
      appleTouchLink.href = faviconUrl

      faviconInitialized.current = true
    } catch (error) {
      console.warn('Failed to update favicon:', error)
    }
  }, [loading, branding?.faviconUrl])

  // Update document title (only once)
  useEffect(() => {
    // Skip if already initialized or still loading
    if (titleInitialized.current || loading || !branding?.siteTitle) {
      return
    }

    // Only run in browser
    if (typeof document === 'undefined') {
      return
    }

    document.title = branding.siteTitle
    titleInitialized.current = true
  }, [loading, branding?.siteTitle])

  return <>{children}</>
}
