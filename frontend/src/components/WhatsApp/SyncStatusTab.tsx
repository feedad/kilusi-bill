'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Users, CheckCircle, AlertCircle, Clock, RefreshCw, Settings, Database, History, Activity } from 'lucide-react'
import { CONFIG } from '@/lib/config'

interface SyncStatus {
  enabled: boolean
  schedule: string
  last_sync: {
    synced: number
    failed: number
    started_at: string | null
    completed_at: string | null
    status: string
  } | null
  statistics: {
    total_syncs: number
    total_synced: number
    total_failed: number
    total_customers: number
  }
}

interface SyncHistory {
  id: number
  synced: number
  failed: number
  started_at: string
  completed_at: string | null
  status: string
  error_message: string | null
}

export default function SyncStatusTab() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [history, setHistory] = useState<SyncHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [autoSync, setAutoSync] = useState(false)

  const fetchSyncStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat/sync-status`)
      const data = await response.json()

      if (data.success) {
        setSyncStatus(data.data)
        setAutoSync(data.data.enabled)
      }
    } catch (error) {
      console.error('Error fetching sync status:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat/sync-history?limit=10`)
      const data = await response.json()

      if (data.success) {
        setHistory(data.data)
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat/sync-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      const data = await response.json()

      if (data.success) {
        // Refresh status after sync
        setTimeout(() => {
          fetchSyncStatus()
          fetchHistory()
        }, 1000)
      }
    } catch (error) {
      console.error('Error syncing:', error)
    } finally {
      setSyncing(false)
    }
  }

  const toggleAutoSync = async (enabled: boolean) => {
    try {
      await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_enabled: enabled })
      })

      setAutoSync(enabled)
      fetchSyncStatus()
    } catch (error) {
      console.error('Error toggling auto sync:', error)
    }
  }

  useEffect(() => {
    fetchSyncStatus()
    fetchHistory()

    // Auto refresh every 30 seconds
    const interval = setInterval(() => {
      fetchSyncStatus()
      fetchHistory()
    }, 30000)

    return () => clearInterval(interval)
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Selesai</Badge>
      case 'running':
        return <Badge variant="secondary"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Berjalan</Badge>
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Gagal</Badge>
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{status}</Badge>
    }
  }

  if (loading || !syncStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  const successRate = syncStatus.statistics.total_synced > 0
    ? Math.round((syncStatus.statistics.total_synced / (syncStatus.statistics.total_synced + syncStatus.statistics.total_failed)) * 100)
    : 0

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Pelanggan</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Users className="w-5 h-5" />
              {syncStatus.statistics.total_customers}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Total Disinkron</CardDescription>
            <CardTitle className="text-2xl text-green-600 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              {syncStatus.statistics.total_synced}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Gagal</CardDescription>
            <CardTitle className="text-2xl text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {syncStatus.statistics.total_failed}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Success Rate</CardDescription>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Activity className="w-5 h-5" />
              {successRate}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={successRate} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Sync Controls */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Sinkronisasi Kontak
              </CardTitle>
              <CardDescription>
                Kelola sinkronisasi pelanggan ke Omnichat
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="auto-sync"
                  checked={autoSync}
                  onCheckedChange={toggleAutoSync}
                />
                <Label htmlFor="auto-sync" className="text-sm">
                  Auto Sync ({syncStatus.schedule})
                </Label>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Last Sync Status */}
            {syncStatus.last_sync && (
              <Alert>
                <RefreshCw className="w-4 h-4" />
                <AlertDescription className="ml-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">Sinkronisasi Terakhir: </span>
                      {syncStatus.last_sync.completed_at
                        ? new Date(syncStatus.last_sync.completed_at).toLocaleString('id-ID')
                        : 'Sedang berjalan...'}
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(syncStatus.last_sync.status)}
                      <span className="text-sm">
                        {syncStatus.last_sync.synced} berhasil
                        {syncStatus.last_sync.failed > 0 && `, ${syncStatus.last_sync.failed} gagal`}
                      </span>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSync}
                disabled={syncing}
                className="flex-1"
              >
                {syncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Menyinkronkan...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sinkronkan Sekarang
                  </>
                )}
              </Button>
              <Button
                onClick={() => {
                  fetchSyncStatus()
                  fetchHistory()
                }}
                variant="outline"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Riwayat Sinkronisasi
          </CardTitle>
          <CardDescription>
            10 sinkronisasi terakhir
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada riwayat sinkronisasi
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {getStatusBadge(item.status)}
                    <div>
                      <div className="font-medium">
                        {item.synced} kontak berhasil
                        {item.failed > 0 && ` (${item.failed} gagal)`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(item.started_at).toLocaleString('id-ID')}
                        {item.completed_at && ` - ${new Date(item.completed_at).toLocaleString('id-ID')}`}
                      </div>
                    </div>
                  </div>
                  {item.error_message && (
                    <Badge variant="destructive" className="text-xs">
                      {item.error_message}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
