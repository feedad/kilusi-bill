'use client'

import { useState } from 'react'
import { adminApi } from '@/lib/api-clients'
import type { ACSDevice, ACSWiFiConfig } from '../types'

export default function WiFiTab({ device, onRefresh }: { device: ACSDevice; onRefresh: () => void }) {
  const configs = device.wifi_configs || []
  const [open, setOpen] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const toggle = (i: number) => setOpen(open === i ? null : i)

  return (
    <div className="space-y-2">
      {configs.map((cfg, i) => (
        <Collapsible
          key={cfg.ssid_index ?? i}
          title={`SSID ${cfg.ssid_index} — ${cfg.ssid || '(unnamed)'}`}
          badge={cfg.enabled ? '● ENABLED' : '⚫ DISABLED'}
          badgeColor={cfg.enabled ? 'text-green-600' : 'text-gray-400'}
          open={open === i}
          onToggle={() => toggle(i)}
        >
          <WiFiForm cfg={cfg} deviceId={device.id} onRefresh={onRefresh} />
        </Collapsible>
      ))}
      {configs.length === 0 && <p className="text-gray-400 text-sm p-4">No WiFi configs available</p>}
    </div>
  )
}

function WiFiForm({ cfg, deviceId, onRefresh }: { cfg: ACSWiFiConfig; deviceId: string; onRefresh: () => void }) {
  const [ssid, setSSID] = useState(cfg.ssid)
  const [password, setPassword] = useState(cfg.password || '')
  const [showPass, setShowPass] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.put(`/api/v1/genieacs/devices/${deviceId}/wifi/${cfg.ssid_index}`, {
        ssid,
        password: password || undefined,
        enabled: cfg.enabled,
        security_mode: cfg.security_mode,
        channel: cfg.channel,
      })
      setTimeout(onRefresh, 3000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">SSID</label>
          <input value={ssid} onChange={e => setSSID(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Password</label>
          <div className="flex gap-1">
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border rounded px-2 py-1 text-sm font-mono" />
            <button onClick={() => setShowPass(!showPass)} className="px-2 border rounded text-sm">👁️</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Security</label>
          <input value={cfg.security_mode || 'WPA2-PSK'} readOnly className="w-full border rounded px-2 py-1 text-sm bg-gray-50" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Channel (0=Auto)</label>
          <input value={cfg.channel} readOnly className="w-full border rounded px-2 py-1 text-sm bg-gray-50" />
        </div>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">Active Clients: <strong>{cfg.active_clients}</strong></span>
        <button onClick={save} disabled={saving}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'SIMPAN PERUBAHAN'}
        </button>
      </div>
    </div>
  )
}

function Collapsible({ title, badge, badgeColor, open, onToggle, children }: {
  title: string; badge: string; badgeColor: string;
  open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border rounded">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left">
        <span className="font-medium text-sm">{open ? '▼' : '▶'} {title}</span>
        <span className={`text-xs font-semibold ${badgeColor}`}>{badge}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
