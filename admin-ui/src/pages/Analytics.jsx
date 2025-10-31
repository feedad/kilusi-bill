import React, { useEffect, useState } from 'react'
import { apiGet } from '../utils/api'
import Sparkline from '../components/Sparkline'

export default function Analytics(){
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let stop = false
    ;(async ()=>{
      setErr(''); setLoading(true)
      try{
  const res = await apiGet('/admin/revenue-chart?days=30')
        if(!stop) setData(res)
      }catch(e){ if(!stop) setErr(e.message) }
      finally{ if(!stop) setLoading(false) }
    })()
    return ()=>{ stop = true }
  },[])

  const values = data?.revenues || []
  return (
    <div>
      <h3 className="page-title">Analytics</h3>
      {err && <div className="alert alert-danger">{err}</div>}
      <div className="card">
        <h4 className="card-title">Revenue (Last 30 days)</h4>
        {loading ? <div className="spinner"/> : <Sparkline data={values} width={680} height={120} />}
        {!loading && (
          <div className="muted" style={{marginTop:8}}>
            Total: Rp {values.reduce((a,b)=>a+b,0).toLocaleString('id-ID')} — Legacy analytics: <a href="/admin/dashboard" target="_blank" rel="noreferrer">/admin/dashboard</a>
          </div>
        )}
      </div>
    </div>
  )
}
