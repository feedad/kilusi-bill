'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminApi } from '@/lib/api-clients'
import type { ACSDevice, ACSWiFiConfig } from '../types'
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

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>
  if (!device) return <div className="p-8 text-red-500">Device not found</div>

  const isOnline = device.status === 'online'
  const uptime = device.uptime_seconds
    ? formatUptime(device.uptime_seconds)
    : device.last_boot
      ? formatUptime((Date.now() - new Date(device.last_boot).getTime()) / 1000)
      : 'N/A'

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/genieacs')} className="text-blue-600 hover:underline">
            ← Kembali
          </button>
          <h1 className="text-lg font-semibold">
            DETAIL PERANGKAT — {device.pppoe_username || device.sn}
          </h1>
        </div>
        <button onClick={() => router.push('/admin/genieacs')} className="text-gray-500 hover:text-gray-700 text-xl">
          ✕
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => doAction('refresh')} disabled={actionLoading === 'refresh'}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
          {actionLoading === 'refresh' ? '⏳' : '🔄'} Refresh
        </button>
        <button onClick={() => doAction('reboot')} disabled={actionLoading === 'reboot'}
          className="px-3 py-1.5 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-50">
          {actionLoading === 'reboot' ? '⏳' : '🔌'} Reboot
        </button>
        <button onClick={() => {
          if (confirm('Factory reset? This cannot be undone.')) doAction('factory-reset')
        }} disabled={actionLoading === 'factory-reset'}
          className="px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
          {actionLoading === 'factory-reset' ? '⏳' : '⚠️'} Reset
        </button>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <GaugeCard label="📶 REDAMAN ONU" value={device.rx_power != null ? `${device.rx_power} dBm` : 'N/A'} color="blue" />
        <GaugeCard label="🌡️ TEMPERATURE" value={device.temperature != null ? `${device.temperature}°C` : 'N/A'} color="red" />
        <GaugeCard label="🕒 UPTIME" value={uptime} color="green" />
      </div>

      {/* Identity */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-4 p-4 bg-gray-50 rounded-lg text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Pelanggan</span><span>{device.customer_name || 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Username</span><span className="font-mono">{device.pppoe_username || 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{device.customer_phone || 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">IP TR069</span><span className="font-mono">{device.ip_address || 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">No. Layanan</span><span>{device.service_number || 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">SuperAdmin</span><span>{device.manufacturer || '-'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Tgl Isolir</span><span>{device.isolir_date || '-'}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">SuperPassword</span><span className="font-mono">••••••••</span></div>
        <div className="col-span-2 border-t pt-2 mt-1">
          <div className="flex justify-between"><span className="text-gray-500">Status</span>
            <span className={isOnline ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
              ● {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="flex justify-between"><span className="text-gray-500">Serial Number</span><span className="font-mono text-xs">{device.sn}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Last Inform</span><span>{device.last_inform ? fmtDate(device.last_inform) : '-'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Device ID</span><span className="font-mono text-xs">{device.oui}-{device.product_class}-{device.sn}</span></div>
        </div>
      </div>

      {/* Tabs */}
      <TabBar tabs={['TERHUBUNG', 'WIFI', 'LAN', 'WAN']} active={activeTab} onChange={setActiveTab} />
      
      <div className="mt-2">
        {activeTab === 0 && <ConnectedTab device={device} />}
        {activeTab === 1 && <WiFiTab device={device} onRefresh={fetchDevice} />}
        {activeTab === 2 && <LanTab device={device} onRefresh={fetchDevice} />}
        {activeTab === 3 && <WanTab device={device} onRefresh={fetchDevice} />}
      </div>
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
