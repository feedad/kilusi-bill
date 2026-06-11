'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Calendar, ArrowRight, CreditCard, CheckCircle } from 'lucide-react'

const fmt = (n:number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(n)
const fmtDate = (s:string) => { if(!s) return '-'; const d=new Date(s); return d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'}) }
const UNPAID = ['unpaid','overdue','sent','draft','suspended','pending']

export default function InvoiceSummaryCard({ invoices, services }: { invoices: any[]; services: any[] }) {
  const router = useRouter()
  const unpaid = invoices.filter(i => i.can_pay || UNPAID.includes(i.status||'') || UNPAID.includes(i.display_status||''))
  const grouped: Record<string,{count:number;total:number;earliest:string}> = {}
  for (const inv of unpaid) {
    const k = inv.service_number || '__other__'
    if (!grouped[k]) grouped[k] = { count:0, total:0, earliest:'2999-12-31' }
    grouped[k].count++; grouped[k].total += inv.amount_with_code || inv.amount
    if (inv.due_date && inv.due_date < grouped[k].earliest) grouped[k].earliest = inv.due_date
  }
  if (!Object.keys(grouped).length) return <Card className="border-0 shadow-sm"><CardContent className="p-4 flex items-center gap-2 text-muted-foreground"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm">Tidak ada tagihan</span></CardContent></Card>
  const totalAll = Object.values(grouped).reduce((s:any,g:any)=>s+g.total,0)
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2 px-4 pt-4"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" />Tagihan</CardTitle></CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {Object.entries(grouped).map(([sn,g]) => {
          const svc = services.find(s=>s.service_number===sn)
          return (
            <div key={sn} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2.5">
              <div className="min-w-0 flex-1 mr-3">
                <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" /><span className="text-sm font-medium truncate">{svc?`${sn}${svc.status!=='active'?` (${svc.status})`:''}`:sn}</span>{g.count>1&&<Badge variant="outline" className="text-[10px]">{g.count}x</Badge>}</div>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(g.earliest)}{g.count>1&&<span className="ml-1">(terlama)</span>}</p>
              </div>
              <Button size="sm" className="h-7 text-xs shrink-0" onClick={() => router.push('/customer/billing')}>Bayar</Button>
            </div>
          )
        })}
        {Object.keys(grouped).length > 1 && <div className="pt-2 border-t flex items-center justify-between"><span className="text-sm font-semibold">Total {fmt(totalAll)}</span><Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => router.push('/customer/billing')}>Lihat Semua <ArrowRight className="w-3 h-3 ml-1" /></Button></div>}
      </CardContent>
    </Card>
  )
}
