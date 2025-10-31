import React, { useEffect, useState } from 'react'
import { apiGet, apiPostForm } from '../utils/api'
import Table from '../components/Table'

export default function Packages(){
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editData, setEditData] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    speed: '',
    description: ''
  })

  useEffect(()=>{
    loadPackages()
  },[])

  async function loadPackages(){
    setLoading(true); setError('')
    try{
      const res = await apiGet('/admin/billing/api/packages')
      setRows(res.data || [])
    }catch(e){ setError(e.message) }
    finally{ setLoading(false) }
  }

  async function handleSubmit(e){
    e.preventDefault()
    setError('')
    try{
      if(editData){
        await apiPostForm(`/admin/billing/packages/update/${editData.id}`, formData)
      } else {
        await apiPostForm('/admin/billing/packages/create', formData)
      }
      setShowModal(false)
      setEditData(null)
      setFormData({ name: '', price: '', speed: '', description: '' })
      await loadPackages()
    }catch(e){ setError(e.message) }
  }

  function openEdit(pkg){
    setEditData(pkg)
    setFormData({
      name: pkg.name || '',
      price: pkg.price || '',
      speed: pkg.speed || '',
      description: pkg.description || ''
    })
    setShowModal(true)
  }

  async function handleDelete(id){
    if(!confirm('Hapus package ini?')) return
    setError('')
    try{
      await apiPostForm(`/admin/billing/packages/delete/${id}`, {})
      await loadPackages()
    }catch(e){ setError(e.message) }
  }

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Package Name' },
    { key: 'price', label: 'Price', render: r => `Rp ${Number(r.price||0).toLocaleString('id-ID')}` },
    { key: 'speed', label: 'Speed' },
    { key: 'description', label: 'Description' },
    { key: 'actions', label: 'Actions', render: r => (
      <div style={{display:'flex', gap:8}}>
        <button className="btn-secondary" onClick={()=>openEdit(r)}>Edit</button>
        <button className="btn-danger" onClick={()=>handleDelete(r.id)}>Hapus</button>
      </div>
    )}
  ]

  return (
    <div>
      <h3 className="page-title">Packages</h3>
      <p className="muted" style={{marginTop:-8}}>Internet package management. Manage speeds, pricing, and descriptions.</p>
      
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="toolbar">
          <button onClick={()=>{ setEditData(null); setFormData({ name: '', price: '', speed: '', description: '' }); setShowModal(true) }}>Add Package</button>
        </div>
        <Table columns={cols} data={rows} loading={loading} error={error} emptyMessage="No packages" />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h4>{editData ? 'Edit Package' : 'Add Package'}</h4>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Package Name</label>
                <input required value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} placeholder="e.g. Home 10Mbps" />
              </div>
              <div className="form-group">
                <label>Price (Rp)</label>
                <input required type="number" value={formData.price} onChange={e=>setFormData({...formData, price:e.target.value})} placeholder="150000" />
              </div>
              <div className="form-group">
                <label>Speed</label>
                <input required value={formData.speed} onChange={e=>setFormData({...formData, speed:e.target.value})} placeholder="10M/10M" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={formData.description} onChange={e=>setFormData({...formData, description:e.target.value})} rows={3} placeholder="Package details..." />
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
