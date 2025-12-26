'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users,
  Activity,
  Wifi,
  WifiOff,
  AlertCircle,
  Search,
  RefreshCw,
  MapPin,
  Clock,
  Signal,
  Filter
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface OnlineCustomer {
  id: string
  name: string
  phone: string
  address: string
  pppoe_username: string
  pppoe_password: string
  status: string
  package_name: string
  package_speed: string
  online_status: 'online' | 'offline' | 'idle'
  last_seen?: string
  signal_strength?: number
  rx_power?: number
  location?: {
    lat: number
    lng: number
    address: string
  }
  uptime?: string
  data_used?: {
    upload: number
    download: number
  }
}

interface Stats {
  total_customers: number
  online_customers: number
  offline_customers: number
  idle_customers: number
  total_traffic: {
    upload: number
    download: number
  }
}

export default function OnlineCustomersPage() {
  const [customers, setCustomers] = useState<OnlineCustomer[]>([])
  const [stats, setStats] = useState<Stats>({
    total_customers: 0,
    online_customers: 0,
    offline_customers: 0,
    idle_customers: 0,
    total_traffic: { upload: 0, download: 0 }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'idle'>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        limit: '100',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })
      const response = await adminApi.get(`/api/v1/realtime/online-customers?${params}`)

      if (response.data.success) {
        setCustomers(response.data.data.customers || [])
        setStats(response.data.data.stats || stats)
      } else {
        setError(response.data.message || 'Failed to load online customers')
      }
    } catch (err: any) {
      console.error('Error fetching online customers:', err)
      setError(err.message || 'Failed to load online customers')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchCustomers()
  }, [searchQuery, filterStatus])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchCustomers, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, searchQuery, filterStatus])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchCustomers()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'offline':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'idle':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <Wifi className="h-4 w-4" />
      case 'offline':
        return <WifiOff className="h-4 w-4" />
      case 'idle':
        return <Activity className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const getSignalStrengthColor = (strength?: number) => {
    if (!strength) return 'text-gray-500'
    if (strength >= -15) return 'text-green-600'
    if (strength >= -25) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatUptime = (seconds?: number) => {
    if (!seconds) return 'N/A'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       customer.phone.includes(searchQuery) ||
                       customer.pppoe_username?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = filterStatus === 'all' || customer.online_status === filterStatus

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pelanggan Online</h1>
          <p className="text-muted-foreground">
            Monitor status konektivitas pelanggan secara real-time
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
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
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Pelanggan</h3>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{stats.total_customers}</div>
            <p className="text-xs text-muted-foreground">
              Total registered customers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Online</h3>
              <Wifi className="h-4 w-4 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.online_customers}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.online_customers / stats.total_customers) * 100).toFixed(1)}% dari total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Offline</h3>
              <WifiOff className="h-4 w-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.offline_customers}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.offline_customers / stats.total_customers) * 100).toFixed(1)}% dari total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Traffic</h3>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-sm font-bold">
              <div>↓ {formatBytes(stats.total_traffic.download)}</div>
              <div>↑ {formatBytes(stats.total_traffic.upload)}</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Current session traffic
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
                  placeholder="Cari pelanggan online..."
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
                <option value="idle">Idle</option>
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers List */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Pelanggan Online</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchCustomers}>Try Again</Button>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Customers Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterStatus !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'No customers are currently online'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-foreground">Status</th>
                    <th className="text-left p-4 font-medium text-foreground">Pelanggan</th>
                    <th className="text-left p-4 font-medium text-foreground">Kontak</th>
                    <th className="text-left p-4 font-medium text-foreground">Paket</th>
                    <th className="text-left p-4 font-medium text-foreground">Signal</th>
                    <th className="text-left p-4 font-medium text-foreground">Uptime</th>
                    <th className="text-left p-4 font-medium text-foreground">Traffic</th>
                    <th className="text-left p-4 font-medium text-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b hover:bg-muted/50">
                      <td className="p-4">
                        <Badge className={getStatusColor(customer.online_status)}>
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(customer.online_status)}
                            <span className="capitalize">{customer.online_status}</span>
                          </span>
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-sm text-muted-foreground">{customer.phone}</div>
                          {customer.address && (
                            <div className="text-xs text-muted-foreground mt-1 truncate max-w-xs">
                              {customer.address}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          <div>Username: {customer.pppoe_username}</div>
                          <div className="text-muted-foreground">Status: {customer.status}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          <div className="font-medium">{customer.package_name}</div>
                          <div className="text-muted-foreground">{customer.package_speed}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Signal className={`h-4 w-4 ${getSignalStrengthColor(customer.rx_power)}`} />
                          {customer.rx_power && (
                            <span className="text-sm">{customer.rx_power} dBm</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-1 text-sm">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{formatUptime(customer.uptime)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm">
                          <div>↓ {formatBytes(customer.data_used?.download || 0)}</div>
                          <div>↑ {formatBytes(customer.data_used?.upload || 0)}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          {customer.location && (
                            <Button variant="outline" size="icon">
                              <MapPin className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="outline" size="icon">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}