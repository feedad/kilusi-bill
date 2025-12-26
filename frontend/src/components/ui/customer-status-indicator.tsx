'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Wifi, WifiOff, AlertTriangle, Loader2, Signal, SignalLow, SignalMedium } from 'lucide-react'

export type CustomerStatus = 'online' | 'offline' | 'warning' | 'unknown' | 'loading'

interface CustomerStatusIndicatorProps {
  status: CustomerStatus
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  className?: string
  lastSeen?: string
  signalStrength?: number
  animated?: boolean
}

export function CustomerStatusIndicator({
  status,
  size = 'md',
  showLabel = false,
  className,
  lastSeen,
  signalStrength,
  animated = true
}: CustomerStatusIndicatorProps) {
  // Enhanced status configurations
  const statusConfig = {
    online: {
      color: 'bg-green-500',
      textColor: 'text-green-700 dark:text-green-400',
      borderColor: 'border-green-500',
      icon: Wifi,
      label: 'Online',
      description: 'Pelanggan sedang terhubung'
    },
    offline: {
      color: 'bg-red-500',
      textColor: 'text-red-700 dark:text-red-400',
      borderColor: 'border-red-500',
      icon: WifiOff,
      label: 'Offline',
      description: 'Pelanggan tidak terhubung'
    },
    warning: {
      color: 'bg-yellow-500',
      textColor: 'text-yellow-700 dark:text-yellow-400',
      borderColor: 'border-yellow-500',
      icon: AlertTriangle,
      label: 'Warning',
      description: 'Koneksi pelanggan bermasalah'
    },
    unknown: {
      color: 'bg-gray-400',
      textColor: 'text-foreground',
      borderColor: 'border-gray-400',
      icon: WifiOff,
      label: 'Unknown',
      description: 'Status tidak diketahui'
    },
    loading: {
      color: 'bg-blue-500',
      textColor: 'text-blue-700 dark:text-blue-400',
      borderColor: 'border-blue-500',
      icon: Loader2,
      label: 'Loading',
      description: 'Memeriksa status...'
    }
  }

  const config = statusConfig[status] || statusConfig.unknown

  // Helper functions for signal strength and formatting
  const getSignalIcon = (signalStrength?: number) => {
    if (!signalStrength) return Wifi
    if (signalStrength >= 75) return Signal
    if (signalStrength >= 50) return SignalMedium
    if (signalStrength >= 25) return SignalLow
    return WifiOff
  }

  const formatLastSeen = (lastSeen?: string): string => {
    if (!lastSeen) return 'Tidak pernah online'
    const lastSeenDate = new Date(lastSeen)
    const now = new Date()
    const diffMs = now.getTime() - lastSeenDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Baru saja'
    if (diffMins < 60) return `${diffMins} menit yang lalu`
    if (diffHours < 24) return `${diffHours} jam yang lalu`
    return `${diffDays} hari yang lalu`
  }

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm':
        return 'w-2 h-2'
      case 'md':
        return 'w-3 h-3'
      case 'lg':
        return 'w-4 h-4'
      default:
        return 'w-3 h-3'
    }
  }

  const getLabelSizeClasses = (size: string) => {
    switch (size) {
      case 'sm':
        return 'text-xs'
      case 'md':
        return 'text-sm'
      case 'lg':
        return 'text-base'
      default:
        return 'text-sm'
    }
  }

  const Icon = status === 'online' && signalStrength ? getSignalIcon(signalStrength) : config.icon

  return (
    <div className={cn('flex items-center gap-2 group relative', className)}>
      {/* Status indicator dot */}
      <div className="relative flex items-center">
        <div
          className={cn(
            'rounded-full',
            config.color,
            getSizeClasses(size),
            animated && status === 'online' && 'animate-pulse'
          )}
        />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className={cn('text-white animate-spin', getLabelSizeClasses(size))} />
          </div>
        )}
      </div>

      {/* Icon */}
      <Icon
        className={cn(
          config.textColor,
          getLabelSizeClasses(size),
          status === 'loading' && 'animate-spin'
        )}
      />

      {/* Label */}
      {showLabel && (
        <div className="flex flex-col">
          <span className={cn('font-medium', config.textColor, getLabelSizeClasses(size))}>
            {config.label}
          </span>
          {lastSeen && (
            <span className="text-xs text-muted-foreground">
              {formatLastSeen(lastSeen)}
            </span>
          )}
        </div>
      )}

      {/* Tooltip */}
      <div className="hidden group-hover:block absolute z-10 bg-gray-900 text-white text-xs rounded-lg px-2 py-1 -top-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
        {config.description}
        {signalStrength && (
          <span className="block">Signal: {signalStrength}%</span>
        )}
        {lastSeen && (
          <span className="block">Last seen: {formatLastSeen(lastSeen)}</span>
        )}
      </div>
    </div>
  )
}

