import React, { useEffect, useState } from 'react'
import { apiGet, apiPostForm } from '../utils/api'
import Table from '../components/Table'

export default function Customers(){
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editData, setEditData] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
    package_id: ''
  })
  const [packages, setPackages] = useState([])

  useEffect(()=>{
    loadCustomers()
    loadPackages()
  },[])

  async function loadCustomers(){
    setLoading(true); setError('')
    try{
      const params = new URLSearchParams({ start:'0', length:'100' })
      if(search) params.append('search[value]', search)
      const res = await apiGet(`/admin/billing/api/customers?${params.toString()}`)
      setRows(res.data || [])
    }catch(e){ setError(e.message) }
    finally{ setLoading(false) }
  }

  async function loadPackages(){
    try{
      const res = await apiGet('/admin/billing/api/packages')
      setPackages(res.data || [])
    }catch(e){ console.error('Failed to load packages:', e) }
  }

  async function handleSubmit(e){
    e.preventDefault()
    setError('')
    try{
      if(editData){
        // Update existing customer
        await apiPostForm('/admin/billing/customers/update', {
          id: editData.id,
          ...formData
        })
      } else {
        // Legacy doesn't have a simple add endpoint, so we note this for later
        setError('Add customer not yet implemented in React UI. Use legacy page.')
        return
      }
      setShowModal(false)
      setEditData(null)
      setFormData({ name: '', phone: '', address: '', email: '', package_id: '' })
      await loadCustomers()
    }catch(e){ setError(e.message) }
  }

  function openEdit(customer){
    setEditData(customer)
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      email: customer.email || '',
      package_id: customer.package_id || ''
    })
    setShowModal(true)
  }

  async function handleDelete(id){
    if(!confirm('Hapus customer ini?')) return
    setError('')
    try{
      await apiPostForm('/admin/billing/customers/delete', { id })
      await loadCustomers()
    }catch(e){ setError(e.message) }
  }

  const cols = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Nama' },
    { key: 'phone', label: 'Phone' },
    { key: 'package_name', label: 'Package' },
    { key: 'status', label: 'Status', render: r => r.status === 'active' ? 
      <span className="badge badge-success">Active</span> : 
      <span className="badge badge-danger">Inactive</span>
    },
    { key: 'actions', label: 'Actions', render: r => (
      <div style={{display:'flex', gap:8}}>
        <button className="btn-secondary" onClick={()=>openEdit(r)}>Edit</button>
        <button className="btn-danger" onClick={()=>handleDelete(r.id)}>Hapus</button>
      </div>
    )}
  ]

  return (
    <div>
      <h3 className="page-title">Customers</h3>
      <p className="muted" style={{marginTop:-8}}>Customer management. For full features (add, assign package, sync GenieACS), use legacy: <a href="/admin/billing" target="_blank" rel="noreferrer">/admin/billing</a></p>
      
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <div className="toolbar">
          <input className="input" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
          <button onClick={loadCustomers}>Search</button>
          <button onClick={()=>{ setEditData(null); setFormData({ name: '', phone: '', address: '', email: '', package_id: '' }); setShowModal(true) }}>Add (Coming Soon)</button>
        </div>
        <Table columns={cols} data={rows} loading={loading} error={error} emptyMessage="No customers" />
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={()=>setShowModal(false)}>
          <div className="modal-content" onClick={e=>e.stopPropagation()}>
            <h4>{editData ? 'Edit Customer' : 'Add Customer'}</h4>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nama</label>
                <input required value={formData.name} onChange={e=>setFormData({...formData, name:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input required value={formData.phone} onChange={e=>setFormData({...formData, phone:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea value={formData.address} onChange={e=>setFormData({...formData, address:e.target.value})} rows={3} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} />
              </div>
              <div className="form-group">
                <label>Package</label>
                <select value={formData.package_id} onChange={e=>setFormData({...formData, package_id:e.target.value})}>
                  <option value="">-- Select Package --</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name} - Rp {Number(p.price||0).toLocaleString('id-ID')}</option>)}
                </select>
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
