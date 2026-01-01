'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Activity,
  AlertTriangle,
  Users,
  Wifi,
  WifiOff,
  Signal,
  TrendingUp,
  TrendingDown,
  Clock,
  RefreshCw,
  Filter,
  Search,
  Server,
  Router,
  AlertCircle,
  CheckCircle,
  XCircle,
  MapPin,
  Eye,
  Settings,
  Zap,
  Download,
  Upload,
  Thermometer,
  HardDrive,
  Cpu,
  Monitor,
  Smartphone,
  Bell,
  Calendar,
  BarChart3,
  PieChart,
  Layers,
  Package
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface SystemAlert {
  id: string
  type: 'critical' | 'warning' | 'info'
  title: string
  message: string
  device_id?: string
  device_type?: 'onu' | 'odp' | 'olt' | 'router'
  timestamp: string
  acknowledged: boolean
  action_required: boolean
}

interface PerformanceMetric {
  cpu_usage: number
  memory_usage: number
  disk_usage: number
  network_in: number
  network_out: number
  temperature?: number
  uptime: number
}

interface RecentActivity {
  id: string
  type: 'device_online' | 'device_offline' | 'signal_warning' | 'reboot' | 'configuration' | 'alert'
  title: string
  description: string
  device_id?: string
  device_name?: string
  timestamp: string
  user?: string
}

interface DeviceStatus {
  total_devices: number
  online_devices: number
  offline_devices: number
  critical_issues: number
  warning_issues: number
  healthy_devices: number
}

interface NetworkStats {
  total_bandwidth: number
  used_bandwidth: number
  upload_speed: number
  download_speed: number
  active_connections: number
}