interface CustomerStatusBadgeProps {
  status: CustomerStatus
  customerName: string
  lastSeen?: string
  signalStrength?: number
  className?: string
}

export function CustomerStatusBadge({
  status,
  customerName,
  lastSeen,
  signalStrength,
  className
}: CustomerStatusBadgeProps) {
  const getSignalStrengthColor = (strength: number) => {
    if (strength >= 70) return 'text-green-600'
    if (strength >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getSignalStrengthIcon = (strength: number) => {
    if (strength >= 70) return '●●●'
    if (strength >= 40) return '●●○'
    return '●○○'
  }

  return (
    <div className={cn('bg-card rounded-lg border p-3 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CustomerStatusIndicator status={status} size="md" />
          <div>
            <p className="font-medium text-foreground">{customerName}</p>
            <p className="text-xs text-muted-foreground">
              {lastSeen ? `Last seen: ${new Date(lastSeen).toLocaleString()}` : 'Never seen'}
            </p>
          </div>
        </div>
        {signalStrength !== undefined && (
          <div className="text-right">
            <div className={cn('text-sm font-medium', getSignalStrengthColor(signalStrength))}>
              {getSignalStrengthIcon(signalStrength)}
            </div>
            <p className="text-xs text-muted-foreground">{signalStrength}%</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface CustomerStatusGridProps {
  customers: Array<{
    id: string
    name: string
    status: CustomerStatus
    lastSeen?: string
    signalStrength?: number
    ipAddress?: string
    planName?: string
  }>
  className?: string
}

export function CustomerStatusGrid({ customers, className }: CustomerStatusGridProps) {
  const onlineCount = customers.filter(c => c.status === 'online').length
  const totalCount = customers.length
  const onlinePercentage = totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0

  return (
    <div className={cn('space-y-4', className)}>
      <div className="bg-card rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Customer Status Overview</h3>
          <div className="flex items-center gap-2">
            <CustomerStatusIndicator status="online" size="sm" showLabel={false} />
            <span className="text-sm text-muted-foreground">
              {onlineCount}/{totalCount} Online ({onlinePercentage}%)
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {customers.map((customer) => (
          <CustomerStatusBadge
            key={customer.id}
            status={customer.status}
            customerName={customer.name}
            lastSeen={customer.lastSeen}
            signalStrength={customer.signalStrength}
          />
        ))}
      </div>
    </div>
  )
}

// Compact customer status for inline usage
interface CustomerStatusCompactProps {
  status: CustomerStatus
  customerName: string
  signalStrength?: number
  lastSeen?: string
  className?: string
  onClick?: () => void
}

export function CustomerStatusCompact({
  status,
  customerName,
  signalStrength,
  lastSeen,
  className,
  onClick
}: CustomerStatusCompactProps) {
  const statusConfig = {
    online: 'border-green-500/20 bg-green-500/10',
    offline: 'border-red-500/20 bg-red-500/10',
    warning: 'border-yellow-500/20 bg-yellow-500/10',
    unknown: 'border-muted bg-muted',
    loading: 'border-blue-500/20 bg-blue-500/10'
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md',
        statusConfig[status],
        className
      )}
      onClick={onClick}
    >
      <CustomerStatusIndicator
        status={status}
        size="sm"
        signalStrength={signalStrength}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {customerName}
        </p>
        <p className="text-xs text-muted-foreground">
          {lastSeen ? new Date(lastSeen).toLocaleDateString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
          }) : 'Never seen'}
        </p>
      </div>

      {signalStrength !== undefined && (
        <div className="text-right">
          <div className="flex items-center gap-1">
            <Signal className={cn(
              'w-3 h-3',
              signalStrength >= 70 ? 'text-green-600 dark:text-green-400' :
              signalStrength >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
            )} />
            <span className="text-xs font-medium">{signalStrength}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Status legend component
interface CustomerStatusLegendProps {
  className?: string
}

export function CustomerStatusLegend({ className }: CustomerStatusLegendProps) {
  const statuses: CustomerStatus[] = ['online', 'offline', 'warning', 'unknown']

  return (
    <div className={cn('flex items-center gap-4 flex-wrap', className)}>
      {statuses.map((status) => (
        <div key={status} className="flex items-center gap-2">
          <CustomerStatusIndicator status={status} size="sm" />
          <span className="text-sm text-muted-foreground capitalize">{status}</span>
        </div>
      ))}
    </div>
  )
}