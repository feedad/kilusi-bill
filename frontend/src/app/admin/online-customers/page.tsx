'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import { SearchBar } from '@/components/SearchBar'

interface OnlineCustomer {
  id: string
  name: string
  phone: string
  address: string
  pppoe_username: string
  pppoe_password: string
  mac_address: string
  status: string
  package_name: string
  package_speed: string
  online_status: 'online' | 'offline' | 'idle'
  ip_address?: string
  last_seen?: string
  signal_strength?: number
  rx_power?: number
  tx_power?: number
  olt_distance?: number
  olt_name?: string
  onu_index?: string
  location?: {
    lat: number
    lng: number
    address: string
  }
  uptime?: number
  uptime_formatted?: string
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

interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
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
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchQueryRef = useRef('')
  const [isSearching, setIsSearching] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'idle'>('online')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [syncingMac, setSyncingMac] = useState(false)
  const [syncingRadius, setSyncingRadius] = useState(false)

  const fetchCustomers = async (page = pagination.page) => {
    try {
      // Only show full page loading state for initial load, not for search
      const isSearchOperation = searchQueryRef.current.length > 0
      if (!isSearchOperation) {
        setLoading(true)
      }
      setError(null)
      const params = new URLSearchParams({
        limit: String(pagination.pageSize),
        offset: String((page - 1) * pagination.pageSize),
        search: searchQueryRef.current,
        status: filterStatus === 'all' ? '' : filterStatus,
      })
      const response = await adminApi.get(`/api/v1/realtime/online-customers?${params}`)

      if (response.data.success) {
        setCustomers(response.data.data.customers || [])
        setStats(response.data.data.stats || stats)
        const newPagination = response.data.data.pagination || pagination
        setPagination(newPagination)
        // Update page state if page parameter was provided
        if (page !== pagination.page) {
          setPagination(prev => ({ ...prev, page }))
        }
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

  // Lightweight function for auto-refresh - only updates realtime data
  const fetchOnlineStatusOnly = async () => {
    try {
      if (customers.length === 0) return

      const customerIds = customers.map(c => c.id).join(',')
      const response = await adminApi.get(`/api/v1/realtime/online-status?customer_ids=${customerIds}`)

      if (response.data.success) {
        const statusData = response.data.data.status

        // Update customers with new realtime data
        setCustomers(prevCustomers =>
          prevCustomers.map(customer => {
            const status = statusData[customer.id]
            if (status) {
              return {
                ...customer,
                online_status: status.online_status,
                uptime_seconds: status.uptime_seconds,
                uptime_formatted: formatUptime(status.uptime_seconds),
                data_used: status.data_used,
                rx_power: status.rx_power,
                tx_power: status.tx_power,
                olt_distance: status.olt_distance,
                olt_name: status.olt_name,
                onu_index: status.onu_index
              }
            }
            return customer
          })
        )
      }
    } catch (err: any) {
      console.error('Error fetching online status:', err)
    }
  }

  useEffect(() => {
    fetchCustomers(1)
  }, [filterStatus, pagination.pageSize]) // Removed searchQuery - using ref instead

  // Auto-refresh every 30 seconds - lightweight refresh (only realtime data)
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => fetchOnlineStatusOnly(), 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, customers]) // Depend on customers, not pagination

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    fetchCustomers(newPage)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchCustomers(pagination.page)
  }

  // Handler untuk search dipanggil oleh SearchBar
  const handleSearch = useCallback((query: string) => {
    searchQueryRef.current = query
    setIsSearching(!!query)
    // Directly call fetchCustomers with page 1, bypassing the useEffect
    fetchCustomers(1)
  }, [])

