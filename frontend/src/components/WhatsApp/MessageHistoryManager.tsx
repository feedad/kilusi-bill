'use client'

import React, { useState, useEffect } from 'react'
import { whatsappAPI } from '@/lib/whatsapp-api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Database,
  AlertTriangle,
  Trash2,
  Clean,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react'

interface MessageHistoryStats {
  totalMessages: number
  sentMessages: number
  failedMessages: number
  activeMessages: number
  scheduledMessages: number
  oldestMessage: string
  newestMessage: string
  storageLevel: 'normal' | 'caution' | 'warning' | 'critical'
  warningMessage?: string
  needsCleanup: boolean
  limits: {
    max: number
    warning: number
    critical: number
  }
  storagePercentage: number
}

interface MessageHistoryManagerProps {
  onCleanupComplete?: () => void
  compact?: boolean
}

export default function MessageHistoryManager({
  onCleanupComplete,
  compact = false
}: MessageHistoryManagerProps) {
  const [stats, setStats] = useState<MessageHistoryStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [cleaning, setCleaning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await whatsappAPI.getMessageHistoryStats()

      if (response.success && response.data) {
        setStats(response.data)
      } else {
        setError(response.message || 'Failed to fetch message history stats')
      }
    } catch (err) {
      setError('Error fetching message history statistics')
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCleanup = async (keepCount: number = 500) => {
    if (!confirm(`Are you sure you want to clean up old messages? Only the most recent ${keepCount} messages will be kept.`)) {
      return
    }

    try {
      setCleaning(true)
      setError(null)

      const response = await whatsappAPI.cleanupMessageHistory(keepCount)

      if (response.success && response.data) {
        console.log(`✅ Cleanup completed: ${response.data.deletedCount} messages deleted`)

        // Refresh stats
        await fetchStats()

        // Notify parent component
        if (onCleanupComplete) {
          onCleanupComplete()
        }

        // Show success message
        alert(`Successfully cleaned up ${response.data.deletedCount} old messages. ${response.data.keptCount} messages remain.`)
      } else {
        setError(response.message || 'Failed to cleanup message history')
      }
    } catch (err) {
      setError('Error cleaning up message history')
      console.error('Error during cleanup:', err)
    } finally {
      setCleaning(false)
    }
  }

  const handleClearAll = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL message history. This action cannot be undone. Are you absolutely sure?')) {
      return
    }

    try {
      setCleaning(true)
      setError(null)

      const response = await whatsappAPI.clearAllMessageHistory()

      if (response.success && response.data) {
        console.log(`✅ All history cleared: ${response.data.deletedCount} messages deleted`)

        // Refresh stats
        await fetchStats()

        // Notify parent component
        if (onCleanupComplete) {
          onCleanupComplete()
        }

        // Show success message
        alert(`Successfully cleared all message history. ${response.data.deletedCount} messages were deleted.`)
      } else {
        setError(response.message || 'Failed to clear message history')
      }
    } catch (err) {
      setError('Error clearing message history')
      console.error('Error during clear all:', err)
    } finally {
      setCleaning(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  if (loading) {
    return (
      <Card className={compact ? "p-4" : ""}>
        <CardContent className="flex items-center justify-center p-6">
          <Database className="h-5 w-5 animate-spin mr-2" />
          Loading message history statistics...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!stats) {
    return null
  }

  const getStorageColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      case 'warning': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'caution': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default: return 'text-green-600 bg-green-50 border-green-200'
    }
  }

  const getStorageIcon = (level: string) => {
    switch (level) {
      case 'critical': return <AlertTriangle className="h-4 w-4" />
      case 'warning': return <AlertCircle className="h-4 w-4" />
      case 'caution': return <Info className="h-4 w-4" />
      default: return <CheckCircle className="h-4 w-4" />
    }
  }

  return (
    <Card className={compact ? "p-4" : ""}>
      {!compact && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Message History Management
          </CardTitle>
          <CardDescription>
            Monitor and manage WhatsApp message history storage
          </CardDescription>
        </CardHeader>
      )}

      <CardContent className="space-y-4">
        {/* Storage Status */}
        <div className={`p-3 rounded-lg border ${getStorageColor(stats.storageLevel)}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getStorageIcon(stats.storageLevel)}
              <span className="font-medium">
                Storage Level: {stats.storageLevel.toUpperCase()}
              </span>
            </div>
            <Badge variant="outline">
              {stats.totalMessages}/{stats.limits.max}
            </Badge>
          </div>

          <Progress
            value={stats.storagePercentage}
            className="mb-2"
          />

          <div className="text-sm text-gray-600">
            {stats.storagePercentage}% storage capacity used
          </div>

          {stats.warningMessage && (
            <div className="mt-2 text-sm">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              {stats.warningMessage}
            </div>
          )}
        </div>

        {/* Statistics */}
        {!compact && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="font-semibold text-lg">{stats.totalMessages}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="font-semibold text-lg text-green-600">{stats.sentMessages}</div>
              <div className="text-sm text-gray-600">Sent</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="font-semibold text-lg text-red-600">{stats.failedMessages}</div>
              <div className="text-sm text-gray-600">Failed</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="font-semibold text-lg text-blue-600">{stats.activeMessages}</div>
              <div className="text-sm text-gray-600">Active</div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {stats.needsCleanup && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCleanup(500)}
                disabled={cleaning}
                className="flex items-center gap-2"
              >
                <Clean className="h-4 w-4" />
                Keep Latest 500
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCleanup(800)}
                disabled={cleaning}
                className="flex items-center gap-2"
              >
                <Clean className="h-4 w-4" />
                Keep Latest 800
              </Button>
            </>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={handleClearAll}
            disabled={cleaning}
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Clear All History
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {cleaning && (
          <div className="text-sm text-blue-600">
            <Database className="inline h-4 w-4 animate-spin mr-1" />
            Cleaning up message history...
          </div>
        )}
      </CardContent>
    </Card>
  )
}