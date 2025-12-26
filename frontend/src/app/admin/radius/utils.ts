// Utility functions for RADIUS/NAS management

import { NAS } from './types'

/**
 * Format bytes to human readable string (KB, MB, GB, TB)
 */
export function formatBytes(bytes: number | undefined | null): string {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Format uptime seconds to human readable string (e.g., "5d 3h 25m")
 */
export function formatUptime(seconds: number | undefined | null): string {
    if (!seconds) return 'N/A'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
}

/**
 * Format rate (bytes per second) to human readable string
 */
export function formatRate(bytesPerSecond: number | undefined | null): string {
    if (!bytesPerSecond) return '0 bps'
    const k = 1024
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps']
    // Convert bytes to bits
    const bits = bytesPerSecond * 8
    const i = Math.floor(Math.log(bits) / Math.log(k))
    return parseFloat((bits / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Get status color class for NAS status
 */
export function getStatusColor(status: NAS['status']): string {
    switch (status) {
        case 'online':
            return 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400'
        case 'offline':
            return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400'
        case 'unknown':
        default:
            return 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-700 dark:text-gray-400'
    }
}

/**
 * Get status display info (label and icon key)
 */
export function getStatusInfo(status: NAS['status']): { label: string; iconType: 'success' | 'error' | 'warning' } {
    switch (status) {
        case 'online':
            return { label: 'Online', iconType: 'success' }
        case 'offline':
            return { label: 'Offline', iconType: 'error' }
        case 'unknown':
        default:
            return { label: 'Unknown', iconType: 'warning' }
    }
}

/**
 * Generate random secret string
 */
export function generateSecret(length: number = 10): string {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let result = ''
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
}

/**
 * Format date to locale string
 */
export function formatDate(dateString: string | undefined | null): string {
    if (!dateString) return 'Never'
    try {
        return new Date(dateString).toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    } catch {
        return 'Invalid date'
    }
}

/**
 * Calculate percentage with bounds
 */
export function clampPercentage(value: number): number {
    return Math.min(100, Math.max(0, value))
}

/**
 * Get progress bar color based on percentage
 */
export function getProgressColor(percentage: number): string {
    if (percentage > 80) return 'bg-red-500'
    if (percentage > 60) return 'bg-yellow-500'
    return 'bg-green-500'
}

/**
 * Get interface status badge color
 */
export function getInterfaceStatusColor(status: 'up' | 'down'): string {
    return status === 'up'
        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
}
