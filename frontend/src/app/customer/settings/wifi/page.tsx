'use client'

import React, { useState, useEffect } from 'react'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Wifi,
  Settings,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  Shield,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  Smartphone,
  Laptop,
  Tablet,
  Router,
  Lock,
  Unlock,
  QrCode,
  Download
} from 'lucide-react'
import { toast } from 'react-hot-toast'

interface WiFiSettings {
  ssid: string
  password: string
  security: 'WPA2' | 'WPA3' | 'OPEN'
  band: '2.4ghz' | '5ghz' | 'dual'
  guest_network: {
    enabled: boolean
    ssid: string
    password: string
    bandwidth_limit: number
    time_limit?: number
  }
  device_limit: number
  firewall: {
    enabled: boolean
    blocked_sites: string[]
  }
  parental_control: {
    enabled: boolean
    schedule: {
      start: string
      end: string
      days: string[]
    }
  }
}

interface ConnectedDevice {
  id: string
  name: string
  mac: string
  ip: string
  type: 'smartphone' | 'laptop' | 'tablet' | 'other'
  connected_at: string
  bandwidth_used: number
  is_active: boolean
}

interface WiFiStats {
  connected_devices: number
  total_devices: number
  bandwidth_used: number
  signal_strength: number
  uptime: number
  data_today: number
}