  const handleCoa = async (customer: OnlineCustomer) => {
    if (!confirm(`Disconnect user ${customer.pppoe_username} (${customer.name})?\n\nIni akan memutus koneksi PPPoE pelanggan.`)) {
      return
    }

    try {
      const response = await adminApi.post('/api/v1/realtime/coa', {
        pppoe_username: customer.pppoe_username
      })

      if (response.data.success) {
        alert(`✅ ${response.data.message}`)
        // Refresh after a short delay to allow disconnect to take effect
        setTimeout(() => fetchCustomers(pagination.page), 2000)
      } else {
        alert(`⚠️ ${response.data.message}`)
      }
    } catch (error: any) {
      console.error('CoA error:', error)
      alert(`❌ Gagal mengirim CoA: ${error.response?.data?.message || error.message}`)
    }
  }

  const handleSyncMacFromRadius = async () => {
    if (!confirm(
      'Sinkronkan MAC Address dari RADIUS?\n\n' +
      'Ini akan mengupdate MAC address untuk pelanggan yang MAC-nya masih kosong.\n' +
      'Data diambil dari history koneksi RADIUS.'
    )) {
      return
    }

    try {
      setSyncingMac(true)
      setError(null)

      const response = await adminApi.post('/api/v1/technical-details/sync-mac-from-radius', {
        dry_run: false
      })

      if (response.data.success) {
        const { updated, skipped } = response.data.data.summary
        alert(`✅ Sinkronisasi MAC Selesai!\n\nBerhasil: ${updated} pelanggan\nDilewati: ${skipped} pelanggan`)

        // Refresh to show updated data
        fetchCustomers(pagination.page)
      } else {
        setError('Gagal sinkronisasi MAC')
      }
    } catch (err: any) {
      console.error('Error syncing MAC:', err)
      setError(err.response?.data?.message || err.message || 'Gagal sinkronisasi MAC')
    } finally {
      setSyncingMac(false)
    }
  }

