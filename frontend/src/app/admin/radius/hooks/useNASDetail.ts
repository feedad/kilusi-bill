'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { adminApi } from '@/lib/api-clients'
import { SNMPDetail } from '../types'

interface UseNASDetailReturn {
    detail: SNMPDetail | null
    loading: boolean
    error: string | null
    refresh: () => Promise<void>
    silentRefresh: () => Promise<void>  // No loading indicator
}

export function useNASDetail(nasId: string | null): UseNASDetailReturn {
    const [detail, setDetail] = useState<SNMPDetail | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const isFetchingRef = useRef(false)

    const fetchDetail = useCallback(async (id: string, silent = false) => {
        // Prevent concurrent fetches
        if (isFetchingRef.current) return
        isFetchingRef.current = true

        try {
            if (!silent) {
                setLoading(true)
            }
            setError(null)
            const response = await adminApi.get(`/api/v1/radius/nas/${id}/snmp-detail`)
            if (response.data.success) {
                setDetail(response.data.data)
            } else {
                setError(response.data.message || 'Failed to fetch SNMP details')
                if (!silent) setDetail(null)
            }
        } catch (err: any) {
            console.error('Error fetching NAS detail:', err)
            if (!silent) {
                setError(err.message || 'Failed to fetch SNMP details')
                setDetail(null)
            }
        } finally {
            if (!silent) {
                setLoading(false)
            }
            isFetchingRef.current = false
        }
    }, [])

    const refresh = useCallback(async () => {
        if (nasId) {
            await fetchDetail(nasId, false)
        }
    }, [nasId, fetchDetail])

    // Silent refresh - updates data without showing loading indicator
    const silentRefresh = useCallback(async () => {
        if (nasId) {
            await fetchDetail(nasId, true)
        }
    }, [nasId, fetchDetail])

    useEffect(() => {
        if (nasId) {
            fetchDetail(nasId)
        } else {
            setDetail(null)
            setError(null)
        }
    }, [nasId, fetchDetail])

    return {
        detail,
        loading,
        error,
        refresh,
        silentRefresh
    }
}
