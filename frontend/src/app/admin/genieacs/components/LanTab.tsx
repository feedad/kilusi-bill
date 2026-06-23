'use client'

import { useState } from 'react'
import { adminApi } from '@/lib/api-clients'
import type { ACSDevice } from '../types'

export default function LanTab({ device, onRefresh }: { device: ACSDevice; onRefresh: () => void }) {
  const cfg = device.lan_config
  const [saving, setSaving] = useState(false)

  const [gateway, setGateway] = useState(cfg?.gateway_ip || '')
  const [subnet, setSubnet] = useState(cfg?.subnet_mask || '')
  const [dhcpEnabled, setDhcpEnabled] = useState(cfg?.dhcp_enabled ?? true)
  const [dhcpStart, setDhcpStart] = useState(cfg?.dhcp_start_ip || '')
  const [dhcpEnd, setDhcpEnd] = useState(cfg?.dhcp_end_ip || '')
  const [leaseTime, setLeaseTime] = useState(cfg?.dhcp_lease_time || 86400)
  const [dnsServers, setDnsServers] = useState(cfg?.dns_servers || '')

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.put(`/api/v1/genieacs/devices/${device.id}/lan`, {
        gateway_ip: gateway,
        subnet_mask: subnet,
        dhcp_enabled: dhcpEnabled,
        dhcp_start_ip: dhcpStart,
        dhcp_end_ip: dhcpEnd,
        dhcp_lease_time: leaseTime,
        dns_servers: dnsServers,
      })
      setTimeout(onRefresh, 3000)
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  if (!cfg && !gateway) return <p className="text-gray-400 text-sm p-4">LAN config not available</p>

  return (
    <div className="space-y-4">
      {/* Gateway */}
      <Section title="🌐 IP GATEWAY">
        <div className="grid grid-cols-2 gap-3">
          <Field label="IP Gateway" value={gateway} onChange={setGateway} />
          <Field label="Subnet Mask" value={subnet} onChange={setSubnet} />
          <Field label="MAC Address" value={cfg?.mac_address || ''} readonly />
        </div>
      </Section>

      {/* DHCP */}
      <Section title="🤖 DHCP SERVER">
        <div className="flex items-center gap-4 mb-3">
          <span className="text-sm text-gray-500">DHCP Status:</span>
          <button onClick={() => setDhcpEnabled(!dhcpEnabled)}
            className={`px-3 py-1 rounded text-sm font-bold ${dhcpEnabled ? 'bg-green-600 text-white' : 'bg-gray-300'}`}>
            {dhcpEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rentang IP (Start)" value={dhcpStart} onChange={setDhcpStart} />
          <Field label="Rentang IP (End)" value={dhcpEnd} onChange={setDhcpEnd} />
          <Field label="Lease Time (seconds)" value={String(leaseTime)} onChange={(v) => setLeaseTime(Number(v) || 86400)} />
        </div>
      </Section>

      {/* DNS */}
      <Section title="🟢 Domain Name Server (DNS)">
        <div className="grid grid-cols-3 gap-3">
          <input value={dnsServers} onChange={(e) => setDnsServers(e.target.value)}
            placeholder="8.8.8.8, 1.1.1.1"
            className="col-span-3 border rounded px-2 py-1 text-sm font-mono" />
        </div>
      </Section>

      <button onClick={save} disabled={saving}
        className="w-full py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'MENYIMPAN...' : 'SIMPAN SEMUA'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded p-3">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, readonly }: {
  label: string; value: string; onChange?: (v: string) => void; readonly?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input value={value} onChange={e => onChange?.(e.target.value)}
        readOnly={readonly}
        className={`w-full border rounded px-2 py-1 text-sm font-mono ${readonly ? 'bg-gray-50 text-gray-400' : ''}`} />
    </div>
  )
}