  const handleSyncRadius = async () => {
    if (!confirm(
      'Sync status online pelanggan?\n\n' +
      'Ini akan membersihkan sesi RADIUS yang sudah tidak aktif (stale >30 menit).\n' +
      'Tidak akan memutus koneksi PPPoE yang sedang berjalan.'
    )) {
      return
    }

    try {
      setSyncingRadius(true)
      setError(null)

      const response = await adminApi.post('/api/v1/realtime/radius-sync')

      if (response.data.success) {
        alert(`✅ ${response.data.message}`)
        fetchCustomers(pagination.page)
      } else {
        alert(`⚠️ ${response.data.message}`)
      }
    } catch (err: any) {
      console.error('Error syncing radius:', err)
      alert(`❌ Gagal sync: ${err.response?.data?.message || err.message}`)
    } finally {
      setSyncingRadius(false)
    }
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
          <Button
            variant="outline"
            onClick={handleSyncMacFromRadius}
            disabled={syncingMac}
            className="flex items-center space-x-2"
            title="Sync MAC addresses from RADIUS"
          >
            <RefreshCw className={`h-4 w-4 ${syncingMac ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncingMac ? 'Syncing...' : 'Sync MAC'}</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleSyncRadius}
            disabled={syncingRadius}
            className="flex items-center space-x-2"
            title="Sync status online dari RADIUS"
          >
            <RefreshCw className={`h-4 w-4 ${syncingRadius ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncingRadius ? 'Syncing...' : 'Sync Status'}</span>
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
        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${filterStatus === 'all' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => setFilterStatus('all')}
        >
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

        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${filterStatus === 'online' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setFilterStatus('online')}
        >
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

        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${filterStatus === 'offline' ? 'ring-2 ring-red-500' : ''}`}
          onClick={() => setFilterStatus('offline')}
        >
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

        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${filterStatus === 'idle' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setFilterStatus('idle')}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Idle</h3>
              <Activity className="h-4 w-4 text-yellow-600" />
            </div>
            <div className="text-2xl font-bold text-yellow-600">{stats.idle_customers}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.idle_customers / stats.total_customers) * 100).toFixed(1)}% dari total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Card - separate, not clickable */}
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

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <SearchBar
                onSearch={handleSearch}
                onSearchChange={setIsSearching}
                placeholder="Cari pelanggan online..."
              />
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
              <select
                value={pagination.pageSize}
                onChange={(e) => {
                  setPagination({ ...pagination, pageSize: parseInt(e.target.value), page: 1 })
                }}
                className="rounded-md border border-input bg-background px-2 py-2 text-sm w-16 text-center"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
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
          ) : customers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Customers Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQueryRef.current || filterStatus !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'No customers are currently online'
                }
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Status</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Pelanggan</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Kontak</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">IP Address</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Paket</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">MAC Address</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Signal</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Uptime</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Traffic (Session)</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Usage (Cycle)</th>
                    <th className="text-left py-2 px-3 font-medium text-foreground text-xs">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">
                        <Badge className={`${getStatusColor(customer.online_status)} text-xs`}>
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(customer.online_status)}
                            <span className="capitalize">{customer.online_status}</span>
                          </span>
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs">
                          <div className="font-medium truncate max-w-[150px]">{customer.name}</div>
                          <div className="text-muted-foreground truncate max-w-[150px]">{customer.phone}</div>
                        </div>
                      </td>
                       <td className="py-2 px-3">
                         <div className="text-xs">
                           <span className="text-muted-foreground">{customer.pppoe_username}</span>
                           <span className="text-muted-foreground mx-1">•</span>
                           <span>{customer.status}</span>
                         </div>
                       </td>
                       <td className="py-2 px-3">
                         <div className="text-xs font-mono">
                           {customer.ip_address ? (
                             <a href={`http://${customer.ip_address}`} target="_blank" rel="noopener noreferrer"
                                className="text-blue-600 hover:underline">
                               {customer.ip_address}
                             </a>
                           ) : <span className="text-muted-foreground">-</span>}
                         </div>
                       </td>
                       <td className="py-2 px-3">
                         <div className="text-xs">
                           <span className="font-medium">{customer.package_name}</span>
                           <span className="text-muted-foreground mx-1">•</span>
                           <span className="text-muted-foreground">{customer.package_speed}</span>
                         </div>
                       </td>
                      <td className="py-2 px-3">
                        <div className="text-xs font-mono">
                          {customer.mac_address ? (
                            <span className="text-foreground">{customer.mac_address}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs">
                          {customer.rx_power ? (
                            <span className={getSignalStrengthColor(customer.rx_power)}>
                              RX: {customer.rx_power} dBm
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {customer.tx_power && customer.tx_power !== '-' && (
                            <span className="text-muted-foreground ml-2">
                              TX: {customer.tx_power} dBm
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center space-x-1 text-xs">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span>{customer.uptime_formatted || formatUptime(customer.uptime)}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs">
                          <span className="text-muted-foreground">↓</span> {formatBytes(customer.data_used?.download || 0)}
                          <span className="text-muted-foreground mx-1">|</span>
                          <span className="text-muted-foreground">↑</span> {formatBytes(customer.data_used?.upload || 0)}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-xs font-mono">
                          {customer.usage_bytes_in !== undefined
                            ? formatBytes((customer.usage_bytes_in || 0) + (customer.usage_bytes_out || 0))
                            : '-'}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center space-x-1">
                          {customer.location && (
                            <Button variant="outline" size="icon" className="h-7 w-7">
                              <MapPin className="h-3 w-3" />
                            </Button>
                          )}
                          {customer.online_status === 'online' && (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleCoa(customer)}
                              title="Disconnect (CoA)"
                              className="h-7 w-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                            >
                              <WifiOff className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="outline" size="icon" className="h-7 w-7">
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Menampilkan {(pagination.page - 1) * pagination.pageSize + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.total)} dari {pagination.total} pelanggan
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="h-7 w-7"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs">
                    Halaman {pagination.page} dari {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="h-7 w-7"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}