import React, { useEffect, useState } from 'react'
import { apiGet } from '../utils/api'
import StatCard from '../components/StatCard'

export default function NetworkMap(){
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(()=>{
    let stop = false
    ;(async ()=>{
      setLoading(true); setError('')
      try{
        const [mikStats, radiusStatus] = await Promise.all([
          apiGet('/admin/mikrotik/user-stats').catch(()=>null),
          apiGet('/admin/radius/status').catch(()=>null)
        ])
        if(!stop) setStats({ mikStats, radiusStatus })
      }catch(e){ if(!stop) setError(e.message) }
      finally{ if(!stop) setLoading(false) }
    })()
    return ()=>{ stop = true }
  },[])

  return (
    <div>
      <h3 className="page-title">Network Map</h3>
      <p className="muted" style={{marginTop:-8}}>Network topology overview. Full map: <a href="/admin/map" target="_blank" rel="noreferrer">/admin/map</a></p>
      
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="info-grid" style={{marginBottom:16}}>
        {loading ? (
          <>
            <div className="skeleton-card"/>
            <div className="skeleton-card"/>
            <div className="skeleton-card"/>
          </>
        ) : (
          <>
            <StatCard 
              icon="🌐" 
              label="PPPoE Users" 
              value={stats?.mikStats?.totalUsers ?? '-'} 
              sub={`Active: ${stats?.mikStats?.activeUsers ?? '-'}`}
            />
            <StatCard 
              icon="📡" 
              label="RADIUS" 
              value={stats?.radiusStatus?.status === 'running' ? 'Running' : 'Stopped'} 
              sub={stats?.radiusStatus?.uptime || '-'}
            />
            <StatCard 
              icon="🖥️" 
              label="NAS Clients" 
              value={stats?.radiusStatus?.nasCount ?? '-'} 
              sub="Configured"
            />
          </>
        )}
      </div>

      <div className="card">
        <h4 className="card-title">Network Visualization</h4>
        <div style={{padding:40, textAlign:'center', color:'var(--text-secondary)'}}>
          <div style={{fontSize:48, marginBottom:16}}>🗺️</div>
          <p>Interactive network map with device locations coming soon.</p>
          <p style={{fontSize:14}}>Use <a href="/admin/map" target="_blank" rel="noreferrer">legacy map</a> for GenieACS devices.</p>
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <h4 className="card-title">Quick Links</h4>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12}}>
          <a href="/ui/snmp/devices" style={{textDecoration:'none'}}>
            <div className="quick-link">
              <div style={{fontSize:32}}>📊</div>
              <div>SNMP Devices</div>
            </div>
          </a>
          <a href="/ui/mikrotik" style={{textDecoration:'none'}}>
            <div className="quick-link">
              <div style={{fontSize:32}}>🔌</div>
              <div>Mikrotik</div>
            </div>
          </a>
          <a href="/ui/radius" style={{textDecoration:'none'}}>
            <div className="quick-link">
              <div style={{fontSize:32}}>🔐</div>
              <div>RADIUS</div>
            </div>
          </a>
          <a href="/admin/map" target="_blank" rel="noreferrer" style={{textDecoration:'none'}}>
            <div className="quick-link">
              <div style={{fontSize:32}}>🌍</div>
              <div>Full Map</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}
