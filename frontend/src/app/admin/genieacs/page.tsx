'use client'

import { useState, useEffect } from 'react'
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
import { api, endpoints } from '@/lib/api'

interface GenieACSDevice {
  _id: string
  id: string
  serial: string
  serialNumber: string
  productClass: string
  model: string
  manufacturer: string
  oui: string
  lastInform: string
  connectionState: 'connected' | 'disconnected' | 'unknown'
  parameters?: {
    InternetGatewayDevice?: {
      DeviceInfo?: {
        ManufacturerOUI?: string
        SerialNumber?: string
        HardwareVersion?: string
        SoftwareVersion?: string
        ModelName?: string
      }
      LANDevice?: {
        '1'?: {
          WLANConfiguration?: {
            '1'?: {
              SSID?: { _value?: string }
              KeyPassphrase?: { _value?: string }
              TotalAssociations?: { _value?: string | number }
            }
            '2'?: {
              SSID?: { _value?: string }
              KeyPassphrase?: { _value?: string }
            }
          }
          Hosts?: {
            Host?: Array<{
              IPAddress?: string
              MACAddress?: string
              HostName?: string
              Layer2Interface?: string
            }>
          }
        }
      }
      WANDevice?: {
        '1'?: {
          WANConnectionDevice?: {
            '1'?: {
              WANPPPConnection?: {
                '1'?: {
                  Username?: { _value?: string }
                }
              }
              X_BROADCOM_COM_IfStatus?: string
              X_BROADCOM_COM_LineRate?: string
              X_BROADCOM_COM_Attenuation?: string
              X_BROADCOM_COM_SNRMargin?: string
              ExternalIPAddress?: string
              MACAddress?: string
            }
          }
          WANPONInterfaceConfig?: {
            RXPower?: { _value?: string | number }
          }
        }
      }
    }
    VirtualParameters?: {
      pppoeUsername?: string
      RXPower?: string | number
      SSID?: string
      redaman?: string | number
    }
  }
  Tags?: string[]
  _tags?: string[]
  tags?: string[]
  location?: {
    lat: number
    lng: number
    address: string
  }
  customer?: {
    id: string
    name: string
    phone: string
    pppoe_username: string
  }
  // Fields from backend processing (matching EJS view)
  pppoeUsername?: string
  ssid?: string
  userKonek?: string | number
  tag?: string
  password?: string
  rxPower?: string | number
}

interface DeviceStats {
  total_devices: number
  online_devices: number
  offline_devices: number
  warning_devices: number
  total_customers: number
}

