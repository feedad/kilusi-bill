import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, apiUpload } from '../utils/api'

export default function Settings(){
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [wa, setWa] = useState(null)

  useEffect(()=>{
    let stop = false
    ;(async ()=>{
      setLoading(true); setErr(''); setMsg('')
      try{
        const [settings, waStatus] = await Promise.all([
          apiGet('/admin/setting/data'),
          apiGet('/admin/setting/wa-status').catch(()=>null)
        ])
        if(!stop){ setS(settings); setWa(waStatus) }
      }catch(e){ if(!stop) setErr(e.message) }
      finally{ if(!stop) setLoading(false) }
    })()
    return ()=>{ stop = true }
  },[])

  const canSave = useMemo(()=>!!s && !saving, [s, saving])

  async function save(){
    if(!s) return
    setSaving(true); setErr(''); setMsg('')
    try{
      // Send only selected fields to avoid unintended overwrites
      const payload = {
        company_header: s.company_header,
        footer_info: s.footer_info,
        server_host: s.server_host,
        server_port: s.server_port,
        mikrotik_host: s.mikrotik_host,
        mikrotik_port: s.mikrotik_port,
        mikrotik_user: s.mikrotik_user,
        ...(s.mikrotik_password ? { mikrotik_password: s.mikrotik_password } : {}),
        genieacs_url: s.genieacs_url,
        pppoe_monitor_enable: s.pppoe_monitor_enable,
        rx_power_warning: s.rx_power_warning,
        rx_power_critical: s.rx_power_critical,
        snmp_monitoring_enabled: s.snmp_monitoring_enabled,
        snmp_community: s.snmp_community,
        payment_gateway_provider: s.payment_gateway_provider || '',
        payment_gateway_api_key: s.payment_gateway_api_key || '',
        payment_gateway_merchant_id: s.payment_gateway_merchant_id || '',
        pppoe_username_suffix: s.pppoe_username_suffix || ''
      }
      const res = await apiPost('/admin/setting/save', payload)
      setMsg(res?.message || 'Settings saved')
    }catch(e){ setErr(e.message) }
    finally{ setSaving(false) }
  }

  async function uploadLogo(file){
    if(!file) return
    setErr(''); setMsg('')
    try{
      const fd = new FormData()
      fd.append('logo', file)
      const res = await apiUpload('/admin/setting/upload-logo', fd)
      setMsg(res?.message || 'Logo uploaded')
    }catch(e){ setErr(e.message) }
  }

  async function refreshWa(){
    try{ await apiPost('/admin/setting/wa-refresh'); const ws = await apiGet('/admin/setting/wa-status'); setWa(ws); setMsg('WhatsApp session refreshed') }
    catch(e){ setErr(e.message) }
  }

  return (
    <div>
      <h3 className="page-title">Settings</h3>
      <p className="muted" style={{marginTop:-8}}>Legacy page: <a href="/admin/setting" target="_blank" rel="noreferrer">/admin/setting</a></p>
      {err && <div className="alert alert-danger">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      {loading ? <div className="spinner"/> : s && (
        <div className="info-grid">
          <div className="card">
            <h4 className="card-title">General</h4>
            <div className="form-row">
              <label>Company Header</label>
              <input className="input" value={s.company_header||''} onChange={e=>setS({...s, company_header:e.target.value})} />
            </div>
            <div className="form-row">
              <label>Footer Info</label>
              <input className="input" value={s.footer_info||''} onChange={e=>setS({...s, footer_info:e.target.value})} />
            </div>
            <div className="form-row">
              <label>Logo</label>
              <input type="file" accept="image/*,.svg" onChange={e=>uploadLogo(e.target.files?.[0])} />
            </div>
          </div>

          <div className="card">
            <h4 className="card-title">Server</h4>
            <div className="form-row">
              <label>Host</label>
              <input className="input" value={s.server_host||''} onChange={e=>setS({...s, server_host:e.target.value})} />
            </div>
            <div className="form-row">
              <label>Port</label>
              <input className="input" value={s.server_port||''} onChange={e=>setS({...s, server_port:e.target.value})} />
            </div>
          </div>

          <div className="card">
            <h4 className="card-title">MikroTik</h4>
            <div className="form-row"><label>Host</label><input className="input" value={s.mikrotik_host||''} onChange={e=>setS({...s, mikrotik_host:e.target.value})} /></div>
            <div className="form-row"><label>Port</label><input className="input" value={s.mikrotik_port||''} onChange={e=>setS({...s, mikrotik_port:e.target.value})} /></div>
            <div className="form-row"><label>User</label><input className="input" value={s.mikrotik_user||''} onChange={e=>setS({...s, mikrotik_user:e.target.value})} /></div>
            <div className="form-row"><label>Password</label><input className="input" type="password" placeholder="(unchanged)" value={s.mikrotik_password||''} onChange={e=>setS({...s, mikrotik_password:e.target.value})} /></div>
          </div>

          <div className="card">
            <h4 className="card-title">GenieACS</h4>
            <div className="form-row"><label>URL</label><input className="input" value={s.genieacs_url||''} onChange={e=>setS({...s, genieacs_url:e.target.value})} /></div>
          </div>

          <div className="card">
            <h4 className="card-title">Billing</h4>
            <div className="form-row"><label>Gateway Provider</label><input className="input" value={s.payment_gateway_provider||''} onChange={e=>setS({...s, payment_gateway_provider:e.target.value})} /></div>
            <div className="form-row"><label>API Key</label><input className="input" value={s.payment_gateway_api_key||''} onChange={e=>setS({...s, payment_gateway_api_key:e.target.value})} /></div>
            <div className="form-row"><label>Merchant ID</label><input className="input" value={s.payment_gateway_merchant_id||''} onChange={e=>setS({...s, payment_gateway_merchant_id:e.target.value})} /></div>
            <div className="form-row"><label>PPPoE Username Suffix</label><input className="input" placeholder="e.g. @kilusi" value={s.pppoe_username_suffix||''} onChange={e=>setS({...s, pppoe_username_suffix:e.target.value})} /></div>
          </div>

          <div className="card">
            <h4 className="card-title">Monitoring</h4>
            <div className="form-row"><label>PPPoE Monitor Enabled</label>
              <select className="input" value={s.pppoe_monitor_enable||'false'} onChange={e=>setS({...s, pppoe_monitor_enable:e.target.value})}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
            <div className="form-row"><label>RX Power Warning</label><input className="input" value={s.rx_power_warning||''} onChange={e=>setS({...s, rx_power_warning:e.target.value})} /></div>
            <div className="form-row"><label>RX Power Critical</label><input className="input" value={s.rx_power_critical||''} onChange={e=>setS({...s, rx_power_critical:e.target.value})} /></div>
            <div className="form-row"><label>SNMP Enabled</label>
              <select className="input" value={s.snmp_monitoring_enabled||'false'} onChange={e=>setS({...s, snmp_monitoring_enabled:e.target.value})}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
            <div className="form-row"><label>SNMP Community</label><input className="input" value={s.snmp_community||''} onChange={e=>setS({...s, snmp_community:e.target.value})} /></div>
          </div>

          <div className="card">
            <h4 className="card-title">WhatsApp</h4>
            <div className="muted" style={{marginBottom:8}}>
              Status: {wa?.status || (wa?.connected ? 'connected' : 'disconnected')} {wa?.phoneNumber ? `(${wa.phoneNumber})` : ''}
            </div>
            <div className="toolbar">
              <button className="btn-secondary" onClick={refreshWa}>Refresh Session</button>
            </div>
          </div>

        </div>
      )}

      <div style={{marginTop:12}}>
        <button onClick={save} disabled={!canSave}>{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </div>
  )
}
