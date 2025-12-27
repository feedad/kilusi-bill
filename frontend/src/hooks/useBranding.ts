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
      const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
      if (link) {
        const faviconUrl = branding.faviconUrl.startsWith('/')
          ? `${process.env.NEXT_PUBLIC_API_URL || ''}${branding.faviconUrl}`
          : branding.faviconUrl
        if (link.href !== faviconUrl) {
          link.href = faviconUrl
        }
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
    return branding.logoUrl.startsWith('/')
      ? `${process.env.NEXT_PUBLIC_API_URL || ''}${branding.logoUrl}`
      : branding.logoUrl
  }

  return {
    branding,
    loading,
    getLogoUrl,
    isLogoMode: branding.titleType === 'logo',
  }
}
