import { useEffect, useState } from 'react'

/**
 * Simple auth guard hook
 * Checks if user session is valid by trying an API endpoint
 * Returns { loading, isAuthenticated, error }
 */
export function useAuth() {
  const [state, setState] = useState({ loading: true, isAuthenticated: false, error: null })

  useEffect(() => {
    let ignore = false
    
    async function checkAuth() {
      try {
        // Try to fetch a protected endpoint to verify session
        const res = await fetch('/admin/snmp/devices/json', { 
          credentials: 'include',
          method: 'GET'
        })
        
        // If redirect to login, not authenticated
        if (res.redirected && res.url.includes('/admin/login')) {
          if (!ignore) setState({ loading: false, isAuthenticated: false, error: 'Not authenticated' })
          return
        }
        
        // If 401/403, not authenticated
        if (res.status === 401 || res.status === 403) {
          if (!ignore) setState({ loading: false, isAuthenticated: false, error: 'Unauthorized' })
          return
        }
        
        // Otherwise assume authenticated
        if (!ignore) setState({ loading: false, isAuthenticated: true, error: null })
        
      } catch (e) {
        if (!ignore) setState({ loading: false, isAuthenticated: false, error: e.message })
      }
    }
    
    checkAuth()
    return () => { ignore = true }
  }, [])

  return state
}