export default function WiFiSettingsPage() {
  const { customer } = useCustomerAuth()
  const [wifiSettings, setWiFiSettings] = useState<WiFiSettings | null>(null)
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([])
  const [wifiStats, setWifiStats] = useState<WiFiStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showGuestPassword, setShowGuestPassword] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'guest' | 'devices' | 'security'>('basic')

  useEffect(() => {
    fetchWiFiData()
  }, [])

  const fetchWiFiData = async () => {
    try {
      setLoading(true)
      // In a real implementation, this would fetch from your API
      // const [settingsRes, devicesRes, statsRes] = await Promise.all([
      //   fetch('/api/v1/customer/wifi/settings'),
      //   fetch('/api/v1/customer/wifi/devices'),
      //   fetch('/api/v1/customer/wifi/stats')
      // ])

      // Mock data for demonstration
      const mockSettings: WiFiSettings = {
        ssid: 'Kilusi_Home_50MBPS',
        password: 'Kilusi12345',
        security: 'WPA2',
        band: 'dual',
        guest_network: {
          enabled: true,
          ssid: 'Kilusi_Guest',
          password: 'Guest123',
          bandwidth_limit: 5
        },
        device_limit: 10,
        firewall: {
          enabled: false,
          blocked_sites: []
        },
        parental_control: {
          enabled: false,
          schedule: {
            start: '22:00',
            end: '06:00',
            days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
          }
        }
      }

      const mockDevices: ConnectedDevice[] = [
        {
          id: '1',
          name: "Budi's iPhone",
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.1.101',
          type: 'smartphone',
          connected_at: '2025-01-19T08:30:00Z',
          bandwidth_used: 245760000,
          is_active: true
        },
        {
          id: '2',
          name: "Budi's Laptop",
          mac: 'BB:CC:DD:EE:FF:AA',
          ip: '192.168.1.102',
          type: 'laptop',
          connected_at: '2025-01-19T09:15:00Z',
          bandwidth_used: 1048576000,
          is_active: true
        },
        {
          id: '3',
          name: "Samsung Tablet",
          mac: 'CC:DD:EE:FF:AA:BB',
          ip: '192.168.1.103',
          type: 'tablet',
          connected_at: '2025-01-18T14:20:00Z',
          bandwidth_used: 524288000,
          is_active: false
        }
      ]

      const mockStats: WiFiStats = {
        connected_devices: 2,
        total_devices: 15,
        bandwidth_used: 1572864000,
        signal_strength: 85,
        uptime: 172800,
        data_today: 2147483648
      }

      setWiFiSettings(mockSettings)
      setConnectedDevices(mockDevices)
      setWifiStats(mockStats)
    } catch (error) {
      toast.error('❌ Gagal memuat data WiFi')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!wifiSettings) return

    setSaving(true)
    try {
      // In a real implementation, this would save to your API
      // await fetch('/api/v1/customer/wifi/settings', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(wifiSettings)
      // })

      // Mock save
      await new Promise(resolve => setTimeout(resolve, 2000))

      toast.success('✅ Pengaturan WiFi berhasil disimpan!')
    } catch (error) {
      toast.error('❌ Gagal menyimpan pengaturan WiFi')
    } finally {
      setSaving(false)
    }
  }

  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let password = ''
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setWiFiSettings(prev => prev ? { ...prev, password } : null)
  }

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`✅ ${label} berhasil disalin!`)
  }

  const handleRestartRouter = async () => {
    try {
      // In a real implementation, this would restart the router
      toast.success('🔄 Router sedang dimulai ulang. Proses memerlukan 2-3 menit.')
    } catch (error) {
      toast.error('❌ Gagal memulai ulang router')
    }
  }

  const handleDisconnectDevice = async (deviceId: string) => {
    try {
      // In a real implementation, this would disconnect the device
      setConnectedDevices(prev =>
        prev.map(device =>
          device.id === deviceId
            ? { ...device, is_active: false }
            : device
        )
      )
      toast.success('✅ Perangkat berhasil diputus')
    } catch (error) {
      toast.error('❌ Gagal memutus perangkat')
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${days}h ${hours}j ${minutes}m`
  }

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'smartphone':
        return <Smartphone className="h-5 w-5" />
      case 'laptop':
        return <Laptop className="h-5 w-5" />
      case 'tablet':
        return <Tablet className="h-5 w-5" />
      default:
        return <Router className="h-5 w-5" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat pengaturan WiFi...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Pengaturan WiFi</h1>
          <p className="text-gray-600">Kelola jaringan WiFi dan perangkat terhubung</p>
        </div>

        {/* WiFi Stats */}
        {wifiStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Perangkat Terhubung</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{wifiStats.connected_devices}/{wifiStats.total_devices}</div>
                <p className="text-xs text-muted-foreground">Maksimal perangkat</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Data Hari Ini</CardTitle>
                <Wifi className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBytes(wifiStats.data_today)}</div>
                <p className="text-xs text-muted-foreground">Total penggunaan</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Kekuatan Sinyal</CardTitle>
                <Router className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{wifiStats.signal_strength}%</div>
                <p className="text-xs text-muted-foreground">Kualitas sinyal</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime Router</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatUptime(wifiStats.uptime)}</div>
                <p className="text-xs text-muted-foreground">Waktu operasional</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { id: 'basic', label: 'Pengaturan Dasar', icon: <Settings className="h-4 w-4" /> },
            { id: 'guest', label: 'Guest Network', icon: <Users className="h-4 w-4" /> },
            { id: 'devices', label: 'Perangkat', icon: <Router className="h-4 w-4" /> },
            { id: 'security', label: 'Keamanan', icon: <Shield className="h-4 w-4" /> }
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              onClick={() => setActiveTab(tab.id as any)}
              className="flex items-center space-x-2"
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Button>
          ))}
        </div>

        {wifiSettings && (
          <>
            {/* Basic Settings */}
            {activeTab === 'basic' && (
              <Card>
                <CardHeader>
                  <CardTitle>Pengaturan Dasar WiFi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="ssid">Nama WiFi (SSID)</Label>
                      <Input
                        id="ssid"
                        value={wifiSettings.ssid}
                        onChange={(e) => setWiFiSettings(prev => prev ? { ...prev, ssid: e.target.value } : null)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="band">Frekuensi</Label>
                      <select
                        id="band"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={wifiSettings.band}
                        onChange={(e) => setWiFiSettings(prev => prev ? { ...prev, band: e.target.value as any } : null)}
                      >
                        <option value="2.4ghz">2.4 GHz</option>
                        <option value="5ghz">5 GHz</option>
                        <option value="dual">Dual Band</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="password">Password WiFi</Label>
                    <div className="flex space-x-2 mt-1">
                      <div className="relative flex-1">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={wifiSettings.password}
                          onChange={(e) => setWiFiSettings(prev => prev ? { ...prev, password: e.target.value } : null)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleGeneratePassword}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Generate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handleCopyToClipboard(wifiSettings.password, 'Password WiFi')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="security">Tipe Keamanan</Label>
                    <select
                      id="security"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={wifiSettings.security}
                      onChange={(e) => setWiFiSettings(prev => prev ? { ...prev, security: e.target.value as any } : null)}
                    >
                      <option value="WPA2">WPA2</option>
                      <option value="WPA3">WPA3</option>
                      <option value="OPEN">Open (Tidak Disarankan)</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-4">
                    <Button
                      variant="outline"
                      onClick={handleRestartRouter}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Restart Router
                    </Button>
                    <Button onClick={handleSaveSettings} disabled={saving}>
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Menyimpan...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Simpan Pengaturan
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Guest Network */}
            {activeTab === 'guest' && (
              <Card>
                <CardHeader>
                  <CardTitle>Pengaturan Guest Network</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Aktifkan Guest Network</h3>
                      <p className="text-sm text-gray-600">Berikan akses internet ke tamu tanpa memberikan akses ke jaringan utama</p>
                    </div>
                    <Button
                      variant={wifiSettings.guest_network.enabled ? 'default' : 'outline'}
                      onClick={() => setWiFiSettings(prev => prev ? {
                        ...prev,
                        guest_network: { ...prev.guest_network, enabled: !prev.guest_network.enabled }
                      } : null)}
                    >
                      {wifiSettings.guest_network.enabled ? 'Aktif' : 'Nonaktif'}
                    </Button>
                  </div>

                  {wifiSettings.guest_network.enabled && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label htmlFor="guest_ssid">Nama Guest WiFi</Label>
                          <Input
                            id="guest_ssid"
                            value={wifiSettings.guest_network.ssid}
                            onChange={(e) => setWiFiSettings(prev => prev ? {
                              ...prev,
                              guest_network: { ...prev.guest_network, ssid: e.target.value }
                            } : null)}
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label htmlFor="guest_password">Password Guest</Label>
                          <div className="flex space-x-2 mt-1">
                            <div className="relative flex-1">
                              <Input
                                id="guest_password"
                                type={showGuestPassword ? 'text' : 'password'}
                                value={wifiSettings.guest_network.password}
                                onChange={(e) => setWiFiSettings(prev => prev ? {
                                  ...prev,
                                  guest_network: { ...prev.guest_network, password: e.target.value }
                                } : null)}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full"
                                onClick={() => setShowGuestPassword(!showGuestPassword)}
                              >
                                {showGuestPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleCopyToClipboard(wifiSettings.guest_network.password, 'Password Guest')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="bandwidth_limit">Batas Kecepatan Guest (Mbps)</Label>
                        <Input
                          id="bandwidth_limit"
                          type="number"
                          value={wifiSettings.guest_network.bandwidth_limit}
                          onChange={(e) => setWiFiSettings(prev => prev ? {
                            ...prev,
                            guest_network: { ...prev.guest_network, bandwidth_limit: parseInt(e.target.value) }
                          } : null)}
                          className="mt-1 w-full md:w-1/2"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex space-x-4">
                    <Button onClick={handleSaveSettings} disabled={saving}>
                      {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                    </Button>
                    <Button variant="outline">
                      <QrCode className="h-4 w-4 mr-2" />
                      Generate QR Code
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Connected Devices */}
            {activeTab === 'devices' && (
              <Card>
                <CardHeader>
                  <CardTitle>Perangkat Terhubung</CardTitle>
                </CardHeader>
                <CardContent>
                  {connectedDevices.length === 0 ? (
                    <div className="text-center py-8">
                      <Router className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Belum ada perangkat terhubung</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {connectedDevices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="p-2 bg-gray-100 rounded-full">
                              {getDeviceIcon(device.type)}
                            </div>
                            <div>
                              <h4 className="font-semibold">{device.name}</h4>
                              <p className="text-sm text-gray-600">IP: {device.ip} • MAC: {device.mac}</p>
                              <div className="flex items-center space-x-4 mt-1">
                                <span className="text-xs text-gray-500">
                                  Terhubung: {new Date(device.connected_at).toLocaleDateString('id-ID')}
                                </span>
                                <span className="text-xs text-gray-500">
                                  Data: {formatBytes(device.bandwidth_used)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Badge className={device.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              {device.is_active ? 'Aktif' : 'Tidak Aktif'}
                            </Badge>

                            {device.is_active && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDisconnectDevice(device.id)}
                              >
                                <Unlock className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Security */}
            {activeTab === 'security' && (
              <Card>
                <CardHeader>
                  <CardTitle>Pengaturan Keamanan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Firewall</h3>
                      <p className="text-sm text-gray-600">Blokir akses ke situs tertentu</p>
                    </div>
                    <Button
                      variant={wifiSettings.firewall.enabled ? 'default' : 'outline'}
                      onClick={() => setWiFiSettings(prev => prev ? {
                        ...prev,
                        firewall: { ...prev.firewall, enabled: !prev.firewall.enabled }
                      } : null)}
                    >
                      {wifiSettings.firewall.enabled ? 'Aktif' : 'Nonaktif'}
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">Parental Control</h3>
                      <p className="text-sm text-gray-600">Batasi akses internet untuk anak-anak</p>
                    </div>
                    <Button
                      variant={wifiSettings.parental_control.enabled ? 'default' : 'outline'}
                      onClick={() => setWiFiSettings(prev => prev ? {
                        ...prev,
                        parental_control: { ...prev.parental_control, enabled: !prev.parental_control.enabled }
                      } : null)}
                    >
                      {wifiSettings.parental_control.enabled ? 'Aktif' : 'Nonaktif'}
                    </Button>
                  </div>

                  <div>
                    <Label htmlFor="device_limit">Batas Perangkat</Label>
                    <Input
                      id="device_limit"
                      type="number"
                      min="1"
                      max="50"
                      value={wifiSettings.device_limit}
                      onChange={(e) => setWiFiSettings(prev => prev ? {
                        ...prev,
                        device_limit: parseInt(e.target.value)
                      } : null)}
                      className="mt-1 w-full md:w-1/2"
                    />
                    <p className="text-sm text-gray-500 mt-1">
                      Maksimal {wifiSettings.device_limit} perangkat dapat terhubung simultan
                    </p>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="ml-2">
                      <strong>Tip Keamanan:</strong> Gunakan password yang kuat dan unik. Ganti password secara rutin untuk menjaga keamanan jaringan Anda.
                    </AlertDescription>
                  </Alert>

                  <div className="flex space-x-4">
                    <Button onClick={handleSaveSettings} disabled={saving}>
                      {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}