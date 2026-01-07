'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import {
  Server,
  Wifi,
  WifiOff,
  AlertCircle,
  Search,
  RefreshCw,
  Settings,
  Activity,
  Signal,
  MapPin,
  Power,
  PowerOff,
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Plus,
  Download,
  Upload,
  Clock,
  Router,
  Cpu,
  HardDrive,
  Filter,
  X
} from 'lucide-react'
import { EditSSIDModal } from './components/EditSSIDModal'
import { DeviceDetailModal } from './components/DeviceDetailModal'
import { DeviceStats } from './components/DeviceStats'
import { GenieACSDevice } from './types'
import { adminApi } from '@/lib/api-clients'

interface DeviceStats {
  total_devices: number
  online_devices: number
  offline_devices: number
  warning_devices: number
  total_customers: number
}

export default function GenieACSPage() {
  const { user } = useAuthStore()
  const [devices, setDevices] = useState<GenieACSDevice[]>([])
  const [stats, setStats] = useState<DeviceStats>({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    warning_devices: 0,
    total_customers: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'warning'>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedDevice, setSelectedDevice] = useState<GenieACSDevice | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showEditSSID, setShowEditSSID] = useState(false)
  const [editForm, setEditForm] = useState({
    ssid: '',
    password: '',
    showPassword: false
  })
  const [editLoading, setEditLoading] = useState(false)

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [genieacsSettings, setGenieacsSettings] = useState({
    genieacs_url: '',
    genieacs_username: '',
    genieacs_password: ''
  })

  const fetchSettings = async () => {
    try {
      const response = await adminApi.get('/api/v1/settings')
      if (response.data.success && response.data.data?.settings) {
        const s = response.data.data.settings
        setGenieacsSettings({
          genieacs_url: s.genieacs_url || '',
          genieacs_username: s.genieacs_username || '',
          genieacs_password: s.genieacs_password || ''
        })
      }
    } catch (err) {
      console.error('Error fetching settings:', err)
    }
  }

  const saveSettings = async () => {
    setSettingsLoading(true)
    try {
      const response = await adminApi.post('/api/v1/settings', {
        settings: genieacsSettings
      })
      if (response.data.success) {
        setShowSettings(false)
        fetchDevices() // Refresh with new settings
      }
    } catch (err) {
      console.error('Error saving settings:', err)
    } finally {
      setSettingsLoading(false)
    }
  }

  const fetchDevices = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        limit: '100',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })
      const response = await adminApi.get(`/api/v1/genieacs/devices?${params}`)

      if (response.data.success) {
        setDevices(response.data.data.devices || [])
        setStats(response.data.data.stats || stats)
      } else {
        setError(response.data.message || 'Failed to load GenieACS devices')
      }
    } catch (err: any) {
      console.error('Error fetching GenieACS devices:', err)
      setError(err.message || 'Failed to load GenieACS devices')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [searchQuery, filterStatus])

  // Auto-refresh every 60 seconds for GenieACS
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchDevices, 60000)
    return () => clearInterval(interval)
  }, [autoRefresh, searchQuery, filterStatus])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchDevices()
  }

  const handleDeviceAction = async (deviceId: string, action: string) => {
    try {
      const response = await adminApi.post('/api/v1/genieacs/action', {
        deviceId,
        action
      })

      if (response.data.success) {
        await fetchDevices() // Refresh devices list
      }
    } catch (err: any) {
      console.error('Error performing device action:', err)
    }
  }

  const handleEditSSID = (device: GenieACSDevice) => {
    setSelectedDevice(device)
    setEditForm({
      ssid: device.ssid || '',
      password: device.password || '',
      showPassword: false
    })
    setShowEditSSID(true)
  }

  const handleSaveSSID = async () => {
    if (!selectedDevice) return

    try {
      setEditLoading(true)
      const response = await adminApi.post('/api/v1/genieacs/edit', {
        id: selectedDevice._id || selectedDevice.id,
        ssid: editForm.ssid || undefined,
        password: editForm.password || undefined
      })

      if (response.data.success) {
        setShowEditSSID(false)
        await fetchDevices() // Refresh devices list
      }
    } catch (error) {
      console.error('Error updating SSID/Password:', error)
    } finally {
      setEditLoading(false)
    }
  }

  const getConnectionStatus = (device: GenieACSDevice) => {
    const lastInform = new Date(device.lastInform)
    const now = new Date()
    const diffMinutes = (now.getTime() - lastInform.getTime()) / (1000 * 60)

    if (diffMinutes > 10) return 'offline'
    if (diffMinutes > 5) return 'warning'
    return 'online'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'connected':
        return 'bg-green-100/60 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
      case 'offline':
      case 'disconnected':
        return 'bg-red-100/60 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
      case 'warning':
        return 'bg-amber-100/60 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
      default:
        return 'bg-gray-100/60 text-gray-800 border-gray-300 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'connected':
        return <Wifi className="h-4 w-4" />
      case 'offline':
      case 'disconnected':
        return <WifiOff className="h-4 w-4" />
      case 'warning':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getSignalStrengthColor = (snr?: string) => {
    if (!snr) return 'text-gray-500'
    const snrValue = parseFloat(snr)
    if (snrValue >= 30) return 'text-green-700'
    if (snrValue >= 20) return 'text-amber-700'
    return 'text-red-700'
  }

  const getAttenuationColor = (attenuation?: string) => {
    if (!attenuation) return 'text-gray-500'
    const attenValue = parseFloat(attenuation)
    if (attenValue <= 20) return 'text-green-700'
    if (attenValue <= 30) return 'text-amber-700'
    return 'text-red-700'
  }

  const filteredDevices = devices.filter(device => {
    const status = getConnectionStatus(device)
    const matchesSearch = !searchQuery ||
      device.serial.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.productClass.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.customer?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.customer?.pppoe_username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.pppoeUsername?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.ssid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      device.tag?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = filterStatus === 'all' || status === filterStatus

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Manajemen Perangkat ACS / TR-069</h1>
          <p className="text-muted-foreground">
            Monitor dan kelola perangkat ONU/ONT melalui ACS / TR-069
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Auto Refresh:</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoRefresh ? 'bg-primary' : 'bg-gray-200'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
          {user?.role === 'admin' && (
            <>
              <Button variant="outline" onClick={() => { fetchSettings(); setShowSettings(true); }}>
                <Settings className="h-4 w-4 mr-2" />
                Setting API
              </Button>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Tambah Device
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <DeviceStats stats={stats} />

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari device (Serial, Model, Customer)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'online' | 'offline' | 'warning')}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">Semua Status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
                <option value="warning">Warning</option>
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Devices List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl font-semibold">
            <div className="flex items-center space-x-2">
              <Server className="h-5 w-5 text-primary" />
              <span>Daftar Perangkat GenieACS</span>
            </div>
          </CardTitle>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <span>{filteredDevices.length} dari {devices.length} perangkat</span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mb-4"></div>
              <h3 className="text-lg font-semibold mb-2">Memuat Data Perangkat</h3>
              <p className="text-muted-foreground">Menghubungkan ke GenieACS server...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-16 w-16 text-destructive mb-4" />
              <h3 className="text-xl font-semibold mb-2">Gagal Memuat Data</h3>
              <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
              <div className="flex space-x-3">
                <Button onClick={fetchDevices} className="min-w-[120px]">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Coba Lagi
                </Button>
                <Button variant="outline" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Server className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Tidak Ada Perangkat</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                {searchQuery || filterStatus !== 'all'
                  ? 'Tidak ada perangkat yang cocok dengan kriteria pencarian atau filter. Coba ubah kriteria Anda.'
                  : 'Belum ada perangkat yang terdaftar di sistem GenieACS.'
                }
              </p>
              {(searchQuery || filterStatus !== 'all') && (
                <Button variant="outline" onClick={() => {
                  setSearchQuery('')
                  setFilterStatus('all')
                }}>
                  <Filter className="h-4 w-4 mr-2" />
                  Reset Filter
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Modern Device Cards for Mobile */}
              <div className="block lg:hidden space-y-4">
                {filteredDevices.map((device, index) => {
                  const status = getConnectionStatus(device)
                  return (
                    <Card key={device._id || device.id} className="border-l-4 border-l-primary hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-primary">{index + 1}</span>
                            </div>
                            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                              {getStatusIcon(status)}
                              <span className="ml-1 capitalize">{status}</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDevice(device)
                              setShowDetails(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">PPPoE Username:</span>
                            <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                              {device.pppoeUsername || '-'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">SSID:</span>
                            <span className="text-sm">{device.ssid || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">User Konek:</span>
                            <div className="flex items-center space-x-1">
                              <Wifi className="h-3 w-3 text-blue-600" />
                              <span className="text-sm font-semibold text-blue-700">
                                {device.userKonek || '0'}
                              </span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">Nomor Pelanggan:</span>
                            <span className="text-sm font-mono">{device.tag || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">RX Power:</span>
                            <div className={`font-semibold ${device.rxPower && parseFloat(device.rxPower.toString()) < -25
                              ? 'text-red-700'
                              : device.rxPower && parseFloat(device.rxPower.toString()) < -20
                                ? 'text-amber-700'
                                : 'text-green-700'
                              }`}>
                              <Signal className="inline h-3 w-3 mr-1" />
                              {device.rxPower ? `${device.rxPower} dBm` : '-'}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t flex items-center justify-between">
                          <div className="text-xs text-muted-foreground">
                            {device.serialNumber && (
                              <span className="font-mono">{device.serialNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedDevice(device)
                                setShowDetails(true)
                              }}
                              className="h-8 px-3"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Detail
                            </Button>
                            {user?.role === 'admin' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditSSID(device)}
                                  className="h-8 px-3"
                                >
                                  <Edit className="h-3 w-3 mr-1" />
                                  Edit SSID
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeviceAction(device._id || device.id, 'reboot')}
                                  className="h-8 px-3"
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Restart
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap">No</th>
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap min-w-[120px]">PPPoE Username</th>
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap min-w-[120px]">SSID</th>
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap text-center">User Konek</th>
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap min-w-[120px]">Nomor Pelanggan</th>
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap text-center">RX Power</th>
                          <th className="text-left p-2 px-3 text-sm font-semibold text-foreground whitespace-nowrap text-center min-w-[140px]">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredDevices.map((device, index) => {
                          const status = getConnectionStatus(device)

                          return (
                            <tr key={device._id || device.id} className="hover:bg-muted/30 transition-colors">
                              <td className="p-2 px-3">
                                <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-semibold text-primary">{index + 1}</span>
                                </div>
                              </td>
                              <td className="p-2 px-3">
                                <div className="font-mono text-xs font-medium bg-muted px-1.5 py-0.5 rounded border">
                                  {device.pppoeUsername || '-'}
                                </div>
                              </td>
                              <td className="p-2 px-3">
                                <div className="flex items-center space-x-1">
                                  <Wifi className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs font-medium">{device.ssid || '-'}</span>
                                </div>
                              </td>
                              <td className="p-2 px-3 text-center">
                                <div className="flex items-center space-x-1 text-blue-700">
                                  <Wifi className="h-3 w-3" />
                                  <span className="text-xs">{device.userKonek || '0'}</span>
                                </div>
                              </td>
                              <td className="p-2 px-3">
                                <span className="font-mono text-xs">{device.tag || '-'}</span>
                              </td>
                              <td className="p-2 px-3 text-center">
                                <div className={`flex items-center space-x-1 ${device.rxPower && parseFloat(device.rxPower.toString()) < -25
                                  ? 'text-red-700'
                                  : device.rxPower && parseFloat(device.rxPower.toString()) < -20
                                    ? 'text-amber-700'
                                    : 'text-green-700'
                                  }`}>
                                  <Signal className="h-3 w-3" />
                                  <span className="text-xs">{device.rxPower ? `${device.rxPower} dBm` : '-'}</span>
                                </div>
                              </td>
                              <td className="p-2 px-3">
                                <div className="flex items-center justify-center space-x-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedDevice(device)
                                      setShowDetails(true)
                                    }}
                                    className="h-6 px-2"
                                    title="Lihat Detail"
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Detail
                                  </Button>
                                  {user?.role === 'admin' && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEditSSID(device)}
                                        className="h-6 px-2"
                                        title="Edit SSID & Password"
                                      >
                                        <Edit className="h-3 w-3 mr-1" />
                                        Edit SSID
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDeviceAction(device._id || device.id, 'reboot')}
                                        className="h-6 px-2"
                                        title="Restart ONU"
                                      >
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                        Restart
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Summary Info */}
              <div className="mt-6 p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Menampilkan {filteredDevices.length} dari {devices.length} perangkat
                  </span>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-muted-foreground">Online: {stats.online_devices}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span className="text-muted-foreground">Warning: {stats.warning_devices}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-muted-foreground">Offline: {stats.offline_devices}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Device Details Modal */}
      {showDetails && selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
        />
      )}

      {/* Edit SSID Modal */}
      {showEditSSID && selectedDevice && (
        <EditSSIDModal
          device={selectedDevice}
          isOpen={showEditSSID}
          onClose={() => setShowEditSSID(false)}
          onSave={handleSaveSSID}
          loading={editLoading}
        />
      )}

      {/* GenieACS Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Pengaturan GenieACS API</h3>
              <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">GenieACS URL</label>
                <Input
                  value={genieacsSettings.genieacs_url}
                  onChange={(e) => setGenieacsSettings({ ...genieacsSettings, genieacs_url: e.target.value })}
                  placeholder="http://your-genieacs:7557"
                />
                <p className="text-xs text-muted-foreground mt-1">URL server GenieACS (NBI API port 7557)</p>
              </div>
              <div>
                <label className="text-sm font-medium">Username</label>
                <Input
                  value={genieacsSettings.genieacs_username}
                  onChange={(e) => setGenieacsSettings({ ...genieacsSettings, genieacs_username: e.target.value })}
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  value={genieacsSettings.genieacs_password}
                  onChange={(e) => setGenieacsSettings({ ...genieacsSettings, genieacs_password: e.target.value })}
                  placeholder="Password"
                />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setShowSettings(false)}>
                  Batal
                </Button>
                <Button onClick={saveSettings} disabled={settingsLoading}>
                  {settingsLoading ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}