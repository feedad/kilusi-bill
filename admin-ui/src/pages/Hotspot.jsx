import React, { useEffect, useState } from 'react'
import { apiGet, apiPostForm } from '../utils/api'
import Table from '../components/Table'

export default function Hotspot(){
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editData, setEditData] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    speed_limit: '',
    shared_users: '1',
    rate_limit: '',
    validity: '30d'
  })

  useEffect(()=>{
    loadProfiles()
  },[])

  async function loadProfiles(){
    setLoading(true); setError('')
    try{
      const res = await apiGet('/admin/mikrotik/hotspot-profiles/api')
      setProfiles(res || [])
    }catch(e){ setError(e.message) }
    finally{ setLoading(false) }
  }

  async function handleSubmit(e){
    e.preventDefault()
    setError('')
    try{
      if(editData){
        await apiPostForm('/admin/mikrotik/hotspot-profiles/edit', {
          id: editData.id,
          ...formData
        })
      } else {
        await apiPostForm('/admin/mikrotik/hotspot-profiles/add', formData)
      }
      setShowModal(false)
      setEditData(null)
      setFormData({ name: '', speed_limit: '', shared_users: '1', rate_limit: '', validity: '30d' })
      await loadProfiles()
    }catch(e){ setError(e.message) }
  }

  function openEdit(profile){
    setEditData(profile)
    setFormData({
      name: profile.name || '',
      speed_limit: profile.speed_limit || '',
      shared_users: profile.shared_users || '1',
      rate_limit: profile.rate_limit || '',
      validity: profile.validity || '30d'
    })
    setShowModal(true)
  }

  async function handleDelete(id){
    if(!confirm('Hapus hotspot profile ini?')) return
    setError('')
    try{
      await apiPostForm('/admin/mikrotik/hotspot-profiles/delete', { id })
      await loadProfiles()
    }catch(e){ setError(e.message) }
  }

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Profile Name' },
    { key: 'speed_limit', label: 'Speed Limit' },
    { key: 'shared_users', label: 'Shared Users' },
    { key: 'rate_limit', label: 'Rate Limit' },
    { key: 'validity', label: 'Validity' },
    { key: 'actions', label: 'Actions', render: r => (
      <div style={{display:'flex', gap:8}}>
        <button className="btn-secondary" onClick={()=>openEdit(r)}>Edit</button>
        <button className="btn-danger" onClick={()=>handleDelete(r.id)}>Hapus</button>
      </div>
    )}
  ]

  return (
    <div>
      <h3 className="page-title">Hotspot Profiles</h3>
      <p className="muted" style={{marginTop:-8}}>Manage Mikrotik hotspot user profiles. For more advanced features, use: <a href="/admin/hotspot" target="_blank" rel="noreferrer">/admin/hotspot</a></p>
      
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="toolbar">
          <button onClick={()=>{ setEditData(null); setFormData({ name: '', speed_limit: '', shared_users: '1', rate_limit: '', validity: '30d' }); setShowModal(true) }}>Add Profile</button>
        </div>
        <Table columns={cols} data={profiles} loading={loading} error={error} emptyMessage="No hotspot profiles" />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h4>{editData ? 'Edit Hotspot Profile' : 'Add Hotspot Profile'}</h4>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Profile Name</label>
                <input required value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} placeholder="e.g. Premium-10Mbps" />
              </div>
              <div className="form-group">
                <label>Speed Limit</label>
                <input value={formData.speed_limit} onChange={e=>setFormData({...formData, speed_limit:e.target.value})} placeholder="10M/10M" />
              </div>
              <div className="form-group">
                <label>Shared Users</label>
                <input type="number" value={formData.shared_users} onChange={e=>setFormData({...formData, shared_users:e.target.value})} placeholder="1" />
              </div>
              <div className="form-group">
                <label>Rate Limit</label>
                <input value={formData.rate_limit} onChange={e=>setFormData({...formData, rate_limit:e.target.value})} placeholder="rx-rate/tx-rate" />
              </div>
              <div className="form-group">
                <label>Validity</label>
                <input value={formData.validity} onChange={e=>setFormData({...formData, validity:e.target.value})} placeholder="30d" />
              </div>
              <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
                <button type="button" className="btn-secondary" onClick={()=>setShowModal(false)}>Cancel</button>
                <button type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