export default function GenieACSPage() {
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

  const fetchDevices = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        limit: '100',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })
      const response = await api.get(`${endpoints.genieacs.devices}?${params}`)

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
      const response = await api.post(`${endpoints.genieacs.action}`, {
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
      const response = await api.post(endpoints.genieacs.edit, {
        id: selectedDevice._id || selectedDevice.id,
        ssid: editForm.ssid || undefined,
        password: editForm.password || undefined
      })

      if (response.data.success) {
        setShowEditSSID(false)
        await fetchDevices() // Refresh devices list
      }
    } catch (err: any) {
      console.error('Error updating SSID/Password:', err)
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
        return 'bg-green-100/60 text-green-800 border-green-300'
      case 'offline':
      case 'disconnected':
        return 'bg-red-100/60 text-red-800 border-red-300'
      case 'warning':
        return 'bg-amber-100/60 text-amber-800 border-amber-300'
      default:
        return 'bg-gray-100/60 text-gray-800 border-gray-300'
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
          <h1 className="text-2xl font-semibold text-foreground">Manajemen Perangkat GenieACS</h1>
          <p className="text-muted-foreground">
            Monitor dan kelola perangkat ONU/ONT melalui GenieACS
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoRefresh ? 'bg-primary' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoRefresh ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Device
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Devices</h3>
              <Server className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.total_devices}</div>
            <p className="text-xs text-muted-foreground">
              Registered ONUs/ONTs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Online</h3>
              <Wifi className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.online_devices}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total_devices > 0 ? ((stats.online_devices / stats.total_devices) * 100).toFixed(1) : 0}% dari total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Offline</h3>
              <WifiOff className="h-4 w-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-700">{stats.offline_devices}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total_devices > 0 ? ((stats.offline_devices / stats.total_devices) * 100).toFixed(1) : 0}% dari total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Warning</h3>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700">{stats.warning_devices}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total_devices > 0 ? ((stats.warning_devices / stats.total_devices) * 100).toFixed(1) : 0}% dari total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Customers</h3>
              <Router className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.total_customers}</div>
            <p className="text-xs text-muted-foreground">
              Linked customers
            </p>
          </CardContent>
        </Card>
      </div>

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
                onChange={(e) => setFilterStatus(e.target.value as any)}
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
                            <div className={`font-semibold ${
                              device.rxPower && parseFloat(device.rxPower.toString()) < -25
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
                                <div className={`flex items-center space-x-1 ${
                                  device.rxPower && parseFloat(device.rxPower.toString()) < -25
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

      {/* Edit SSID & Password Modal */}
      {showEditSSID && selectedDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-md w-full">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                <div className="flex items-center space-x-2">
                  <Edit className="h-5 w-5 text-primary" />
                  <span>Edit SSID & Password WiFi</span>
                </div>
              </CardTitle>
              <Button variant="ghost" onClick={() => setShowEditSSID(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Device Info</label>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Serial:</span>
                      <span className="text-sm font-mono">{selectedDevice.serialNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">PPPoE:</span>
                      <span className="text-sm font-mono">{selectedDevice.pppoeUsername}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Customer:</span>
                      <span className="text-sm font-mono">{selectedDevice.tag}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">SSID WiFi</label>
                  <Input
                    value={editForm.ssid}
                    onChange={(e) => setEditForm(prev => ({ ...prev, ssid: e.target.value }))}
                    placeholder="Masukkan SSID baru"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Password WiFi</label>
                  <div className="relative">
                    <Input
                      type={editForm.showPassword ? "text" : "password"}
                      value={editForm.password}
                      onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Masukkan password baru (min 8 karakter)"
                      className="w-full pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {editForm.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2 p-3 bg-blue-50/50 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <p className="text-xs text-blue-800">
                    Perubahan akan diterapkan langsung ke perangkat ONU. Pastikan device online.
                  </p>
                </div>

                <div className="flex space-x-3 pt-2">
                  <Button
                    onClick={handleSaveSSID}
                    disabled={editLoading || (!editForm.ssid && !editForm.password)}
                    className="flex-1"
                  >
                    {editLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Simpan Perubahan
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowEditSSID(false)}
                    disabled={editLoading}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Device Details Modal */}
      {showDetails && selectedDevice && typeof selectedDevice === 'object' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Device Details: {selectedDevice.serialNumber || selectedDevice.serial || 'Unknown'}</CardTitle>
              <Button variant="ghost" onClick={() => setShowDetails(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Device Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Serial:</span>
                      <span className="font-mono">{selectedDevice.serialNumber || selectedDevice.serial || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Manufacturer:</span>
                      <span>{selectedDevice.manufacturer || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Product Class:</span>
                      <span>{selectedDevice.productClass || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">OUI:</span>
                      <span>{selectedDevice.oui || '-'}</span>
                    </div>
                    {selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.ModelName && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Model:</span>
                        <span>{typeof selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.ModelName === 'string'
                          ? selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.ModelName
                          : selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.ModelName?._value || '-'}</span>
                      </div>
                    )}
                    {selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.HardwareVersion && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hardware:</span>
                        <span>{typeof selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.HardwareVersion === 'string'
                          ? selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.HardwareVersion
                          : selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.HardwareVersion?._value || '-'}</span>
                      </div>
                    )}
                    {selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Software:</span>
                        <span>{typeof selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion === 'string'
                          ? selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion
                          : selectedDevice.parameters?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || '-'}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Customer Information</h3>
                  {selectedDevice.customer ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Name:</span>
                        <span>{selectedDevice.customer.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Username:</span>
                        <span>{selectedDevice.customer.pppoe_username}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Phone:</span>
                        <span>{selectedDevice.customer.phone}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No customer assigned</p>
                  )}
                </div>

                <div>
                  <h3 className="font-semibold mb-3">WiFi Information</h3>
                  <div className="space-y-2">
                    {selectedDevice.ssid && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SSID:</span>
                        <span className="font-medium">{selectedDevice.ssid}</span>
                      </div>
                    )}
                    {selectedDevice.password && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Password:</span>
                        <span className="font-mono text-xs">{selectedDevice.password}</span>
                      </div>
                    )}
                    {selectedDevice.userKonek && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Connected Clients:</span>
                        <span>{selectedDevice.userKonek}</span>
                      </div>
                    )}
                    {!selectedDevice.ssid && !selectedDevice.password && !selectedDevice.userKonek && (
                      <div className="text-muted-foreground text-sm">No WiFi information available</div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">PPPoE Information</h3>
                  <div className="space-y-2">
                    {selectedDevice.customer?.pppoe_username && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">PPPoE Username:</span>
                        <span className="font-mono">{selectedDevice.customer.pppoe_username}</span>
                      </div>
                    )}
                    {selectedDevice.tag && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Customer Tag:</span>
                        <span>{selectedDevice.tag}</span>
                      </div>
                    )}
                    {selectedDevice.userKonek && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">User Konek:</span>
                        <span>{selectedDevice.userKonek}</span>
                      </div>
                    )}
                    {selectedDevice.rxPower && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">RX Power:</span>
                        <span>{selectedDevice.rxPower} dBm</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Connection Status</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">State:</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedDevice.connectionState)}`}>
                        {selectedDevice.connectionState}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Inform:</span>
                      <span>{new Date(selectedDevice.lastInform).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tags:</span>
                      <div className="flex gap-1">
                        {selectedDevice.tags?.map((tag, index) => (
                          <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100/60 text-gray-800">
                            {tag}
                          </span>
                        )) || <span className="text-muted-foreground">No tags</span>}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Network Information</h3>
                  <div className="space-y-2">
                    {selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.ExternalIPAddress && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">WAN IP:</span>
                        <span className="font-mono">{typeof selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.ExternalIPAddress === 'string'
                          ? selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.ExternalIPAddress
                          : selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.ExternalIPAddress?._value || '-'}</span>
                      </div>
                    )}
                    {selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.MACAddress && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">WAN MAC:</span>
                        <span className="font-mono">{typeof selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.MACAddress === 'string'
                          ? selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.MACAddress
                          : selectedDevice.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1']?.MACAddress?._value || '-'}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Connection State:</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedDevice.connectionState)}`}>
                        {selectedDevice.connectionState || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Inform:</span>
                      <span className="text-sm">{new Date(selectedDevice.lastInform).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Connected Hosts</h3>
                  <div className="space-y-2">
                    {selectedDevice.userKonek && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Connected Clients:</span>
                        <span className="font-semibold">{selectedDevice.userKonek}</span>
                      </div>
                    )}
                    {selectedDevice.parameters?.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host &&
                     Array.isArray(selectedDevice.parameters.InternetGatewayDevice.LANDevice['1'].Hosts.Host) &&
                     selectedDevice.parameters.InternetGatewayDevice.LANDevice['1'].Hosts.Host.length > 0 ? (
                      selectedDevice.parameters.InternetGatewayDevice.LANDevice['1'].Hosts.Host.map((host: any, index: number) => (
                        <div key={index} className="border rounded p-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">IP:</span>
                            <span className="font-mono">{host.IPAddress || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">MAC:</span>
                            <span className="font-mono text-xs">{host.MACAddress || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Name:</span>
                            <span className="truncate max-w-[120px]">{host.HostName || '-'}</span>
                          </div>
                          {host.Layer2Interface && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Interface:</span>
                              <span>{host.Layer2Interface}</span>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">No detailed host information available</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Actions</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" className="w-full">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reboot
                    </Button>
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Resync
                    </Button>
                    <Button variant="outline" size="sm" className="w-full">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                    <Button variant="outline" size="sm" className="w-full">
                      <Activity className="h-4 w-4 mr-2" />
                      Diagnostics
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}