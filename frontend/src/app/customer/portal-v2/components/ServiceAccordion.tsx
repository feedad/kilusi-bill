'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wifi, WifiOff, Globe, Shield, Users, Clock, ChevronDown, ChevronUp, Power, RefreshCw, Eye, EyeOff, Router, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import CustomerAuth from '@/lib/customer-auth'
import TrafficGraph from '@/components/customer/TrafficGraph'

interface Props { service: any; expanded: boolean; onToggle: () => void }

export default function ServiceAccordion({ service, expanded, onToggle }: Props) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [ssid, setSsid] = useState('')
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [upSsid, setUpSsid] = useState(false)
  const [upPwd, setUpPwd] = useState(false)
  const [rebooting, setRebooting] = useState(false)
  const [traffic, setTraffic] = useState<any[]>([])

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const r = await CustomerAuth.apiRequest<any>(`/api/v1/customer-radius/info?service_number=${service.service_number}`)
      if (r?.success && r.data) { setData(r.data); setSsid(r.data.deviceInfo?.ssid||''); setLoaded(true) }
    } catch(e:any){}
    finally { setLoading(false) }
  }, [service.service_number])

  useEffect(() => { if (expanded && !loaded) fetch() }, [expanded, loaded, fetch])

  useEffect(() => {
    if (!expanded || !data) return
    const iv = setInterval(() => {
      const dl = data.trafficStats?.downloadSpeed || 0; const ul = data.trafficStats?.uploadSpeed || 0
      const now = new Date(); const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      setTraffic(p => [...p.slice(-19), { time: t, download: dl, upload: ul }])
    }, 5000)
    return () => clearInterval(iv)
  }, [expanded, data])

  const online = data?.deviceInfo?.status === 'online'; const di = data?.deviceInfo; const ts = data?.trafficStats

  return (
    <Card className={`border-0 shadow-sm transition-all ${expanded?'ring-1 ring-primary/20':''}`}>
      <button onClick={onToggle} className="w-full text-left p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{service.service_number}</span>
            <Badge variant={service.status==='active'?'default':'secondary'} className="text-[10px]">{service.status==='active'?'Aktif':service.status}</Badge>
            {service.package_name && <Badge variant="outline" className="text-[10px]">{service.package_name}</Badge>}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {di?.ipAddress && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{di.ipAddress}</span>}
            {di?.macAddress && <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{di.macAddress.slice(0,12)}</span>}
            {data && <span className="flex items-center gap-1">{online?<Wifi className="w-3 h-3 text-green-500"/>:<WifiOff className="w-3 h-3 text-red-500"/>}{online?'Online':'Offline'}</span>}
            {ts?.connectedDevices != null && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{ts.connectedDevices}</span>}
          </div>
        </div>
        <div className="shrink-0 text-muted-foreground">{loading?<Loader2 className="w-4 h-4 animate-spin"/>:expanded?<ChevronUp className="w-4 h-4"/>:<ChevronDown className="w-4 h-4"/>}</div>
      </button>
      {expanded && <CardContent className="px-4 pb-4 pt-0 space-y-4">
        {loading && !loaded && <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /><span className="text-sm">Memuat...</span></div>}
        {loaded && data && <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[{icon:Globe,val:di?.ipAddress||'-',label:'IP'},{icon:Shield,val:(di?.macAddress||'-').slice(0,12),label:'MAC'},{icon:Clock,val:ts?.sessionDuration||'-',label:'Uptime'},{icon:Wifi,val:ts?.connectedDevices??'-',label:'Perangkat'}].map((s,i)=><div key={i} className="bg-muted/50 rounded-lg p-2 text-center"><s.icon className="w-3.5 h-3.5 mx-auto text-muted-foreground" /><p className="text-xs font-mono font-bold mt-1 truncate">{s.val}</p><p className="text-[10px] text-muted-foreground">{s.label}</p></div>)}
          </div>
          <div className="space-y-3 bg-muted/30 rounded-lg p-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Router className="w-4 h-4" />Pengaturan WiFi</h4>
            <div className="space-y-2">
              <div><Label className="text-xs">SSID</Label><div className="flex gap-2 mt-1"><Input value={ssid} onChange={e=>setSsid(e.target.value)} className="h-8 text-sm" placeholder="Nama WiFi" /><Button size="sm" className="h-8 text-xs shrink-0" onClick={async()=>{if(!ssid||ssid.trim().length<3){toast.error('SSID minimal 3 karakter');return};setUpSsid(true);try{await CustomerAuth.apiRequest('/api/v1/customer-radius/ssid',{method:'PUT',body:JSON.stringify({newSSID:ssid.trim()})});toast.success('SSID diperbarui')}catch{toast.error('Gagal')};setUpSsid(false)}} disabled={upSsid}>{upSsid?<Loader2 className="w-3 h-3 animate-spin"/>:'Ganti'}</Button></div></div>
              <div><Label className="text-xs">Password WiFi</Label><div className="flex gap-2 mt-1"><div className="relative flex-1"><Input type={showPwd?'text':'password'} value={pwd} onChange={e=>setPwd(e.target.value)} className="h-8 text-sm pr-8" placeholder="Password" /><button onClick={()=>setShowPwd(!showPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">{showPwd?<EyeOff className="w-3.5 h-3.5"/>:<Eye className="w-3.5 h-3.5"/>}</button></div><Button size="sm" className="h-8 text-xs shrink-0" onClick={async()=>{if(!pwd||pwd.length<8){toast.error('Password minimal 8 karakter');return};setUpPwd(true);try{await CustomerAuth.apiRequest('/api/v1/customer-radius/wifi-password',{method:'PUT',body:JSON.stringify({newPassword:pwd})});toast.success('Password diperbarui')}catch{toast.error('Gagal')};setUpPwd(false)}} disabled={upPwd}>{upPwd?<Loader2 className="w-3 h-3 animate-spin"/>:'Simpan'}</Button></div></div>
            </div>
          </div>
          <div className="bg-muted/30 rounded-lg p-3"><h4 className="text-sm font-semibold mb-2">Trafik</h4>
            {traffic.length>0?<div className="h-40"><TrafficGraph data={traffic} isActive={online} hasReceivedData={traffic.some((p:any)=>p.download>0||p.upload>0)} /></div>:<p className="text-xs text-muted-foreground text-center py-4">{online?'Menunggu data trafik...':'Perangkat offline'}</p>}
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>↓ {ts?.totalDownload||'0 GB'}</span><span>↑ {ts?.totalUpload||'0 GB'}</span></div>
          </div>
          {data.connectedDevices?.length>0 && <div className="bg-muted/30 rounded-lg p-3"><h4 className="text-sm font-semibold mb-2">Perangkat Terhubung</h4><div className="space-y-1.5">{data.connectedDevices.map((d:any,i:number)=><div key={i} className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" /><span className="font-mono truncate flex-1">{d.mac}</span><span className="text-muted-foreground">{d.ip}</span></div>)}</div></div>}
          <Button variant="outline" size="sm" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={async()=>{if(!confirm('Reboot perangkat?'))return;setRebooting(true);try{await CustomerAuth.apiRequest('/api/v1/customer-radius/reboot',{method:'POST'});toast.success('Perintah reboot dikirim')}catch{toast.error('Gagal')};setRebooting(false)}} disabled={rebooting}>{rebooting?<Loader2 className="w-3.5 h-3.5 mr-1 animate-spin"/>:<Power className="w-3.5 h-3.5 mr-1"/>}Reboot Modem</Button>
        </>}
        {loaded && !data && <p className="text-sm text-muted-foreground text-center py-4">Tidak dapat memuat data</p>}
      </CardContent>}
    </Card>
  )
}
