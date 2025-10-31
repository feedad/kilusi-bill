import React, { useEffect, useState } from 'react'
import Table from '../components/Table.jsx'

export default function SnmpDevices(){
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let ignore = false
    async function load(){
      setLoading(true)
      setError('')
      try{
        const res = await fetch('/admin/snmp/devices/json', { credentials: 'include' })
        
        // Check if response is OK and is JSON
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }
        
        const contentType = res.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text()
          throw new Error(`Expected JSON but got: ${text.substring(0, 100)}...`)
        }
        
        const data = await res.json()
        if(!data.success) throw new Error(data.message || 'Gagal memuat')
        if(!ignore) setDevices(data.devices || [])
      }catch(e){
        if(!ignore) setError(e.message)
      }finally{
        if(!ignore) setLoading(false)
      }
    }
    load()
    return () => { ignore = true }
  }, [])

  const filtered = devices.filter(d => !q || (d.name||'').toLowerCase().includes(q.toLowerCase()) || String(d.host||'').includes(q))

  const columns = [
    { key: 'name', label: 'Name', render: (d) => <strong>{d.name}</strong> },
    { key: 'host', label: 'IP Address', render: (d) => <code>{d.host}</code> },
    { key: 'type', label: 'Type', render: (d) => d.type || '-' },
    { 
      key: 'snmp_ok', 
      label: 'SNMP Status', 
      render: (d) => d.snmp_ok 
        ? <span className="badge badge-success">CONNECTED</span> 
        : <span className="badge badge-danger">DISCONNECTED</span> 
    },
    { 
      key: 'actions', 
      label: 'Actions', 
      render: (d) => (
        <div style={{display:'flex', gap:8}}>
          <a className="link" href={`/ui/snmp/monitor?host=${encodeURIComponent(d.host)}`}>
            Monitor (React)
          </a>
          <a className="link" href={`/admin/snmp/monitor?host=${encodeURIComponent(d.host)}`} target="_blank" rel="noreferrer">
            Legacy
          </a>
        </div>
      )
    }
  ]

  return (
    <div>
      <h3 className="page-title">SNMP Devices</h3>
      <div className="toolbar">
        <input 
          className="input"
          placeholder="Search by name or IP..." 
          value={q} 
          onChange={e=>setQ(e.target.value)}
        />
        <button onClick={()=>window.location.reload()}>Refresh</button>
      </div>
      
      <Table 
        columns={columns}
        data={filtered}
        loading={loading}
        error={error}
        emptyMessage="No devices found"
      />
    </div>
  )
}
