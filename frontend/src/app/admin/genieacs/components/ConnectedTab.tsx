'use client'

import type { ACSDevice } from '../types'

export default function ConnectedTab({ device }: { device: ACSDevice }) {
  const hosts = device.hosts || []

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">📡 LAN HOSTS (DHCP Leases)</h3>
        {hosts.length === 0 ? (
          <p className="text-gray-400 text-sm">No connected hosts</p>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">IP Address</th>
                <th className="p-2 text-left">MAC Address</th>
                <th className="p-2 text-left">Hostname</th>
                <th className="p-2 text-left">Interface</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-mono text-xs">{h.ip_address}</td>
                  <td className="p-2 font-mono text-xs">{h.mac_address}</td>
                  <td className="p-2">{h.hostname || '-'}</td>
                  <td className="p-2 text-xs">{h.interface_type || 'LAN'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">📊 STATISTICS</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 p-3 rounded text-center">
            <div className="text-2xl font-bold">{hosts.length}</div>
            <div className="text-xs text-gray-500">Total Clients</div>
          </div>
          <div className="bg-gray-50 p-3 rounded text-center">
            <div className="text-2xl font-bold">{hosts.filter(h => h.interface_type !== 'WiFi').length}</div>
            <div className="text-xs text-gray-500">LAN</div>
          </div>
          <div className="bg-gray-50 p-3 rounded text-center">
            <div className="text-2xl font-bold">{hosts.filter(h => h.interface_type === 'WiFi').length}</div>
            <div className="text-xs text-gray-500">WiFi</div>
          </div>
        </div>
      </div>
    </div>
  )
}
