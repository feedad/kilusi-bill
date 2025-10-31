import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export default function SnmpMonitor(){
  const location = useLocation()
  const [host, setHost] = useState('')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [polling, setPolling] = useState(false)
  const intervalRef = useRef(null)

  async function loadInfo(h){
    setError('')
    try{
      const res = await fetch(`/admin/snmp/device-info?host=${encodeURIComponent(h)}`, { credentials:'include' })
      if(!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if(!data.success) throw new Error(data.message || 'Failed to load')
      setInfo(data)
    }catch(e){
      setError(e.message)
      setPolling(false)
      if(intervalRef.current) clearInterval(intervalRef.current)
    }
  }

  useEffect(() => {
    // Initialize host from query string if provided
    const params = new URLSearchParams(location.search)
    const h = params.get('host')
    if (h) setHost(h)

    return () => { if(intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const onStart = () => {
    if(!host) return
    setPolling(true)
    loadInfo(host)
    if(intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => loadInfo(host), 5000)
  }

  const onStop = () => {
    setPolling(false)
    if(intervalRef.current) clearInterval(intervalRef.current)
  }

  return (
    <div>
      <h3 className="page-title">SNMP Monitor (Live Polling)</h3>
      <div className="toolbar">
        <input 
          placeholder="Host/IP address" 
          value={host} 
          onChange={e=>setHost(e.target.value)}
          className="input"
          disabled={polling}
        />
        {!polling ? (
          <button onClick={onStart}>Start Polling</button>
        ) : (
          <button onClick={onStop} className="btn-secondary">Stop Polling</button>
        )}
      </div>
      
      {error && (
        <div className="alert alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {info && (
        <div className="card">
          <h4 className="card-title">Device Information</h4>
          <div className="info-grid">
            <InfoItem label="Identity" value={info.identity || info.sysName || '-'} />
            <InfoItem label="Board" value={info.boardName || info.sysDescr || '-'} />
            <InfoItem label="Uptime" value={info.uptime || '-'} />
            <InfoItem label="Version" value={info.version ? `RouterOS ${info.version}` : '-'} />
            <InfoItem label="Architecture" value={info.architecture || '-'} />
            <InfoItem label="CPU Count" value={info.cpuCount ? `${info.cpuCount} core(s)` : '-'} />
            <InfoItem label="CPU Load" value={info.cpuLoad != null ? `${info.cpuLoad}%` : '-'} badge={info.cpuLoad > 80 ? 'danger' : info.cpuLoad > 60 ? 'warning' : 'success'} />
            <InfoItem label="Temperature" value={info.cpuTemperature || info.boardTemperature ? `${info.cpuTemperature || info.boardTemperature}°C` : '-'} />
          </div>
          
          {polling && (
            <p className="muted" style={{marginTop:16, marginBottom:0}}>
              🔄 Refreshing every 5 seconds...
            </p>
          )}
        </div>
      )}
      
      {!info && !error && (
        <p className="muted" style={{ textAlign:'center', padding:40 }}>
          Enter a host/IP and click "Start Polling" to monitor the device.
        </p>
      )}
    </div>
  )
}

function InfoItem({ label, value, badge }) {
  return (
    <div>
      <div className="label-sm">{label}</div>
      <div className="value-lg">
        {badge ? <span className={`badge badge-${badge}`}>{value}</span> : value}
      </div>
    </div>
  )
}