export default function TechnicianDashboard() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h')
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'warning' | 'info'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // State for various dashboard components
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([])
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric>({
    cpu_usage: 0,
    memory_usage: 0,
    disk_usage: 0,
    network_in: 0,
    network_out: 0,
    uptime: 0
  })
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([])
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    critical_issues: 0,
    warning_issues: 0,
    healthy_devices: 0
  })
  const [networkStats, setNetworkStats] = useState<NetworkStats>({
    total_bandwidth: 1000000,
    used_bandwidth: 750000,
    upload_speed: 50000,
    download_speed: 80000,
    active_connections: 150
  })

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // Fetch all dashboard data in parallel
      const [systemStatusResponse, alertsResponse, performanceResponse, activitiesResponse] = await Promise.allSettled([
        adminApi.get('/api/v1/technician/system-status'),
        adminApi.get(`/api/v1/technician/alerts?limit=50&time_range=${timeRange}&type=${filterType === 'all' ? '' : filterType}`),
        adminApi.get(`/api/v1/technician/performance?timeframe=${timeRange}`),
        adminApi.get('/api/v1/technician/activities')
      ])

      // Process system status
      if (systemStatusResponse.status === 'fulfilled' && systemStatusResponse.value.data.success) {
        const statusData = systemStatusResponse.value.data.data
        setPerformanceMetrics({
          cpu_usage: statusData.cpu?.usage || 0,
          memory_usage: statusData.memory?.percentage || 0,
          disk_usage: statusData.disk?.percentage || 0,
          network_in: statusData.network?.download || 0,
          network_out: statusData.network?.upload || 0,
          uptime: statusData.uptime || 0
        })
      }

      // Process alerts
      if (alertsResponse.status === 'fulfilled' && alertsResponse.value.data.success) {
        const alertsData = alertsResponse.value.data.data
        // Map alert data to match interface
        const mappedAlerts = (Array.isArray(alertsData) ? alertsData : []).map(alert => ({
          id: alert.id.toString(),
          type: alert.type === 'error' ? 'critical' : alert.type === 'warning' ? 'warning' : 'info',
          title: alert.title,
          message: alert.message,
          device_id: alert.device_id,
          device_type: alert.device_type,
          timestamp: alert.timestamp,
          acknowledged: alert.acknowledged || false,
          action_required: alert.type === 'error'
        }))
        setSystemAlerts(mappedAlerts)
      } else {
        // Fallback - empty alerts for development
        setSystemAlerts([])
      }

      // Process performance metrics (chart data)
      if (performanceResponse.status === 'fulfilled' && performanceResponse.value.data.success) {
        // Set performance metrics from the latest data point
        const metricsData = performanceResponse.value.data.data
        if (Array.isArray(metricsData) && metricsData.length > 0) {
          const latest = metricsData[metricsData.length - 1]
          setPerformanceMetrics(prev => ({
            ...prev,
            cpu_usage: latest.cpu || prev.cpu_usage,
            memory_usage: latest.memory || prev.memory_usage,
            disk_usage: latest.disk || prev.disk_usage,
            network_in: latest.network || prev.network_in
          }))
        }
      }

      // Process recent activities
      if (activitiesResponse.status === 'fulfilled' && activitiesResponse.value.data.success) {
        const activitiesData = activitiesResponse.value.data.data
        // Map activity data to match interface
        const mappedActivities = (Array.isArray(activitiesData) ? activitiesData : []).map(activity => ({
          id: activity.id.toString(),
          type: activity.type === 'customer' ? 'configuration' :
                activity.type === 'device' ? 'reboot' :
                activity.type === 'system' ? 'alert' : 'configuration',
          title: activity.title,
          description: activity.description,
          device_id: activity.device_id,
          device_name: activity.device_name,
          timestamp: activity.timestamp,
          user: activity.user || 'System'
        }))
        setRecentActivities(mappedActivities)
      } else {
        // Fallback - empty activities for development
        setRecentActivities([])
      }

      // Set device status with mock data for now
      setDeviceStatus({
        total_devices: 50,
        online_devices: 45,
        offline_devices: 3,
        critical_issues: 2,
        warning_issues: 5,
        healthy_devices: 38
      })

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [timeRange, filterType])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchDashboardData, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, timeRange, filterType])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchDashboardData()
  }

  const handleAlertAcknowledge = async (alertId: string) => {
    try {
      await adminApi.post(`/api/v1/technician/alerts/${alertId}/acknowledge`)
      setSystemAlerts(alerts =>
        alerts.map(alert =>
          alert.id === alertId ? { ...alert, acknowledged: true } : alert
        )
      )
    } catch (error) {
      console.error('Error acknowledging alert:', error)
    }
  }

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4" />
      case 'warning':
        return <AlertCircle className="h-4 w-4" />
      case 'info':
        return <Bell className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'device_online':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'device_offline':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'signal_warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'reboot':
        return <RefreshCw className="h-4 w-4 text-blue-600" />
      case 'configuration':
        return <Settings className="h-4 w-4 text-purple-600" />
      case 'alert':
        return <Bell className="h-4 w-4 text-red-600" />
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />
    }
  }

  const filteredAlerts = systemAlerts.filter(alert => {
    const matchesSearch = !searchQuery ||
      alert.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.message.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType = filterType === 'all' || alert.type === filterType

    return matchesSearch && matchesType
  })

  const formatUptime = (seconds: number) => {
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

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const getUsagePercentage = (used: number, total: number) => {
    return total > 0 ? Math.round((used / total) * 100) : 0
  }

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600'
    if (percentage >= 75) return 'text-yellow-600'
    return 'text-green-600'
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard Teknisi</h1>
          <p className="text-muted-foreground">
            Monitor sistem real-time, performa device, dan aktivitas jaringan
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="1h">1 Jam</option>
            <option value="6h">6 Jam</option>
            <option value="24h">24 Jam</option>
            <option value="7d">7 Hari</option>
          </select>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Auto Refresh:</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoRefresh ? 'bg-primary' : 'bg-secondary'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  autoRefresh ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Total Devices</h3>
              <Server className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold">{deviceStatus.total_devices}</div>
            <div className="flex items-center space-x-4 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600">{deviceStatus.healthy_devices} Healthy</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-yellow-600">{deviceStatus.warning_issues} Warning</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-red-600">{deviceStatus.critical_issues} Critical</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Active Alerts</h3>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-red-600">{filteredAlerts.filter(a => !a.acknowledged).length}</div>
            <p className="text-xs text-muted-foreground">
              {filteredAlerts.length} total alerts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">Network Usage</h3>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Used:</span>
                <span className={`font-medium ${getUsageColor(getUsagePercentage(networkStats.used_bandwidth, networkStats.total_bandwidth))}`}>
                  {getUsagePercentage(networkStats.used_bandwidth, networkStats.total_bandwidth)}%
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${getUsagePercentage(networkStats.used_bandwidth, networkStats.total_bandwidth)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatBytes(networkStats.used_bandwidth)} / {formatBytes(networkStats.total_bandwidth)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground">System Uptime</h3>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold text-green-600">{formatUptime(performanceMetrics.uptime)}</div>
            <p className="text-xs text-muted-foreground">
              Last restart: 15 days ago
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Monitor className="h-5 w-5" />
              System Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">CPU Usage</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        performanceMetrics.cpu_usage > 80 ? 'bg-red-500' :
                        performanceMetrics.cpu_usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(performanceMetrics.cpu_usage, 100)}%` }}
                    ></div>
                  </div>
                  <span className={`text-sm font-medium ${getUsageColor(performanceMetrics.cpu_usage)}`}>
                    {performanceMetrics.cpu_usage}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Memory</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        performanceMetrics.memory_usage > 80 ? 'bg-red-500' :
                        performanceMetrics.memory_usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(performanceMetrics.memory_usage, 100)}%` }}
                    ></div>
                  </div>
                  <span className={`text-sm font-medium ${getUsageColor(performanceMetrics.memory_usage)}`}>
                    {performanceMetrics.memory_usage}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Disk Usage</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-secondary rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        performanceMetrics.disk_usage > 80 ? 'bg-red-500' :
                        performanceMetrics.disk_usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(performanceMetrics.disk_usage, 100)}%` }}
                    ></div>
                  </div>
                  <span className={`text-sm font-medium ${getUsageColor(performanceMetrics.disk_usage)}`}>
                    {performanceMetrics.disk_usage}%
                  </span>
                </div>
              </div>

              {performanceMetrics.temperature && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Thermometer className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Temperature</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-24 bg-secondary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          performanceMetrics.temperature > 70 ? 'bg-red-500' :
                          performanceMetrics.temperature > 50 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(performanceMetrics.temperature / 100 * 100, 100)}%` }}
                      ></div>
                    </div>
                    <span className={`text-sm font-medium ${getUsageColor(performanceMetrics.temperature / 100 * 100)}`}>
                      {performanceMetrics.temperature}°C
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              Network Traffic
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Download className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Download</span>
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatBytes(networkStats.download_speed)}/s
                  </div>
                </div>
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Upload className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Upload</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatBytes(networkStats.upload_speed)}/s
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Active Connections</span>
                  <Badge variant="secondary">{networkStats.active_connections}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Real-time connections monitoring
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Total Bandwidth</span>
                  <span className="text-sm text-muted-foreground">
                    {formatBytes(networkStats.total_bandwidth)}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${getUsagePercentage(networkStats.used_bandwidth, networkStats.total_bandwidth)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts and Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              System Alerts
            </CardTitle>
            <div className="flex items-center space-x-2">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="all">All Types</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search alerts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-8 w-48"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Alerts</h3>
                <p className="text-muted-foreground">
                  All systems operating normally
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${getAlertColor(alert.type)} ${
                      alert.acknowledged ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          {getAlertIcon(alert.type)}
                          <h4 className="font-semibold">{alert.title}</h4>
                          {!alert.acknowledged && alert.action_required && (
                            <Badge variant="destructive" className="text-xs">
                              Action Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm">{alert.message}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                          <span>{new Date(alert.timestamp).toLocaleString()}</span>
                          {alert.device_type && (
                            <span className="uppercase">{alert.device_type}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        {!alert.acknowledged && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAlertAcknowledge(alert.id)}
                          >
                            Acknowledge
                          </Button>
                        )}
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              Recent Activities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : recentActivities.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Recent Activities</h3>
                <p className="text-muted-foreground">
                  No activities in the selected time range
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50">
                    <div className="mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-medium text-sm">{activity.title}</h4>
                        <span className="text-xs text-muted-foreground">
                          {new Date(activity.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                      <div className="flex items-center space-x-2 mt-1 text-xs">
                        {activity.device_name && (
                          <span className="text-muted-foreground">{activity.device_name}</span>
                        )}
                        {activity.user && (
                          <span className="text-muted-foreground">by {activity.user}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}