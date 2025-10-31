import React, { useEffect, useState } from 'react'
import Table from '../components/Table'
import { apiGet, apiPost } from '../utils/api'

export default function Mikrotik(){
  const [active, setActive] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(){
    setLoading(true); setError('')
    try{
      const res = await apiGet('/admin/mikrotik/pppoe-active')
      setActive(res.activeUsers || [])
    }catch(e){ setError(e.message) }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ load() },[])

  async function disconnect(username){
    try{
      await apiPost('/admin/mikrotik/disconnect-session', { username })
      await load()
    }catch(e){ setError(e.message) }
  }

  const cols = [
    { key: 'name', label: 'User' },
    { key: 'address', label: 'Address' },
    { key: 'uptime', label: 'Uptime' },
    { key: '_router', label: 'Router', render: r => r._router || '-' },
    { key: 'actions', label: 'Actions', render: r => (
      <button className="btn-secondary" onClick={()=>disconnect(r.name)}>Disconnect</button>
    ) }
  ]

  return (
    <div>
      <h3 className="page-title">Mikrotik</h3>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="toolbar">
        <button onClick={load}>Refresh</button>
        <a className="link" href="/admin/mikrotik" target="_blank" rel="noreferrer">Open Legacy</a>
      </div>
      <Table columns={cols} data={active} loading={loading} error={error} emptyMessage="No active users" />
    </div>
  )
}
