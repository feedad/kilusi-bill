import React, { useEffect, useState } from 'react'
import Table from '../components/Table'
import { apiGet, apiPostForm } from '../utils/api'

export default function Billing(){
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [all, setAll] = useState([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [q, setQ] = useState('')

  useEffect(()=>{
    let stop = false
    ;(async ()=>{
      setLoading(true); setError('')
      try{
        // Use billing-stats for recent paid invoices (existing JSON)
        const res = await apiGet('/admin/billing-stats')
        if(!stop) setRows(res.recentPaidInvoices || [])
      }catch(e){ if(!stop) setError(e.message) }
      finally{ if(!stop) setLoading(false) }
    })()
    return ()=>{ stop = true }
  },[])

  async function loadAll(){
    setLoadingAll(true); setError('')
    try{
      const params = new URLSearchParams({ start:'0', length:'50' })
      if(q) params.append('search[value]', q)
      const res = await apiGet(`/admin/billing/api/invoices?${params.toString()}`)
      setAll(res.data || [])
    }catch(e){ setError(e.message) }
    finally{ setLoadingAll(false) }
  }

  async function markPaid(id){
    try{
      await apiPostForm(`/admin/billing/invoices/mark-paid/${encodeURIComponent(id)}`, { payment_method:'cash' })
      await loadAll()
    }catch(e){ setError(e.message) }
  }

  const cols = [
    { key: 'invoice_number', label: 'Invoice #'},
    { key: 'customer_name', label: 'Customer' },
    { key: 'package_name', label: 'Package' },
    { key: 'amount', label: 'Amount', render: r => `Rp ${Number(r.amount||0).toLocaleString('id-ID')}` },
    { key: 'paid_date', label: 'Paid Date' },
    { key: 'payment_method', label: 'Method' },
  ]

  const allCols = [
    { key: 'invoice_number', label: 'Invoice #' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'package_name', label: 'Package' },
    { key: 'amount', label: 'Amount', render: r => `Rp ${Number(r.amount||0).toLocaleString('id-ID')}` },
    { key: 'due_date', label: 'Due Date' },
    { key: 'status', label: 'Status', render: r => r.status === 'paid' ? <span className="badge badge-success">PAID</span> : <span className="badge badge-warning">UNPAID</span> },
    { key: 'actions', label: 'Actions', render: r => r.status === 'paid' ? null : (
      <button className="btn-secondary" onClick={()=>markPaid(r.id)}>Mark Paid</button>
    ) }
  ]

  return (
    <div>
      <h3 className="page-title">Billing & Finance</h3>
  <p className="muted" style={{marginTop:-8}}>Recent paid invoices (source: /admin/billing-stats). For full features, use legacy page: <a href="/admin/billing" target="_blank" rel="noreferrer">/admin/billing</a></p>
      <Table columns={cols} data={rows} loading={loading} error={error} emptyMessage="No invoices" />

      <div className="card" style={{marginTop:16}}>
        <h4 className="card-title">All Invoices</h4>
        <div className="toolbar">
          <input className="input" placeholder="Search..." value={q} onChange={e=>setQ(e.target.value)} />
          <button onClick={loadAll}>Load</button>
        </div>
        <Table columns={allCols} data={all} loading={loadingAll} error={error} emptyMessage="No invoices" />
      </div>
    </div>
  )
}
