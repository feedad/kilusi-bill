'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import TrafficGraph from '@/components/customer/TrafficGraph'
import {
  Wifi,
  Router,
  Activity,
  Smartphone,
  Laptop,
  Monitor,
  RefreshCw,
  Settings,
  Info,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Download,
  Upload,
  Users,
  Globe,
  Shield,
  Power,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Key,
  Loader2,
  Database
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { api } from '@/lib/api'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'

// Helper functions for dynamic formatting
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatTrafficSpeed(bps: number): string {
  if (bps === 0) return '0 bps'

  const k = 1000
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  const i = Math.floor(Math.log(bps) / Math.log(k))

  return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatSessionDuration(sessionStart: string): string {
  if (!sessionStart) return '0 menit'

  const start = new Date(sessionStart)
  const now = new Date()
  const diffMs = now - start

  if (diffMs < 0) return '0 menit'

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days} hari, ${hours % 24} jam`
  } else if (hours > 0) {
    return `${hours} jam, ${minutes % 60} menit`
  } else if (minutes > 0) {
    return `${minutes} menit, ${seconds % 60} detik`
  } else {
    return `${seconds} detik`
  }
}

interface RadiusInfo {
  username: string
  attribute: string
  sessionActive: boolean
  sessionStart: string
  nasIP: string
}

interface DeviceInfo {
  ipAddress: string
  macAddress: string
  ssid: string
  status: 'online' | 'offline'
  uptime: string
  lastSeen: string
  currentPassword?: string
  radiusUsername?: string
  connectionType?: string
  nasIP?: string
  sessionStartTime?: string
}

interface TrafficData {
  uploadSpeed: number
  downloadSpeed: number
  totalUpload: string
  totalDownload: string
  connectedDevices: number
  sessionDuration: string
  dataUsage?: {
    uploadBytes: number
    downloadBytes: number
    totalBytes: number
  }
  sessionStart?: string
  interface?: string
  mode?: string
  timestamp?: string
  pppoeInterface?: any
  pppoeTraffic?: any
}

interface TrafficDataPoint {
  time: string
  download: number
  upload: number
}

interface ConnectedDevice {
  mac: string
  ip: string
  name: string
  deviceType: 'smartphone' | 'laptop' | 'desktop' | 'other'
  connectionTime: string
  uploadSpeed: number
  downloadSpeed: number
  signalStrength: number
  status: 'online' | 'offline'
}

export default function DeviceSettingsPage() {
  const { customer } = useCustomerAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [radiusInfo, setRadiusInfo] = useState<RadiusInfo | null>(null)
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    ipAddress: 'Loading...',
    macAddress: 'Loading...',
    ssid: 'Loading...',
    status: 'offline',
    uptime: 'Loading...',
    lastSeen: 'Loading...',
    currentPassword: '********'
  })

  const [trafficData, setTrafficData] = useState<TrafficData>({
    uploadSpeed: 0,
    downloadSpeed: 0,
    totalUpload: '0 GB',
    totalDownload: '0 GB',
    connectedDevices: 0,
    sessionDuration: '0 menit'
  })

  const [sessionStart, setSessionStart] = useState<string | null>(null)
  const [sessionBytes, setSessionBytes] = useState({ upload: 0, download: 0 })

  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([])

  const [newSSID, setNewSSID] = useState('')
  const [isRebooting, setIsRebooting] = useState(false)
  const [isUpdatingSSID, setIsUpdatingSSID] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [originalPassword, setOriginalPassword] = useState('********')
  
  // Traffic graph data
  const [trafficHistory, setTrafficHistory] = useState<TrafficDataPoint[]>([])
  const [hasReceivedTrafficData, setHasReceivedTrafficData] = useState(false)
  const maxDataPoints = 20 // Keep last 20 data points (100 seconds with 5-second intervals)

  // Helper functions
  const formatUptime = (dateString: string) => {
    if (!dateString) return '0 menit';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} hari, ${diffHours % 24} jam`;
    } else if (diffHours > 0) {
      return `${diffHours} jam, ${diffMins % 60} menit`;
    } else {
      return `${diffMins} menit`;
    }
  };

  const formatUptimeSeconds = (seconds: number) => {
    if (!seconds || seconds === 0) return '0 menit';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days} hari, ${hours} jam`;
    } else if (hours > 0) {
      return `${hours} jam, ${minutes} menit`;
    } else {
      return `${minutes} menit`;
    }
  };

  const formatConnectionTime = (dateString: string) => {
    if (!dateString) return 'Baru saja';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} hari ${diffHours % 24} jam lalu`;
    } else if (diffHours > 0) {
      return `${diffHours} jam ${diffMins % 60} menit lalu`;
    } else {
      return `${diffMins} menit lalu`;
    }
  };

  // Fetch RADIUS data - menggunakan API yang sama dengan dashboard
  const fetchRadiusData = async () => {
    try {
      console.log('🔄 Starting fetchRadiusData...');

      // Get JWT token from multiple possible storage locations
      let token = null;
      let tokenSource = '';

      // Method 1: Check auth-storage (Zustand persist format)
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        try {
          const parsed = JSON.parse(authStorage);
          token = parsed.state?.token;
          tokenSource = 'auth-storage (Zustand)';
        } catch (e) {
          console.error('Error parsing auth-storage:', e);
        }
      }

      // Method 2: Check customer_token (CustomerAuth library format)
      if (!token) {
        const customerToken = localStorage.getItem('customer_token');
        if (customerToken) {
          token = customerToken;
          tokenSource = 'customer_token (CustomerAuth)';
        }
      }

      console.log(`🔑 JWT token present: ${!!token} from ${tokenSource}`);

      if (!token) {
        console.log('🔍 Available localStorage keys:', Object.keys(localStorage));
        console.error('❌ No customer token found');
        throw new Error('Token tidak ditemukan');
      }

      console.log('🔑 Using manual fetch with token from localStorage');

      // Use manual fetch like customer portal
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1/customer-radius/info`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        if (response.status === 401) {
          console.error('❌ Token expired or invalid');
          localStorage.removeItem('auth-storage');
          window.location.href = '/customer/login';
          return;
        }
        throw new Error(`Gagal mengambil data RADIUS: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ RADIUS API Response:', result);

      if (result.success) {
        // Data dari API customer-radius/info yang sudah lengkap
        const data = result.data;

        // Data radius dari API - pastikan NAS IP menampilkan dash saat offline
        const isOffline = data.deviceInfo.status === 'offline';
        const radiusData = {
          username: data.radiusInfo.username,
          attribute: data.radiusInfo.attribute,
          sessionActive: data.radiusInfo.sessionActive,
          sessionStart: data.radiusInfo.sessionStart,
          nasIP: isOffline ? '-' : (data.radiusInfo.nasIP || '-')
        };

        // Info perangkat dari API - data sudah lengkap, tapi pastikan offline menampilkan dash
        const deviceInfoData = {
          ipAddress: isOffline ? '-' : (data.deviceInfo.ipAddress || '-'),
          macAddress: isOffline ? '-' : (data.deviceInfo.macAddress || '-'),
          ssid: data.deviceInfo.ssid,
          status: data.deviceInfo.status,
          uptime: data.deviceInfo.uptime,
          lastSeen: isOffline ? '-' : (data.deviceInfo.lastSeen || '-'),
          currentPassword: '********',
          radiusUsername: data.deviceInfo.radiusUsername,
          connectionType: isOffline ? '-' : (data.deviceInfo.connectionType || '-'),
          nasIP: isOffline ? '-' : (data.deviceInfo.nasIP || '-'),
          sessionStartTime: isOffline ? null : data.deviceInfo.sessionStartTime
        };

        // Connected devices dari API
        const connectedDevicesData = data.connectedDevices || [];

        // Store session start for real-time counter
        if (data.deviceInfo.sessionStartTime) {
          setSessionStart(data.deviceInfo.sessionStartTime);
        }

        // Store session bytes for dynamic formatting
        if (data.trafficStats.dataUsage) {
          console.log('📊 Traffic data from API:', data.trafficStats.dataUsage);
          console.log('📊 Upload bytes:', data.trafficStats.dataUsage.uploadBytes);
          console.log('📊 Download bytes:', data.trafficStats.dataUsage.downloadBytes);
          setSessionBytes({
            upload: data.trafficStats.dataUsage.uploadBytes || 0,
            download: data.trafficStats.dataUsage.downloadBytes || 0
          });
        } else {
          console.log('❌ No dataUsage found in trafficStats:', data.trafficStats);
        }

        setRadiusInfo(radiusData);
        setDeviceInfo(deviceInfoData);
        setConnectedDevices(connectedDevicesData);

        // Update SSID field
        setNewSSID(deviceInfoData.ssid || '');

        console.log('✅ RADIUS data loaded successfully from customer-radius API');
      } else {
        throw new Error(result.message || 'Gagal memuat data RADIUS');
      }
    } catch (error: any) {
      console.error('❌ Error fetching RADIUS data:', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      // Fallback data untuk mencegah error - gunakan dash untuk konsistensi
      setDeviceInfo({
        ipAddress: '-',
        macAddress: '-',
        ssid: '-',
        status: 'offline',
        uptime: '0 menit',
        lastSeen: '-',
        currentPassword: '********',
        radiusUsername: '-',
        connectionType: '-',
        nasIP: '-',
        sessionStartTime: null
      });

      toast.error(`❌ ${error.message || 'Gagal memuat data RADIUS'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch real-time traffic data
  const fetchTrafficData = async () => {
    try {
      // Get token using same logic as API client
      let token = null;

      // Try customer_token first (used by customer portal)
      const customerToken = localStorage.getItem('customer_token');
      if (customerToken) {
        token = customerToken;
      } else {
        // Fallback to auth-storage (used by JWT authentication)
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
          const parsed = JSON.parse(authStorage);
          token = parsed.state?.token;
        }
      }

      if (!token) {
        console.log('No token found for traffic data');
        return;
      }

      console.log('🔑 Using manual fetch for traffic data with token from localStorage');

      // Use manual fetch like customer portal
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1/customer-traffic/realtime`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.error('❌ Traffic API - Token expired or invalid');
          localStorage.removeItem('customer_token');
          return;
        }
        throw new Error(`Traffic API failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.success && result.data && result.data.traffic) {
        const traffic = result.data.traffic;

        // Mark that we've received traffic data at least once
        setHasReceivedTrafficData(true);

        // Update traffic data state
        setTrafficData(prev => ({
          ...prev,
          uploadSpeed: traffic.uploadSpeed || 0,
          downloadSpeed: traffic.downloadSpeed || 0,
          interface: traffic.interface || prev.interface,
          mode: traffic.mode || prev.mode,
          timestamp: traffic.timestamp || new Date().toISOString(),
          pppoeInterface: traffic.pppoeInterface,
          pppoeTraffic: traffic.pppoeTraffic
        }));

        // Add data point to history for graph
        const currentTime = new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const newDataPoint: TrafficDataPoint = {
          time: currentTime,
          download: traffic.downloadSpeed || 0,
          upload: traffic.uploadSpeed || 0
        };

        setTrafficHistory(prev => {
          const updated = [...prev, newDataPoint];
          // Keep only the last maxDataPoints
          if (updated.length > maxDataPoints) {
            return updated.slice(-maxDataPoints);
          }
          return updated;
        });

        console.log('✅ Traffic data updated:', traffic);
        console.log('📊 Traffic speeds - Upload:', traffic.uploadSpeed, 'Download:', traffic.downloadSpeed);
        console.log('📈 Traffic history length:', trafficHistory.length + 1);
      } else {
        console.warn('⚠️ Traffic API returned non-success:', result);
      }
    } catch (error) {
      console.warn('⚠️ Error fetching traffic data:', error.message);
      // Don't show error to user for traffic data, just log it
    }
  };

  // Real-time session counter and updates
  useEffect(() => {
    // Initial data fetch
    fetchRadiusData();

    // Initial traffic data fetch
    fetchTrafficData();

    // Real-time session duration counter (every second)
    const sessionInterval = setInterval(() => {
      if (sessionStart && deviceInfo.status === 'online') {
        // Update session duration in real-time
        const duration = formatSessionDuration(sessionStart);
        setTrafficData(prev => ({
          ...prev,
          sessionDuration: duration
        }));
      }
    }, 1000);

    // Traffic data update every 5 seconds
    const trafficInterval = setInterval(() => {
      fetchTrafficData();
    }, 5000);

    // Full data refresh every 30 seconds
    const dataInterval = setInterval(() => {
      fetchRadiusData();
    }, 30000);

    return () => {
      clearInterval(sessionInterval);
      clearInterval(trafficInterval);
      clearInterval(dataInterval);
    };
  }, [sessionStart, deviceInfo.status]);

  const handleSSIDUpdate = async () => {
    if (!newSSID.trim()) {
      toast.error('❌ SSID tidak boleh kosong')
      return
    }

    if (newSSID.trim().length < 3) {
      toast.error('❌ SSID minimal 3 karakter')
      return
    }

    setIsUpdatingSSID(true)
    try {
      // Get JWT token from auth-storage (OTP login only)
      let token = null;

      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        token = parsed.state?.token;
      }

      if (!token) {
        throw new Error('Token tidak ditemukan');
      }

      // Use manual fetch like customer portal
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1/customer-auth-nextjs/update-ssid`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ssid: newSSID.trim()
        })
      });

      if (!response.ok) {
        throw new Error(`Gagal memperbarui SSID: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setDeviceInfo(prev => ({ ...prev, ssid: newSSID.trim() }));
        toast.success('✅ SSID berhasil diperbarui!');
      } else {
        throw new Error(result.message || 'Gagal memperbarui SSID');
      }
    } catch (error: any) {
      console.error('Error updating SSID:', error);
      toast.error(`❌ ${error.message || 'Gagal memperbarui SSID'}`);
    } finally {
      setIsUpdatingSSID(false)
    }
  }

  const handlePasswordUpdate = async () => {
    if (!deviceInfo.currentPassword.trim()) {
      toast.error('❌ Password tidak boleh kosong')
      return
    }

    if (deviceInfo.currentPassword.length < 8) {
      toast.error('❌ Password minimal 8 karakter')
      return
    }

    setIsUpdatingPassword(true)
    try {
      // Get JWT token from auth-storage (OTP login only)
      let token = null;

      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const parsed = JSON.parse(authStorage);
        token = parsed.state?.token;
      }

      if (!token) {
        throw new Error('Token tidak ditemukan');
      }

      // Use manual fetch like customer portal
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1/customer-auth-nextjs/update-password`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password: deviceInfo.currentPassword
        })
      });

      if (!response.ok) {
        throw new Error(`Gagal memperbarui password: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Save the new password as original and mask the display
        const newPassword = deviceInfo.currentPassword;
        setOriginalPassword(newPassword);
        setDeviceInfo(prev => ({ ...prev, currentPassword: '********' }));

        toast.success('✅ Password WiFi berhasil diperbarui!');

        // Reset password visibility
        setShowPassword(false);
      } else {
        throw new Error(result.message || 'Gagal memperbarui password');
      }
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(`❌ ${error.message || 'Gagal memperbarui password'}`);
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleReboot = async () => {
    if (!confirm('Apakah Anda yakin ingin me-reboot perangkat? Proses ini akan memakan waktu 2-3 menit.')) {
      return
    }

    setIsRebooting(true)
    try {
      // Simulate GenieACS API call
      await new Promise(resolve => setTimeout(resolve, 3000))

      toast.success('✅ Perangkat berhasil di-reboot! Tunggu 2-3 menit untuk koneksi normal.')

      // Simulate device offline during reboot
      setDeviceInfo(prev => ({ ...prev, status: 'offline' }))
      setTimeout(() => {
        setDeviceInfo(prev => ({ ...prev, status: 'online' }))
      }, 180000) // 3 minutes
    } catch (error) {
      toast.error('❌ Gagal me-reboot perangkat')
    } finally {
      setIsRebooting(false)
    }
  }

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'smartphone':
        return <Smartphone className="h-4 w-4" />
      case 'laptop':
        return <Laptop className="h-4 w-4" />
      case 'desktop':
        return <Monitor className="h-4 w-4" />
      default:
        return <Monitor className="h-4 w-4" />
    }
  }

  const getSignalStrength = (strength: number) => {
    if (strength > -50) return { text: 'Excellent', color: 'text-green-600 dark:text-green-400' }
    if (strength > -60) return { text: 'Good', color: 'text-blue-600 dark:text-blue-400' }
    if (strength > -70) return { text: 'Fair', color: 'text-yellow-600 dark:text-yellow-400' }
    return { text: 'Poor', color: 'text-red-600 dark:text-red-400' }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <Router className="h-6 w-6 md:h-8 md:w-8 text-blue-600 dark:text-blue-400" />
                Setting Perangkat
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2 text-sm md:text-base">
                Kelola pengaturan perangkat dan WiFi Anda
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              ) : (
                <Badge
                  variant={deviceInfo.status === 'online' ? 'default' : 'destructive'}
                  className="flex items-center gap-2 px-3 py-1"
                >
                  {deviceInfo.status === 'online' ? (
                    <><CheckCircle className="h-3 w-3" /> Online</>
                  ) : (
                    <><XCircle className="h-3 w-3" /> Offline</>
                  )}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Device Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          {/* IP Address */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Globe className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                </div>
                IP Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{deviceInfo.ipAddress}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Assigned IP</p>
                </>
              )}
            </CardContent>
          </Card>

          {/* MAC Address */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                MAC Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{deviceInfo.macAddress}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Hardware ID</p>
            </CardContent>
          </Card>

          {/* Connected Devices */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Perangkat Terhubung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{trafficData.connectedDevices}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Aktif sekarang</p>
            </CardContent>
          </Card>

          {/* Session Duration */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Session Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{trafficData.sessionDuration}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {deviceInfo.status === 'online' ? 'Active session' : 'No active session'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left Column - Data Usage & Traffic Monitoring */}
          <div className="space-y-6">
            {/* Data Usage from RADIUS */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Pemakaian Data Anda
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Upload className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Upload</span>
                    </div>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {formatBytes(sessionBytes.upload)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">Download</span>
                    </div>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {formatBytes(sessionBytes.download)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Real-time Traffic Graph */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Traffic Monitoring (Real-time)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Traffic Info */}
                {!hasReceivedTrafficData && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <Activity className="h-4 w-4 inline mr-1" />
                      Menghubungkan ke monitoring traffic...
                    </p>
                  </div>
                )}

                {hasReceivedTrafficData && trafficHistory.length <= 2 && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      <Info className="h-4 w-4 inline mr-1" />
                      Kecepatan real-time akan terlihat setelah beberapa detik
                    </p>
                  </div>
                )}

                <TrafficGraph
                  data={trafficHistory}
                  interfaceName={trafficData.interface || 'N/A'}
                  isActive={trafficData.downloadSpeed > 0 || trafficData.uploadSpeed > 0}
                  hasReceivedData={hasReceivedTrafficData}
                />

                {/* Current Traffic Rates Summary */}
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Download</span>
                    </div>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {formatTrafficSpeed(trafficData.downloadSpeed)}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Upload className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">Upload</span>
                    </div>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      {formatTrafficSpeed(trafficData.uploadSpeed)}
                    </p>
                  </div>
                </div>

                {/* Total Traffic Summary */}
                {trafficData.pppoeTraffic && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Statistik Traffic Total
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Total Download</p>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                          {formatBytes(trafficData.pppoeTraffic.totalDownload || 0)}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Total Upload</p>
                        <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                          {formatBytes(trafficData.pppoeTraffic.totalUpload || 0)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Interface: {trafficData.pppoeTraffic.name || trafficData.interface || 'N/A'}
                      </p>
                    </div>
                  </div>
                )}

                              </CardContent>
            </Card>
          </div>


          {/* Right Column - Device Settings & Control */}
          <div className="space-y-6">
            {/* WiFi Settings */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  Pengaturan WiFi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* SSID Settings */}
                <div className="space-y-3">
                  <Label htmlFor="ssid" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    WiFi Network Name (SSID)
                  </Label>
                  <div className="space-y-2">
                    <Input
                      id="ssid"
                      value={newSSID}
                      onChange={(e) => setNewSSID(e.target.value)}
                      placeholder="Masukkan SSID baru"
                      className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                      disabled={isUpdatingSSID}
                    />
                    <Button
                      onClick={handleSSIDUpdate}
                      disabled={isUpdatingSSID || newSSID === deviceInfo.ssid}
                      className="w-full"
                      size="sm"
                    >
                      {isUpdatingSSID ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Mengupdate...
                        </>
                      ) : (
                        <>
                          <Wifi className="h-4 w-4 mr-2" />
                          Update SSID
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* WiFi Password Settings */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Lock className="h-4 w-4 mr-1 inline" />
                    WiFi Password
                  </Label>
                  <div className="space-y-2">
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={deviceInfo.currentPassword}
                        onChange={(e) => setDeviceInfo(prev => ({ ...prev, currentPassword: e.target.value }))}
                        placeholder="Klik untuk melihat/edit password WiFi"
                        className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 pr-10"
                        disabled={isUpdatingPassword}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={async () => {
  if (!showPassword && deviceInfo.currentPassword === '********') {
    // Fetch actual password when revealing for the first time
    try {
      // Simulate API call to get current password
      // In real implementation, this would call the API to get the actual password
      const actualPassword = 'MyCurrentP@ss123';
      setDeviceInfo(prev => ({ ...prev, currentPassword: actualPassword }));
      setOriginalPassword(actualPassword);
      setShowPassword(true);
      toast.success('✅ Password saat ini ditampilkan');
    } catch (error) {
      toast.error('❌ Gagal menampilkan password');
    }
  } else {
    setShowPassword(!showPassword);
  }
}}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </Button>
                    </div>
                    <Button
                      onClick={handlePasswordUpdate}
                      disabled={isUpdatingPassword || !deviceInfo.currentPassword || deviceInfo.currentPassword.length < 8 || deviceInfo.currentPassword === originalPassword}
                      className="w-full"
                      size="sm"
                    >
                      {isUpdatingPassword ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Mengupdate...
                        </>
                      ) : (
                        <>
                          <Key className="h-4 w-4 mr-2" />
                          Simpan Password
                        </>
                      )}
                    </Button>
                  </div>
                </div>

          </CardContent>
          </Card>

            {/* Device Controls */}
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Power className="h-5 w-5 text-red-600 dark:text-red-400" />
                  Kontrol Perangkat
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Reboot Device */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reboot Perangkat
                  </Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reboot akan memutus semua koneksi selama 2-3 menit
                  </p>
                  <Button
                    onClick={handleReboot}
                    disabled={isRebooting || deviceInfo.status === 'offline'}
                    variant="destructive"
                    className="w-full"
                    size="sm"
                  >
                    {isRebooting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Me-reboot...
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4 mr-2" />
                        Reboot Perangkat
                      </>
                    )}
                  </Button>
                </div>

          </CardContent>
          </Card>
          </div>
        </div>
      </div>
    </div>
  )
}