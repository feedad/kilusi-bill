'use client'
import React, { useState, useEffect } from 'react'
import { X, Bell, BellOff } from 'lucide-react'
import { customerAPI } from '@/lib/customer-api'

export default function NotificationPanel({ open, onClose, customerId }: { open: boolean; onClose: () => void; customerId?: any }) {
  const [notifs, setNotifs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => { if(open) { setLoading(true); customerAPI.getNotifications(customerId).then(r=>{if(r?.data)setNotifs(r.data)}).catch(()=>{}).finally(()=>setLoading(false)) } }, [open, customerId])
  if (!open) return null
  const unread = notifs.filter((n:any)=>!n.read).length
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-4 h-14 border-b shrink-0"><div className="flex items-center gap-2"><Bell className="w-4 h-4 text-primary" /><h3 className="font-semibold text-sm">Notifikasi</h3>{unread>0&&<span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold">{unread} baru</span>}</div><button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button></div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Memuat...</div>
          : notifs.length===0 ? <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2"><BellOff className="w-8 h-8" /><p className="text-sm">Tidak ada notifikasi</p></div>
          : <div className="divide-y">{notifs.map((n:any)=><div key={n.id} className={`px-4 py-3 cursor-pointer hover:bg-accent/50 ${!n.read?'bg-primary/5':''}`}><div className="flex items-start gap-3"><div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.type==='maintenance'?'bg-orange-500':n.type==='payment'?'bg-green-500':'bg-blue-500'}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p><p className="text-[10px] text-muted-foreground mt-1.5">{n.date?new Date(n.date).toLocaleDateString('id-ID',{day:'2-digit',month:'long',hour:'2-digit',minute:'2-digit'}):''}</p></div>{!n.read&&<span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />}</div></div>)}</div>}
        </div>
      </div>
      <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}.animate-slide-in-right{animation:slideInRight .2s ease-out}`}</style>
    </>
  )
}
