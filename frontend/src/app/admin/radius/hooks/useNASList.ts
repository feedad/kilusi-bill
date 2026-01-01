'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '@/lib/api-clients'
import { NAS, NASGroup, SNMPStats, NASFormData, DEFAULT_FORM_DATA } from '../types'

interface UseNASListReturn {
    nasList: NAS[]
    nasGroups: NASGroup[]
    snmpStats: { [key: string]: SNMPStats }
    loading: boolean
    error: string | null
    testLoading: { [key: string]: boolean }
    fetchNAS: () => Promise<void>
    createNAS: (data: NASFormData) => Promise<boolean>
    updateNAS: (id: string, data: NASFormData) => Promise<boolean>
    deleteNAS: (id: string) => Promise<boolean>
    deleteMultipleNAS: (ids: string[]) => Promise<boolean>
    testConnection: (id: string) => Promise<{ success: boolean; message?: string }>
    bulkAction: (ids: string[], action: 'activate' | 'deactivate') => Promise<boolean>
}

export function useNASList(): UseNASListReturn {
    const [nasList, setNasList] = useState<NAS[]>([])
    const [nasGroups, setNasGroups] = useState<NASGroup[]>([])
    const [snmpStats, setSnmpStats] = useState<{ [key: string]: SNMPStats }>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [testLoading, setTestLoading] = useState<{ [key: string]: boolean }>({})

    const fetchNAS = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await adminApi.get('/api/v1/radius/nas')
            if (response.data.success) {
                setNasList(response.data.data.nas || [])
                setSnmpStats(response.data.data.snmpStats || {})
                if (response.data.data.groups) {
                    setNasGroups(response.data.data.groups || [])
                }
            } else {
                setError(response.data.message || 'Failed to load NAS list')
            }
        } catch (err: any) {
            console.error('Error fetching NAS:', err)
            setError(err.message || 'Failed to load NAS list')
        } finally {
            setLoading(false)
        }
    }, [])

    const createNAS = useCallback(async (data: NASFormData): Promise<boolean> => {
        try {
            const payload: any = {
                shortname: data.shortname,
                nasname: data.nasname,
                secret: data.secret,
                type: data.type,
                description: data.description,
                priority: data.priority || 1,
                snmp_enabled: data.snmp_enabled
            }

            if (data.snmp_enabled) {
                payload.snmp_community = data.snmp_community
                payload.snmp_community_trap = data.snmp_community_trap
                payload.snmp_version = data.snmp_version
                payload.snmp_port = data.snmp_port

                if (data.snmp_version === '3') {
                    payload.snmp_username = data.snmp_username
                    payload.snmp_auth_protocol = data.snmp_auth_protocol
                    payload.snmp_auth_password = data.snmp_auth_password
                    payload.snmp_priv_protocol = data.snmp_priv_protocol
                    payload.snmp_priv_password = data.snmp_priv_password
                    payload.snmp_security_level = data.snmp_security_level
                }
            }

            await adminApi.post('/api/v1/radius/nas', payload)
            await fetchNAS()
            return true
        } catch (err: any) {
            console.error('Error creating NAS:', err)
            throw new Error(err.response?.data?.message || 'Failed to create NAS')
        }
    }, [fetchNAS])

    const updateNAS = useCallback(async (id: string, data: NASFormData): Promise<boolean> => {
        try {
            const payload: any = {
                shortname: data.shortname,
                nasname: data.nasname,
                secret: data.secret,
                type: data.type,
                description: data.description,
                priority: data.priority || 1,
                snmp_enabled: data.snmp_enabled
            }

            if (data.snmp_enabled) {
                payload.snmp_community = data.snmp_community
                payload.snmp_community_trap = data.snmp_community_trap
                payload.snmp_version = data.snmp_version
                payload.snmp_port = data.snmp_port

                if (data.snmp_version === '3') {
                    payload.snmp_username = data.snmp_username
                    payload.snmp_auth_protocol = data.snmp_auth_protocol
                    payload.snmp_auth_password = data.snmp_auth_password
                    payload.snmp_priv_protocol = data.snmp_priv_protocol
                    payload.snmp_priv_password = data.snmp_priv_password
                    payload.snmp_security_level = data.snmp_security_level
                }
            }

            await adminApi.put(`/api/v1/radius/nas/${id}`, payload)
            await fetchNAS()
            return true
        } catch (err: any) {
            console.error('Error updating NAS:', err)
            throw new Error(err.response?.data?.message || 'Failed to update NAS')
        }
    }, [fetchNAS])

    const deleteNAS = useCallback(async (id: string): Promise<boolean> => {
        try {
            await adminApi.delete(`/api/v1/radius/nas/${id}`)
            await fetchNAS()
            return true
        } catch (err: any) {
            console.error('Error deleting NAS:', err)
            throw new Error(err.response?.data?.message || 'Failed to delete NAS')
        }
    }, [fetchNAS])

    const deleteMultipleNAS = useCallback(async (ids: string[]): Promise<boolean> => {
        try {
            await Promise.all(ids.map(id => adminApi.delete(`/api/v1/radius/nas/${id}`)))
            await fetchNAS()
            return true
        } catch (err: any) {
            console.error('Error deleting NAS:', err)
            throw new Error(err.response?.data?.message || 'Failed to delete NAS')
        }
    }, [fetchNAS])

    const testConnection = useCallback(async (id: string): Promise<{ success: boolean; message?: string }> => {
        try {
            setTestLoading(prev => ({ ...prev, [id]: true }))
            const response = await adminApi.post(`/api/v1/radius/nas/${id}/test`)
            await fetchNAS() // Refresh to get updated status
            return {
                success: response.data.success,
                message: response.data.data?.test_results?.radius?.message || 'Test completed'
            }
        } catch (err: any) {
            console.error('Error testing connection:', err)
            return {
                success: false,
                message: err.response?.data?.message || 'Connection test failed'
            }
        } finally {
            setTestLoading(prev => ({ ...prev, [id]: false }))
        }
    }, [fetchNAS])

    const bulkAction = useCallback(async (ids: string[], action: 'activate' | 'deactivate'): Promise<boolean> => {
        try {
            const isActive = action === 'activate'
            await Promise.all(
                ids.map(id => adminApi.put(`/api/v1/radius/nas/${id}`, { is_active: isActive }))
            )
            await fetchNAS()
            return true
        } catch (err: any) {
            console.error('Error performing bulk action:', err)
            throw new Error(err.response?.data?.message || 'Bulk action failed')
        }
    }, [fetchNAS])

    // Initial fetch
    useEffect(() => {
        fetchNAS()
    }, [fetchNAS])

    return {
        nasList,
        nasGroups,
        snmpStats,
        loading,
        error,
        testLoading,
        fetchNAS,
        createNAS,
        updateNAS,
        deleteNAS,
        deleteMultipleNAS,
        testConnection,
        bulkAction
    }
}
