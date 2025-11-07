'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  Server,
  Activity,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Monitor,
  Network,
  Cpu,
  HardDrive,
  Globe,
  Clock,
  Settings,
  Edit,
  Download,
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  Eye,
  EyeOff
} from 'lucide-react'
import { api, endpoints } from '@/lib/api'

interface NAS {
  id: string
  shortname: string
  nasname: string
  secret: string
  type: string
  description: string
  status: 'online' | 'offline' | 'unknown'
  last_seen?: string
  priority: number
  snmp_enabled: boolean
  snmp_community: string
  snmp_community_trap: string
  snmp_version: string
  snmp_port: number
  snmp_username?: string
  snmp_auth_protocol?: string
  snmp_auth_password?: string
  snmp_priv_protocol?: string
  snmp_priv_password?: string
  snmp_security_level?: string
}

interface SNMPStats {
  cpu_usage: number
  memory_usage: number
  interface_count: number
  active_connections: number
  uptime: number
  last_checked: string
  system_description?: string
  contact?: string
  location?: string
}

interface InterfaceInfo {
  name: string
  status: string
  speed: number
  in_octets: number
  out_octets: number
  in_packets: number
  out_packets: number
  in_errors: number
  out_errors: number
}

interface TrafficStats {
  timestamp: string
  bandwidth_in: number
  bandwidth_out: number
  packets_in: number
  packets_out: number
}

