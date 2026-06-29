'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminApi } from '@/lib/api-clients'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import {
  ArrowLeft, RefreshCw, Power, AlertTriangle, Wifi, Signal, Thermometer,
  Clock, User, Phone, Fingerprint, Globe, Server, Activity, Cpu, HardDrive,
  Zap, Loader2, Eye, EyeOff, X, Monitor, Network, WifiOff
} from 'lucide-react'
import type { ACSDevice, ACSWiFiConfig, ACSWANConnection } from '../types'
import TabBar from '../components/TabBar'
import GaugeCard from '../components/GaugeCard'
import ConnectedTab from '../components/ConnectedTab'
import WiFiTab from '../components/WiFiTab'
import WanTab from '../components/WanTab'
import LanTab from '../components/LanTab'

export default function DeviceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [device, setDevice] = useState<ACSDevice | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(0)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  const fetchDevice = async () => {
    try {
      const res = await adminApi.get(`/api/v1/genieacs/devices/${id}`)
      if (res.data.success) {
        setDevice(res.data.data)
      }
    } catch (err) {
      console.error('Failed to fetch device', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevice()
    const interval = setInterval(fetchDevice, 30000)
    return () => clearInterval(interval)
  }, [id])

  const doAction = async (action: string) => {
    setActionLoading(action)
    try {
      await adminApi.post(`/api/v1/genieacs/devices/${id}/${action}`)
      setTimeout(fetchDevice, 5000)
    } catch (err) {
      console.error(`Action ${action} failed`, err)
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Memuat data perangkat...</p>
        </div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-xl font-semibold">Perangkat Tidak Ditemukan</h2>
          <p className="text-muted-foreground">Device ID: {id}</p>
          <Button variant="outline" onClick={() => router.push('/admin/genieacs')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Daftar
          </Button>
        </div>
      </div>
    )
  }

  const isOnline = device.status === 'online'
  const uptime = device.uptime_seconds
    ? formatUptime(device.uptime_seconds)
    : device.last_boot
      ? formatUptime((Date.now() - new Date(device.last_boot).getTime()) / 1000)
      : 'N/A'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push('/admin/genieacs')} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Button>
          <div>
            <h1 className="text-xl font-semibold">
              Detail Perangkat — {device.pppoe_username || device.sn}
            </h1>
            <p className="text-sm text-muted-foreground">
              {device.manufacturer} {device.product_class} — {device.sn}
            </p>
          </div>
        </div>
        <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
          isOnline
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        }`}>
          <span className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => doAction('refresh')}
          disabled={actionLoading === 'refresh'}
        >
          {actionLoading === 'refresh' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => doAction('reboot')}
          disabled={actionLoading === 'reboot'}
        >
          {actionLoading === 'reboot' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
          Reboot
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm('Factory reset? This cannot be undone.')) doAction('factory-reset')
          }}
          disabled={actionLoading === 'factory-reset'}
        >
          {actionLoading === 'factory-reset' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
          Factory Reset
        </Button>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GaugeCard
          label="Redaman ONU"
          value={device.rx_power != null ? `${device.rx_power} dBm` : 'N/A'}
          color={device.rx_power != null && device.rx_power > -25 ? 'green' : device.rx_power != null ? 'red' : 'blue'}
        />
        <GaugeCard
          label="Temperatur"
          value={device.temperature != null ? `${device.temperature}°C` : 'N/A'}
          color={device.temperature != null && device.temperature < 60 ? 'green' : device.temperature != null ? 'red' : 'blue'}
        />
        <GaugeCard
          label="Uptime"
          value={uptime}
          color="green"
        />
      </div>

      {/* Identity + Connection Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informasi Perangkat</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <User className="h-3.5 w-3.5" /> Pelanggan
              </span>
              <span className="font-medium">{device.customer_name || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> Phone
              </span>
              <span>{device.customer_phone || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Fingerprint className="h-3.5 w-3.5" /> No. Layanan
              </span>
              <span className="font-mono">{device.service_number || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" /> PPPoE Username
              </span>
              <span className="font-mono text-xs">{device.pppoe_username || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Server className="h-3.5 w-3.5" /> IP TR-069
              </span>
              <span className="font-mono">{device.ip_address || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5" /> MAC Address
              </span>
              <span className="font-mono text-xs">{device.mac_address || device.oui || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5" /> Manufacturer
              </span>
              <span>{device.manufacturer || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Model
              </span>
              <span>{device.product_class || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" /> Status
              </span>
              <span className={isOnline ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" /> Last Inform
              </span>
              <span>{device.last_inform ? fmtDate(device.last_inform) : '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Signal className="h-3.5 w-3.5" /> RX Power
              </span>
              <span className={device.rx_power != null && device.rx_power < -25 ? 'text-red-600 font-semibold' : device.rx_power != null ? 'text-green-600' : ''}>
                {device.rx_power != null ? `${device.rx_power} dBm` : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" /> TX Power
              </span>
              <span>{device.tx_power != null ? `${device.tx_power} dBm` : '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Thermometer className="h-3.5 w-3.5" /> Temperature
              </span>
              <span>{device.temperature != null ? `${device.temperature}°C` : '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Wifi className="h-3.5 w-3.5" /> PON Mode
              </span>
              <span>{device.pon_mode || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" /> Tgl Isolir
              </span>
              <span>{device.isolir_date ? fmtDate(device.isolir_date) : '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Hardware Ver
              </span>
              <span className="font-mono text-xs">{device.hardware_version || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground flex items-center gap-2">
                <HardDrive className="h-3.5 w-3.5" /> Software Ver
              </span>
              <span className="font-mono text-xs">{device.software_version || '-'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendor Info Card */}
      {device.wifi_configs && device.wifi_configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Konfigurasi WiFi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {device.wifi_configs.map((wifi, idx) => (
                <div key={idx} className="p-3 bg-muted/30 rounded-lg border text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">SSID {wifi.ssid_index || idx + 1}</span>
                    {wifi.ssid && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {wifi.enabled ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SSID:</span>
                    <span className="font-medium">{wifi.ssid || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Password:</span>
                    <span className="font-mono text-xs">
                      {wifi.password ? (showPassword ? wifi.password : '••••••••') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clients:</span>
                    <span>{wifi.active_clients ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel:</span>
                    <span>{wifi.channel ?? '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* WAN Connections */}
      {device.wan_connections && device.wan_connections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Koneksi WAN</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {device.wan_connections.map((wan, idx) => (
                <div key={idx} className="p-3 bg-muted/30 rounded-lg border text-sm space-y-2">
                  <div className="font-medium">WAN {wan.wan_index || idx + 1}</div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span>{wan.connection_type || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Username:</span>
                    <span className="font-mono text-xs">{wan.username || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP:</span>
                    <span className="font-mono text-xs">{wan.ip_address || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">VLAN:</span>
                    <span>{wan.vlan_id ?? '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MAC:</span>
                    <span className="font-mono text-xs">{wan.mac_address || '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Card>
        <CardHeader className="pb-0">
          <TabBar tabs={['TERHUBUNG', 'WIFI', 'LAN', 'WAN']} active={activeTab} onChange={setActiveTab} />
        </CardHeader>
        <CardContent className="pt-4">
          {activeTab === 0 && <ConnectedTab device={device} />}
          {activeTab === 1 && <WiFiTab device={device} onRefresh={fetchDevice} />}
          {activeTab === 2 && <LanTab device={device} onRefresh={fetchDevice} />}
          {activeTab === 3 && <WanTab device={device} onRefresh={fetchDevice} />}
        </CardContent>
      </Card>

      {/* Raw Params (Debug) */}
      {device.params && Object.keys(device.params).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Parameter Lengkap
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({Object.keys(device.params).length} parameter)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto bg-muted/30 rounded-lg p-3 font-mono text-xs space-y-1">
              {Object.entries(device.params).map(([key, val]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-primary shrink-0">{key}</span>
                  <span className="text-muted-foreground">=</span>
                  <span className="break-all">{String(val)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return 'N/A'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function pad(n: number): string { return String(n).padStart(2, '0') }

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleString('id-ID') } catch { return d }
}
