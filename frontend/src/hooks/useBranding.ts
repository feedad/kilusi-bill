'use client'

import { useState, useEffect, useRef } from 'react'

interface BrandingSettings {
  siteTitle: string
  titleType: 'text' | 'logo'
  logoUrl: string
  faviconUrl: string
}

const defaultBranding: BrandingSettings = {
  siteTitle: 'Kilusi Bill',
  titleType: 'text',
  logoUrl: '',
  faviconUrl: '/favicon.ico',
}

// Global cache to prevent multiple fetches
let cachedBranding: BrandingSettings | null = null
let fetchPromise: Promise<BrandingSettings> | null = null

async function fetchBrandingFromServer(): Promise<BrandingSettings> {
  // Return cached if available
  if (cachedBranding) {
    return cachedBranding
  }

  // Return existing promise if fetch is in progress
  if (fetchPromise) {
    return fetchPromise
  }

  // Start new fetch
  fetchPromise = (async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const response = await fetch(`${apiUrl}/api/v1/branding-public`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.branding) {
          cachedBranding = { ...defaultBranding, ...data.data.branding }
          return cachedBranding
        }
      }
    } catch (error) {
      // Silently fail - use defaults
      console.log('Branding: using defaults')
    }

    cachedBranding = defaultBranding
    return defaultBranding
  })()

  return fetchPromise
}

export function useBranding() {
  const [branding, setBranding] = useState<BrandingSettings>(cachedBranding || defaultBranding)
  const [loading, setLoading] = useState(!cachedBranding)
  const hasFetched = useRef(false)

  useEffect(() => {
    // Only fetch once per component mount
    if (hasFetched.current) return
    hasFetched.current = true

    // If already cached, use it
    if (cachedBranding) {
      setBranding(cachedBranding)
      setLoading(false)
      return
    }

    // Fetch from server
    fetchBrandingFromServer().then((result) => {
      setBranding(result)
      setLoading(false)
    })
  }, [])

  // Update favicon dynamically (only once when branding changes)
  useEffect(() => {
    if (!loading && branding.faviconUrl && typeof document !== 'undefined') {
      try {
        // Use current origin for relative paths, or use URL as-is for absolute URLs
        const faviconUrl = branding.faviconUrl.startsWith('http')
          ? branding.faviconUrl
          : branding.faviconUrl.startsWith('/')
            ? `${typeof window !== 'undefined' ? window.location.origin : ''}${branding.faviconUrl}`
            : branding.faviconUrl

        // Find and update existing favicon link instead of removing
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
      } catch (error) {
        console.warn('Failed to update favicon:', error)
      }
    }
  }, [loading, branding.faviconUrl])

  // Update document title (only once when branding changes)
  useEffect(() => {
    if (!loading && branding.siteTitle && typeof document !== 'undefined') {
      if (document.title !== branding.siteTitle) {
        document.title = branding.siteTitle
      }
    }
  }, [loading, branding.siteTitle])

  const getLogoUrl = () => {
    if (!branding.logoUrl) return null
    // Use current origin for relative paths, or use URL as-is for absolute URLs
    return branding.logoUrl.startsWith('http')
      ? branding.logoUrl
      : branding.logoUrl.startsWith('/')
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}${branding.logoUrl}`
        : branding.logoUrl
  }

  return {
    branding,
    loading,
    getLogoUrl,
    isLogoMode: branding.titleType === 'logo',
  }
}