export default function ServerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const nasId = params.id as string

  const [nas, setNAS] = useState<NAS | null>(null)
  const [snmpStats, setSNMPStats] = useState<SNMPStats | null>(null)
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([])
  const [trafficHistory, setTrafficHistory] = useState<TrafficStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h')

  useEffect(() => {
    fetchServerDetail()
    const interval = setInterval(fetchServerDetail, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [nasId])

  const fetchServerDetail = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch NAS details
      const nasResponse = await api.get(endpoints.radius.nas)
      const nasData = nasResponse.data.data.nas.find((n: NAS) => String(n.id) === String(nasId))

      if (!nasData) {
        setError('Server tidak ditemukan')
        return
      }

      setNAS(nasData)

      // Fetch SNMP stats if online
      if (nasData.status === 'online' && nasData.snmp_enabled) {
        try {
          const [statsResponse, interfacesResponse, trafficResponse] = await Promise.all([
            api.get(`/api/v1/radius/nas/${nasId}/stats`),
            api.get(`/api/v1/radius/nas/${nasId}/interfaces`),
            api.get(`/api/v1/radius/nas/${nasId}/traffic?range=${selectedTimeRange}`)
          ])

          setSNMPStats(statsResponse.data.data)
          setInterfaces(interfacesResponse.data.data || [])
          setTrafficHistory(trafficResponse.data.data || [])
        } catch (snmpError) {
          console.warn('Failed to fetch SNMP details:', snmpError)
        }
      }
    } catch (err) {
      console.error('Error fetching server detail:', err)
      setError('Gagal memuat detail server')
    } finally {
      setLoading(false)
    }
  }

  const refreshData = async () => {
    setRefreshing(true)
    await fetchServerDetail()
    setRefreshing(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800 border-green-300'
      case 'offline': return 'bg-red-100 text-red-800 border-red-300'
      case 'unknown': return 'bg-muted text-muted-foreground border-border'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return <CheckCircle className="h-4 w-4" />
      case 'offline': return <XCircle className="h-4 w-4" />
      case 'unknown': return <AlertCircle className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getSpeedColor = (speed: number) => {
    if (speed >= 1000000000) return 'text-green-600' // 1Gbps+
    if (speed >= 100000000) return 'text-blue-600'   // 100Mbps+
    if (speed >= 10000000) return 'text-yellow-600'  // 10Mbps+
    return 'text-gray-600'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat detail server...</p>
        </div>
      </div>
    )
  }

  if (error || !nas) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-4">{error || 'Server tidak ditemukan'}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Kembali
              </Button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{nas.shortname}</h1>
                <p className="text-sm text-gray-500">{nas.nasname}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshData}
                disabled={refreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link href={`/admin/radius/edit/${nas.id}`}>
                <Button size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Status Server</p>
                  <div className="flex items-center mt-2">
                    <Badge className={getStatusColor(nas.status)}>
                      <span className="flex items-center space-x-1">
                        {getStatusIcon(nas.status)}
                        <span className="capitalize">{nas.status}</span>
                      </span>
                    </Badge>
                  </div>
                </div>
                <Server className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">CPU Usage</p>
                  <div className="flex items-center mt-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {snmpStats?.cpu_usage || 0}%
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        (snmpStats?.cpu_usage || 0) > 80
                          ? 'bg-red-500'
                          : (snmpStats?.cpu_usage || 0) > 60
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${snmpStats?.cpu_usage || 0}%` }}
                    />
                  </div>
                </div>
                <Cpu className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Memory Usage</p>
                  <div className="flex items-center mt-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {snmpStats?.memory_usage || 0}%
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        (snmpStats?.memory_usage || 0) > 80
                          ? 'bg-red-500'
                          : (snmpStats?.memory_usage || 0) > 60
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                      }`}
                      style={{ width: `${snmpStats?.memory_usage || 0}%` }}
                    />
                  </div>
                </div>
                <HardDrive className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Uptime</p>
                  <div className="flex items-center mt-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {snmpStats?.uptime ? formatUptime(snmpStats.uptime) : 'N/A'}
                    </span>
                  </div>
                </div>
                <Clock className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Server Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Server</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Nama Server</label>
                  <p className="text-gray-900 font-medium">{nas.shortname}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">IP Address</label>
                  <p className="text-gray-900 font-mono">{nas.nasname}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Tipe</label>
                  <p className="text-gray-900 font-medium">{nas.type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Priority</label>
                  <p className="text-gray-900 font-medium">{nas.priority}</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">Deskripsi</label>
                <p className="text-gray-900">{nas.description || 'Tidak ada deskripsi'}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">RADIUS Secret</label>
                <div className="flex items-center space-x-2">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={nas.secret}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Last Seen</label>
                  <p className="text-gray-900">
                    {nas.last_seen ? new Date(nas.last_seen).toLocaleString('id-ID') : 'Never'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Created At</label>
                  <p className="text-gray-900">
                    {new Date(nas.created_at).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Konfigurasi SNMP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">SNMP Status</label>
                  <p className="text-gray-900">
                    {nas.snmp_enabled ? (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                        <Activity className="h-3 w-3 mr-1" />
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500">
                        <WifiOff className="h-3 w-3 mr-1" />
                        Disabled
                      </Badge>
                    )}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">SNMP Version</label>
                  <p className="text-gray-900 font-medium">{nas.snmp_version || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Community</label>
                  <p className="text-gray-900 font-mono">{nas.snmp_community || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Port</label>
                  <p className="text-gray-900 font-medium">{nas.snmp_port || 'N/A'}</p>
                </div>
              </div>

              {nas.snmp_version === '3' && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">SNMP v3 Configuration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-600">Username</label>
                      <p className="text-gray-900 font-mono">{nas.snmp_username || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Security Level</label>
                      <p className="text-gray-900 font-medium">{nas.snmp_security_level || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Auth Protocol</label>
                      <p className="text-gray-900 font-medium">{nas.snmp_auth_protocol || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-600">Priv Protocol</label>
                      <p className="text-gray-900 font-medium">{nas.snmp_priv_protocol || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              )}

              {snmpStats?.system_description && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">System Information</h4>
                  <div className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-gray-600">System Description</label>
                      <p className="text-gray-900 text-sm">{snmpStats.system_description}</p>
                    </div>
                    {snmpStats.contact && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">Contact</label>
                        <p className="text-gray-900 text-sm">{snmpStats.contact}</p>
                      </div>
                    )}
                    {snmpStats.location && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">Location</label>
                        <p className="text-gray-900 text-sm">{snmpStats.location}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Network Interfaces */}
        {interfaces.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Network Interfaces</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-gray-700">Interface</th>
                      <th className="text-left p-3 font-medium text-gray-700">Status</th>
                      <th className="text-left p-3 font-medium text-gray-700">Speed</th>
                      <th className="text-left p-3 font-medium text-gray-700">Traffic In</th>
                      <th className="text-left p-3 font-medium text-gray-700">Traffic Out</th>
                      <th className="text-left p-3 font-medium text-gray-700">Packets In</th>
                      <th className="text-left p-3 font-medium text-gray-700">Packets Out</th>
                      <th className="text-left p-3 font-medium text-gray-700">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interfaces.map((iface, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium">{iface.name}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant={iface.status === 'up' ? 'default' : 'secondary'}>
                            {iface.status}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={getSpeedColor(iface.speed)}>
                            {formatBytes(iface.speed)}/s
                          </span>
                        </td>
                        <td className="p-3 text-sm">{formatBytes(iface.in_octets)}</td>
                        <td className="p-3 text-sm">{formatBytes(iface.out_octets)}</td>
                        <td className="p-3 text-sm">{iface.in_packets.toLocaleString()}</td>
                        <td className="p-3 text-sm">{iface.out_packets.toLocaleString()}</td>
                        <td className="p-3">
                          <div className="text-sm">
                            {iface.in_errors > 0 && (
                              <span className="text-red-600">In: {iface.in_errors}</span>
                            )}
                            {iface.out_errors > 0 && (
                              <span className="text-red-600 ml-2">Out: {iface.out_errors}</span>
                            )}
                            {iface.in_errors === 0 && iface.out_errors === 0 && (
                              <span className="text-green-600">No errors</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Traffic History */}
        {trafficHistory.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Traffic History</CardTitle>
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedTimeRange}
                    onChange={(e) => setSelectedTimeRange(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1 text-sm"
                  >
                    <option value="1h">Last 1 Hour</option>
                    <option value="6h">Last 6 Hours</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Bandwidth Usage</h4>
                  <div className="space-y-3">
                    {trafficHistory.slice(-5).reverse().map((traffic, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <div className="text-sm text-gray-600">
                            {new Date(traffic.timestamp).toLocaleString('id-ID')}
                          </div>
                          <div className="flex items-center space-x-4 mt-1">
                            <div className="flex items-center text-sm">
                              <TrendingDown className="h-3 w-3 mr-1 text-blue-500" />
                              In: {formatBytes(traffic.bandwidth_in)}/s
                            </div>
                            <div className="flex items-center text-sm">
                              <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                              Out: {formatBytes(traffic.bandwidth_out)}/s
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-4">Packet Statistics</h4>
                  <div className="space-y-3">
                    {trafficHistory.slice(-5).reverse().map((traffic, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div>
                          <div className="text-sm text-gray-600">
                            {new Date(traffic.timestamp).toLocaleString('id-ID')}
                          </div>
                          <div className="flex items-center space-x-4 mt-1">
                            <div className="text-sm">
                              <Package className="h-3 w-3 mr-1 inline" />
                              In: {traffic.packets_in.toLocaleString()} pps
                            </div>
                            <div className="text-sm">
                              <Package className="h-3 w-3 mr-1 inline" />
                              Out: {traffic.packets_out.toLocaleString()} pps
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Connections */}
        {snmpStats?.active_connections !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle>Active Connections</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600">
                  {snmpStats.active_connections.toLocaleString()}
                </div>
                <p className="text-gray-600 mt-2">Current active connections</p>
                <div className="mt-4 flex items-center justify-center space-x-2">
                  <Users className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Last updated: {snmpStats.last_checked ?
                      new Date(snmpStats.last_checked).toLocaleString('id-ID') :
                      'Unknown'
                    }
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}