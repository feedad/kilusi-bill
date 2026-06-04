'use client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button, Input } from '@/components/ui'
import { toast } from 'react-hot-toast'
import {
  Search, Download, AlertCircle, Clock, Printer, Percent, Send,
  Loader2, Eye, Wallet, ChevronLeft, ChevronRight, CheckCircle
} from 'lucide-react'
import { SearchBar } from '@/components/SearchBar'
import { formatCurrency } from '@/lib/utils'
import { adminApi, endpoints } from '@/lib/api-clients'
import RapelModal from '@/components/Rapel/RapelModal'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface BillingRecord {
  id: string
  invoice_number: string
  customer_id: string
  customer_name: string
  customer_phone: string
  package_name: string
  service_number?: string
  area?: string
  region_name?: string
  mitra?: string
  kategori?: string
  amount: number
  diskon?: number
  ppn?: number
  total?: number
  unique_code?: number
  amount_with_code?: number
  due_date: string
  status: string
  created_at: string
  notes?: string
  sent_at?: string
}

const formatDate = (d: string | null) => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  overdue: { label: 'UNPAID', color: 'bg-red-500/10 text-red-600 border-red-500/30' },
  unpaid: { label: 'UNPAID', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
  sent: { label: 'UNPAID', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  draft: { label: 'UNPAID', color: 'bg-muted text-muted-foreground border-muted-foreground/30' },
}

export default function UnpaidBillingPage() {
  const pathname = usePathname()
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [pageSize] = useState(50)
  const [showRapel, setShowRapel] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [payForm, setPayForm] = useState(() => {
    const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
    return { amount: 0, payment_method: '', payment_date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, notes: '' }
  })
  const [paying, setPaying] = useState(false)
  const [sendingWA, setSendingWA] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (search) params.set('search', search)
      if (selectedMonth) {
        const [y, m] = selectedMonth.split('-')
        params.set('year', y); params.set('month', m)
      }
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/unpaid?${params}`)
      if (res.data?.success) {
        const data = res.data.data || []
        setRecords(data)
        setTotal(res.data.pagination?.total || 0)
        setTotalPages(res.data.pagination?.totalPages || 1)
        let ttl = 0; let ovd = 0
        data.forEach((r: BillingRecord) => { ttl += parseFloat(String(r.total || r.amount)) || 0; if (r.status === 'overdue') ovd++ })
        setTotalAmount(ttl)
        setOverdueCount(ovd)
      }
    } catch (e) {
      toast.error('Gagal memuat data invoice')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, selectedMonth])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map(r => r.id)))
    }
  }

  const handlePay = async () => {
    if (!selectedRecord) return
    setPaying(true)
    try {
      const res = await adminApi.post(`${endpoints.admin.billing}/payments`, {
        invoice_id: selectedRecord.id,
        amount: payForm.amount || selectedRecord.amount,
        payment_method: payForm.payment_method,
        payment_date: payForm.payment_date,
        notes: payForm.notes
      })
      if (res.data?.success) {
        toast.success('Pembayaran berhasil dicatat')
        setShowPayModal(false); setSelectedRecord(null)
        fetchRecords()
      } else { toast.error(res.data?.message || 'Gagal') }
    } catch (e: any) { toast.error(e.response?.data?.message || 'Gagal') }
    finally { setPaying(false) }
  }

  const handleSendWA = async (invoiceId?: string) => {
    setSendingWA(true)
    try {
      const ids = invoiceId ? [invoiceId] : Array.from(selectedIds)
      if (ids.length === 0) { toast.error('Pilih invoice dulu'); setSendingWA(false); return }
      for (const id of ids) {
        await adminApi.post(`${endpoints.admin.billing}/invoices/${id}/resend`)
      }
      toast.success(`Notif WA dikirim untuk ${ids.length} invoice`)
      setSelectedIds(new Set())
    } catch (e: any) { toast.error('Gagal kirim notif WA') }
    finally { setSendingWA(false) }
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ limit: '10000' })
      if (selectedMonth) { const [y, m] = selectedMonth.split('-'); params.set('year', y); params.set('month', m) }
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/unpaid?${params}`)
      if (!res.data?.success) return
      const invoices = res.data.data || []
      const headers = ['Invoice','Tgl Terbit','No.Layanan','Pelanggan','Profile','Mitra','Area','Kategori','Jth Tempo','Subtotal','Diskon','Kode Unik','Total','Note']
      const rows = invoices.map((inv: BillingRecord) => [
        inv.invoice_number, formatDate(inv.created_at), inv.service_number || '-',
        inv.customer_name, inv.package_name || '-', inv.mitra || '-', inv.area || '-',
        inv.kategori || 'OTOMATIS', formatDate(inv.due_date),
        inv.amount, inv.diskon || 0,
        inv.unique_code != null ? String(inv.unique_code).padStart(3, '0') : '',
        inv.amount_with_code || inv.total || inv.amount, (inv.notes || '').slice(0, 50)
      ])
      const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob)
      const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
      link.download = `tagihan-belum-dibayar-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.csv`; link.click()
      toast.success('Export berhasil')
    } catch (e) { toast.error('Gagal export') }
  }

  const monthOptions = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthOptions.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('id-ID', { month: '2-digit', year: 'numeric' }) })
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top Widget */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4 mb-1">
            <Link href="/admin/billing/unpaid" className={`text-lg font-semibold pb-1 px-1 border-b-2 border-red-500 text-foreground`}>Tagihan Belum Dibayar</Link>
            <Link href="/admin/billing/paid" className="text-lg font-semibold pb-1 px-1 text-muted-foreground hover:text-foreground">Invoice Lunas</Link>
          </div>
        </div>
      </div>

      {/* Total Widget */}
      <Card className="border-info/30 bg-info/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">TOTAL BELUM DIBAYAR</p>
              <p className="text-3xl font-bold text-foreground">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">{overdueCount}</p>
                <p className="text-muted-foreground">Terlambat</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-500">{total - overdueCount}</p>
                <p className="text-muted-foreground">Menunggu</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">{selectedIds.size}</p>
                <p className="text-muted-foreground">Dipilih</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => { records.length > 0 && openPayModal(records[0]) }}>
              <Wallet className="h-4 w-4 mr-1" />BAYAR
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />PRINT
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowRapel(true)}>
              <Clock className="h-4 w-4 mr-1" />RAPEL
            </Button>
            <Button size="sm" variant="outline">
              <Percent className="h-4 w-4 mr-1" />DISKON
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSendWA()} disabled={sendingWA}>
              <Send className="h-4 w-4 mr-1" />{sendingWA ? 'KIRIM...' : 'TAGIH WA'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />EXPORT
            </Button>
            <div className="flex-1" />
            <div className="flex-1 max-w-xs">
              <SearchBar onSearch={(q: string) => { setSearch(q); setPage(1) }} onSearchChange={() => {}} placeholder="Cari..." />
            </div>
            <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setPage(1) }} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              {monthOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 w-8"><input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.size === records.length && records.length > 0} /></th>
                <th className="text-left p-3 font-medium">STATUS</th>
                <th className="text-left p-3 font-medium">INVOICE</th>
                <th className="text-left p-3 font-medium">NO. LAYANAN</th>
                <th className="text-left p-3 font-medium">PELANGGAN</th>
                <th className="text-left p-3 font-medium">PROFILE</th>
                <th className="text-left p-3 font-medium">MITRA</th>
                <th className="text-left p-3 font-medium">KATEGORI</th>
                <th className="text-left p-3 font-medium">TGL TERBIT</th>
                <th className="text-left p-3 font-medium">JTH TEMPO</th>
                <th className="text-right p-3 font-medium">SUBTOTAL</th>
                <th className="text-right p-3 font-medium">DISKON</th>
                <th className="text-right p-3 font-medium">KODE UNIK</th>
                <th className="text-right p-3 font-medium">TOTAL</th>
                <th className="text-left p-3 font-medium">NOTE</th>
                <th className="text-center p-3 font-medium w-16">TAGIH</th>
                <th className="text-center p-3 font-medium w-20">AKSI</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={17} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={17} className="p-8 text-center text-muted-foreground">Tidak ada invoice</td></tr>
              ) : records.map(record => {
                const sc = STATUS_CONFIG[record.status] || STATUS_CONFIG.unpaid
                return (
                  <tr key={record.id} className="border-b hover:bg-muted/50">
                    <td className="p-3"><input type="checkbox" checked={selectedIds.has(record.id)} onChange={() => toggleSelect(record.id)} /></td>
                    <td className="p-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>{sc.label}</span></td>
                    <td className="p-3"><p className="font-medium">{record.invoice_number}</p></td>
                    <td className="p-3"><p className="font-mono text-xs">{record.service_number || '-'}</p></td>
                    <td className="p-3"><p className="font-medium text-sm">{record.customer_name}</p><p className="text-xs text-muted-foreground">{record.customer_phone}</p></td>
                    <td className="p-3">{record.package_name || '-'}</td>
                    <td className="p-3 text-xs">{record.mitra || record.area || '-'}</td>
                    <td className="p-3"><span className="text-xs bg-muted px-1.5 py-0.5 rounded">{record.kategori || 'OTOMATIS'}</span></td>
                    <td className="p-3 text-xs">{formatDate(record.created_at)}</td>
                    <td className="p-3 text-xs">{formatDate(record.due_date)}</td>
                    <td className="p-3 text-right font-mono text-xs">{formatCurrency(record.amount)}</td>
                    <td className="p-3 text-right text-xs text-green-600">{record.diskon > 0 ? formatCurrency(record.diskon) : '0'}</td>
                    <td className="p-3 text-right font-mono text-xs text-blue-600">{record.unique_code != null ? String(record.unique_code).padStart(3, '0') : '-'}</td>
                    <td className="p-3 text-right font-medium text-xs">{formatCurrency(record.amount_with_code || record.total || record.amount)}</td>
                    <td className="p-3 text-xs max-w-[120px] truncate" title={record.notes}>{record.notes?.slice(0, 30) || '-'}</td>
                    <td className="p-3 text-center">
                      <button onClick={() => handleSendWA(record.id)} className="hover:text-green-500" title="Kirim WA">
                        <Send className="h-4 w-4 mx-auto" />
                      </button>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedRecord(record); setShowDetail(true) }}><Eye className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedRecord(record); const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0'); setPayForm({ amount: record.total || record.amount, payment_method: '', payment_date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, notes: '' }); setShowPayModal(true) }}><Wallet className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* Pay Modal */}
      {showPayModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPayModal(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0"><h2 className="text-lg font-semibold">BAYAR</h2><Button variant="ghost" size="icon" onClick={() => setShowPayModal(false)}><span className="text-xl">&times;</span></Button></div>
            <div className="p-6 space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice:</span><span className="font-medium">{selectedRecord.invoice_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">No. Layanan:</span><span className="font-mono">{selectedRecord.service_number || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pelanggan:</span><span>{selectedRecord.customer_name}</span></div>
                {selectedRecord.unique_code != null && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Kode Unik:</span><span className="font-mono text-blue-600">{String(selectedRecord.unique_code).padStart(3, '0')}</span></div>
                )}
                <div className="flex justify-between font-bold"><span>Jumlah:</span><span>{formatCurrency(payForm.amount)}</span></div>
              </div>
              <div><label className="text-sm font-medium">Metode Bayar</label><select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"><option value="">-- Pilih --</option>{['Transfer Bank BRI','Transfer Bank BCA','Transfer Bank MANDIRI','Transfer Bank OCBC','QRIS','cash'].map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="text-sm font-medium">Tgl Bayar</label><Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} className="mt-1" /></div>
              <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setShowPayModal(false)}>Batal</Button><Button className="flex-1" onClick={handlePay} disabled={paying || !payForm.payment_method}>{paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}BAYAR</Button></div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDetail(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0"><h2 className="text-lg font-semibold">Detail Invoice</h2><Button variant="ghost" size="icon" onClick={() => setShowDetail(false)}><span className="text-xl">&times;</span></Button></div>
            <div className="p-6 space-y-2 text-sm">
              {[
                {k:'Invoice',v:selectedRecord.invoice_number},
                {k:'Tanggal Terbit',v:formatDate(selectedRecord.created_at)},
                {k:'No. Layanan',v:selectedRecord.service_number||'-'},
                {k:'Pelanggan',v:selectedRecord.customer_name},
                {k:'Telepon',v:selectedRecord.customer_phone},
                {k:'Profile',v:selectedRecord.package_name},
                {k:'Mitra',v:selectedRecord.mitra||'-'},
                {k:'Kategori',v:selectedRecord.kategori||'OTOMATIS'},
                {k:'Subtotal',v:formatCurrency(selectedRecord.amount)},
                {k:'Diskon',v:selectedRecord.diskon>0?formatCurrency(selectedRecord.diskon):'0'},
                ...(selectedRecord.unique_code != null ? [
                  {k:'Kode Unik',v:<span className="font-mono text-blue-600">{String(selectedRecord.unique_code).padStart(3, '0')}</span>},
                  {k:'Total Transfer',v:<span className="font-mono font-bold">{formatCurrency(selectedRecord.amount_with_code || selectedRecord.amount)}</span>}
                ] : []),
                {k:'Total',v:formatCurrency(selectedRecord.amount_with_code||selectedRecord.total||selectedRecord.amount)},
                {k:'Jatuh Tempo',v:formatDate(selectedRecord.due_date)},
                {k:'Note',v:selectedRecord.notes||'-'}
              ].map(row=>(<div key={row.k} className="flex justify-between"><span className="text-muted-foreground">{row.k}:</span><span className="font-medium">{row.v}</span></div>))}
            </div>
          </div>
        </div>
      )}
      <RapelModal isOpen={showRapel} onClose={() => setShowRapel(false)} onSuccess={fetchRecords} />
    </div>
  )
}
