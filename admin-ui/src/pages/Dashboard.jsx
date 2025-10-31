import React, { useEffect, useState } from 'react'
import { apiGet } from '../utils/api'
import Table from '../components/Table'
import StatCard from '../components/StatCard'
import Sparkline from '../components/Sparkline'

export default function Dashboard(){
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState({ stats: true, revenue: true, mik: true, activity: true })
  const [errors, setErrors] = useState({ stats: '', revenue: '', mik: '', activity: '' })
  const [revenue, setRevenue] = useState({ dates: [], revenues: [] })
  const [mikStats, setMikStats] = useState(null)
  const [activities, setActivities] = useState([])

  useEffect(()=>{
    let stop = false
    // Fetch billing stats
    ;(async ()=>{
      try{
        const stats = await apiGet('/admin/billing-stats')
        if(!stop) setData(stats)
      }catch(e){ if(!stop) setErrors(prev => ({ ...prev, stats: e.message })) }
      finally{ if(!stop) setLoading(prev => ({ ...prev, stats: false })) }
    })()
    // Fetch revenue chart
    ;(async ()=>{
      try{
        const rev = await apiGet('/admin/revenue-chart?days=30')
        if(!stop) setRevenue(rev || { dates: [], revenues: [] })
      }catch(e){ if(!stop) setErrors(prev => ({ ...prev, revenue: e.message })) }
      finally{ if(!stop) setLoading(prev => ({ ...prev, revenue: false })) }
    })()
    // Fetch PPPoE user stats
    ;(async ()=>{
      try{
        const users = await apiGet('/admin/mikrotik/user-stats')
        if(!stop) setMikStats(users)
      }catch(e){ if(!stop) setErrors(prev => ({ ...prev, mik: e.message })) }
      finally{ if(!stop) setLoading(prev => ({ ...prev, mik: false })) }
    })()
    // Fetch activity log
    ;(async ()=>{
      try{
        const acts = await apiGet('/admin/activity-log?limit=10')
        if(!stop) setActivities(acts?.activities || [])
      }catch(e){ if(!stop) setErrors(prev => ({ ...prev, activity: e.message })) }
      finally{ if(!stop) setLoading(prev => ({ ...prev, activity: false })) }
    })()
    return ()=>{ stop = true }
  },[])

  const cols = [
    { key: 'invoice_number', label: 'Invoice #' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'package_name', label: 'Package' },
    { key: 'amount', label: 'Amount', render: r => `Rp ${Number(r.amount||0).toLocaleString('id-ID')}` },
    { key: 'paid_date', label: 'Paid Date' },
    { key: 'payment_method', label: 'Method' },
  ]

  return (
    <div>
      <h3 className="page-title">Dashboard</h3>

      <div className="info-grid" style={{marginBottom:16}}>
        {loading.stats ? (
          <>
            <div className="skeleton-card"/>
            <div className="skeleton-card"/>
            <div className="skeleton-card"/>
            <div className="skeleton-card"/>
          </>
        ) : errors.stats ? (
          <div className="card" style={{gridColumn:'1/-1'}}><div className="alert alert-danger">{errors.stats}</div></div>
        ) : (
          <>
            <StatCard icon="👥" label="Total Customers" value={data?.totalCustomers ?? '-'} />
            <StatCard icon="📈" label="Paid This Month" value={`Rp ${Number(data?.paidThisMonth||0).toLocaleString('id-ID')}`} sub={`${data?.paidCount||0} invoices`} />
            <StatCard icon="⏳" label="Unpaid Invoices" value={`Rp ${Number(data?.unpaidAmount||0).toLocaleString('id-ID')}`} sub={`${data?.unpaidCount||0} invoices`} />
            <StatCard icon="💰" label="Monthly Revenue" value={`Rp ${Number(data?.monthlyRevenue||0).toLocaleString('id-ID')}`} sub={data?.currentMonth} />
          </>
        )}
        {loading.mik ? (
          <div className="skeleton-card"/>
        ) : errors.mik ? (
          <StatCard icon="🧑‍💻" label="PPPoE Active" value="Error" sub={errors.mik} />
        ) : (
          <StatCard icon="🧑‍💻" label="PPPoE Active" value={mikStats?.activeUsers ?? '-'} sub={`Total users: ${mikStats?.totalUsers ?? '-'}`} />
        )}
      </div>

      <div className="card" style={{marginBottom:16}}>
        <h4 className="card-title">Revenue (30 days)</h4>
        {loading.revenue ? (
          <div className="skeleton-chart" style={{height:120}}/>
        ) : errors.revenue ? (
          <div className="alert alert-danger">{errors.revenue}</div>
        ) : (
          <Sparkline data={revenue.revenues || []} width={740} height={120} />
        )}
      </div>

      <div className="card">
        <h4 className="card-title">Recent Paid Invoices</h4>
        <Table columns={cols} data={data?.recentPaidInvoices || []} loading={loading.stats} error={errors.stats} emptyMessage="No invoices" />
      </div>

      <div className="card" style={{marginTop:16}}>
        <h4 className="card-title">Activity</h4>
        {loading.activity ? (
          <div className="skeleton-list"/>
        ) : errors.activity ? (
          <div className="alert alert-danger">{errors.activity}</div>
        ) : activities.length ? (
          <ul style={{margin:0, paddingLeft:18}}>
            {activities.map((a,idx)=> (
              <li key={idx} style={{marginBottom:6}}>
                <span style={{fontWeight:600}}>{a.title}</span>
                <span className="muted"> — {new Date(a.timestamp).toLocaleString('id-ID')}</span>
                <div className="muted">{a.description}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted">No recent activity</div>
        )}
      </div>
    </div>
  )
}
