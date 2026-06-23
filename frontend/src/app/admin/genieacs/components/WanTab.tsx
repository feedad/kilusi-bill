'use client'

import { useState } from 'react'
import type { ACSDevice, ACSWANConnection } from '../types'

export default function WanTab({ device, onRefresh }: { device: ACSDevice; onRefresh: () => void }) {
  const conns = device.wan_connections || []
  const [open, setOpen] = useState<number | null>(0)

  return (
    <div className="space-y-2">
      {conns.map((conn, i) => (
        <div key={conn.wan_index ?? i} className="border rounded">
          <button onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left">
            <span className="font-medium text-sm">
              {open === i ? '▼' : '▶'} WAN PPP {conn.wan_index} — {conn.service_type || conn.connection_type || 'INTERNET'}
            </span>
            <span className={`text-xs font-semibold ${conn.ip_address ? 'text-green-600' : 'text-gray-400'}`}>
              {conn.ip_address ? '● ONLINE' : '⚫ OFFLINE'}
            </span>
          </button>
          {open === i && (
            <div className="px-4 pb-4 space-y-2">
              <WanDetail conn={conn} />
            </div>
          )}
        </div>
      ))}
      {conns.length === 0 && <p className="text-gray-400 text-sm p-4">No WAN connections available</p>}
    </div>
  )
}

function WanDetail({ conn }: { conn: ACSWANConnection }) {
  const fields = [
    ['Username', conn.username],
    ['IP Address', conn.ip_address],
    ['MAC Address', conn.mac_address],
    ['VLAN ID', conn.vlan_id],
    ['Connection Type', conn.connection_type],
    ['Uptime', fmtUptime(conn.uptime)],
    ['NAT', conn.nat_enabled ? 'Enabled' : 'Disabled'],
  ].filter(([, v]) => v != null && v !== '')

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
      {fields.map(([label, value]) => (
        <div key={label as string} className="flex justify-between border-b border-gray-100 py-1">
          <span className="text-gray-500">{label}</span>
          <span className="font-mono text-xs">{String(value)}</span>
        </div>
      ))}
    </div>
  )
}

function fmtUptime(secs: number): string {
  if (!secs || secs < 0) return '-'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${h}h ${m}m ${s}s`
}
