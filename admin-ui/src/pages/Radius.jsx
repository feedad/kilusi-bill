import React, { useEffect, useState } from 'react'
import Table from '../components/Table'
import { apiGet, apiPost, apiDelete, apiPut } from '../utils/api'

export default function Radius(){
  const [status, setStatus] = useState(null)
  const [nas, setNas] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(){
    setLoading(true); setError('')
    try{
      const [st, nasRes, sess] = await Promise.all([
        apiGet('/admin/radius/status'),
        apiGet('/admin/radius/nas-clients'),
        apiGet('/admin/radius/sessions'),
      ])
      setStatus(st)
      setNas(nasRes.nasClients || [])
      setSessions(sess.sessions || [])
    }catch(e){ setError(e.message) }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ refresh() },[])

  async function doAction(path){
    try{ await apiPost(`/admin/radius/${path}`); await refresh() } catch(e){ setError(e.message) }
  }

  // NAS management helpers (add / edit / delete)
  const [showForm, setShowForm] = useState(false)
  const [editingNas, setEditingNas] = useState(null)
  const [form, setForm] = useState({ nasname:'', shortname:'', secret:'', type:'other', description:'' })

  function openAdd(){ setEditingNas(null); setForm({ nasname:'', shortname:'', secret:'', type:'other', description:'' }); setShowForm(true) }
  function openEdit(row){ setEditingNas(row); setForm({ nasname: row.nasname||'', shortname: row.shortname||'', secret: row.secret||'', type: row.type||'other', description: row.description||'' }); setShowForm(true) }

  async function submitForm(){
    setError('')
    try{
      if(editingNas && editingNas.id){
        await apiPut(`/admin/radius/nas-clients/${editingNas.id}`, form)
      }else{
        await apiPost('/admin/radius/nas-clients', form)
      }
      setShowForm(false)
      await refresh()
    }catch(e){ setError(e.message) }
  }

  async function deleteNas(id){
    if(!confirm('Delete NAS client? This will remove the NAS from the RADIUS database.')) return
    try{
      await apiDelete(`/admin/radius/nas-clients/${id}`)
      await refresh()
    }catch(e){ setError(e.message) }
  }

  // Session helpers
  async function removeUserFromRadius(username){
    if(!confirm(`Remove user ${username} from RADIUS? This may disconnect active sessions.`)) return
    try{
      await apiDelete(`/admin/radius/user/${encodeURIComponent(username)}`)
      await refresh()
    }catch(e){ setError(e.message) }
  }

  const nasCols = [
    { key: 'id', label: 'ID' },
    { key: 'nasname', label: 'Host/IP' },
    { key: 'shortname', label: 'Short Name' },
    { key: 'type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'actions', label: 'Actions', render: r => (
      <div style={{display:'flex', gap:6}}>
        <button className="btn-secondary" onClick={()=>openEdit(r)}>Edit</button>
        <button className="btn-danger" onClick={()=>deleteNas(r.id)}>Delete</button>
      </div>
    ) }
  ]

  const sessCols = [
    { key: 'username', label: 'User' },
    { key: 'nasipaddress', label: 'NAS' },
    { key: 'acctstarttime', label: 'Start' },
    { key: 'framedipaddress', label: 'IP' },
    { key: 'actions', label: 'Actions', render: r => (
      <div style={{display:'flex', gap:6}}>
        <button className="btn-secondary" onClick={()=>removeUserFromRadius(r.username)}>Remove User</button>
      </div>
    ) }
  ]

  return (
    <div>
      <h3 className="page-title">RADIUS</h3>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="toolbar">
        <button onClick={()=>doAction('start')}>Start</button>
        <button onClick={()=>doAction('stop')} className="btn-secondary">Stop</button>
        <button onClick={()=>doAction('restart')} className="btn-secondary">Restart</button>
        <button onClick={()=>doAction('sync')} className="btn-secondary">Sync Customers</button>
        <button onClick={()=>doAction('reload-nas')} className="btn-secondary">Reload NAS</button>
        <button onClick={openAdd} className="btn-secondary">Add NAS</button>
        <button onClick={refresh}>Refresh</button>
      </div>

      <div className="info-grid" style={{marginBottom:16}}>
        <div className="card">
          <h4 className="card-title">Server</h4>
          <div className="label-sm">Status</div>
          <div className="value-lg">{status?.server?.running ? <span className="badge badge-success">Running</span> : <span className="badge badge-danger">Stopped</span>}</div>
        </div>
        <div className="card">
          <h4 className="card-title">Sync</h4>
          <div className="label-sm">In-sync</div>
          <div className="value-lg">{status?.sync?.synced ?? '-'}</div>
        </div>
        <div className="card">
          <h4 className="card-title">Active Sessions</h4>
          <div className="value-lg">{status?.activeSessions ?? 0}</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:16}}>
        <h4 className="card-title">NAS Clients</h4>
        <Table columns={nasCols} data={nas} loading={loading} error={error} emptyMessage="No NAS" />

        {showForm && (
          <div className="card" style={{marginTop:12}}>
            <h5 className="card-title">{editingNas ? 'Edit NAS' : 'Add NAS'}</h5>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <input className="input" placeholder="Host/IP (nasname)" value={form.nasname} onChange={e=>setForm({...form, nasname:e.target.value})} />
              <input className="input" placeholder="Shortname" value={form.shortname} onChange={e=>setForm({...form, shortname:e.target.value})} />
              <input className="input" placeholder="Secret" value={form.secret} onChange={e=>setForm({...form, secret:e.target.value})} />
              <input className="input" placeholder="Type" value={form.type} onChange={e=>setForm({...form, type:e.target.value})} />
              <input className="input" placeholder="Description" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} style={{gridColumn:'1 / -1'}} />
            </div>
            <div style={{marginTop:8}}>
              <button onClick={submitForm}>{editingNas ? 'Save' : 'Add'}</button>
              <button className="btn-secondary" onClick={()=>setShowForm(false)} style={{marginLeft:8}}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h4 className="card-title">Active Sessions</h4>
        <Table columns={sessCols} data={sessions} loading={loading} error={error} emptyMessage="No sessions" />
      </div>
    </div>
  )
}
