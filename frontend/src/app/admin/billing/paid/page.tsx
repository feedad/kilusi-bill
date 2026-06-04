'use client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui'
import { toast } from 'react-hot-toast'
import {
  Download, Printer, Send, Trash2, RotateCcw, Eye,
  Loader2, ChevronLeft, ChevronRight, CheckCircle
} from 'lucide-react'
import { SearchBar } from '@/components/SearchBar'
import { formatCurrency } from '@/lib/utils'
import { adminApi, endpoints } from '@/lib/api-clients'
import Link from 'next/link'

interface BillingRecord {
  id: string
  invoice_number: string
  customer_id: string
  customer_name: string
  customer_phone: string
  package_name: string
  service_number?: string
  area?: string
  mitra?: string
  kategori?: string
  amount: number
  diskon?: number
  ppn?: number
  total?: number
  unique_code?: number
  amount_with_code?: number
  adm?: number
  payment_fee_amount?: number
  due_date: string
  status: string
  created_at: string
  paid_at?: string
  payment_method?: string
  payment_method_display?: string
  payment_source?: string
  processed_by?: string
  payment_notes?: string
  notes?: string
}

const formatDate = (d: string | null) => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatDateTime = (d: string | null) => {
  if (!d) return '-'
  const dt = new Date(d)
  return dt.toLocaleDateString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

export default function PaidBillingPage() {
  const [records, setRecords] = useState<BillingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [pageSize] = useState(50)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState({ paid_count: 0, cancelled_count: 0, total_revenue: 0, total_fee: 0, net_revenue: 0 })

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (search) params.set('search', search)
      if (selectedMonth) {
        const [y, m] = selectedMonth.split('-')
        params.set('year', y); params.set('month', m)
      }
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/paid?${params}`)
      if (res.data?.success) {
        setRecords(res.data.data || [])
        setTotalPages(res.data.pagination?.totalPages || 1)
        setTotal(res.data.pagination?.total || 0)
        if (res.data.meta?.stats) setStats(res.data.meta.stats)
      }
    } catch (e) { toast.error('Gagal memuat data') }
    finally { setLoading(false) }
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
    setSelectedIds(selectedIds.size === records.length ? new Set() : new Set(records.map(r => r.id)))
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ limit: '10000' })
      if (selectedMonth) { const [y, m] = selectedMonth.split('-'); params.set('year', y); params.set('month', m) }
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/paid?${params}`)
      if (!res.data?.success) return
      const invoices = res.data.data || []
      const headers = ['Invoice','No.Layanan','Pelanggan','Profile','Mitra','Kategori','Tgl Bayar','Admin','CABAR','Channel','Subtotal','Diskon','PPN','ADM','Kode Unik','Total','Note']
      const rows = invoices.map((inv: BillingRecord) => [
        inv.invoice_number, inv.service_number || '-', inv.customer_name, inv.package_name || '-',
        inv.mitra || '-', inv.kategori || 'OTOMATIS', formatDateTime(inv.paid_at),
        inv.processed_by || '-', inv.payment_source === 'tripay' ? 'TRIPAY' : 'TRANSFER',
        inv.payment_method_display || inv.payment_method || '-',
        inv.amount, inv.diskon || 0, inv.ppn || 0, inv.adm || inv.payment_fee_amount || 0,
        inv.unique_code != null ? String(inv.unique_code).padStart(3, '0') : '',
        inv.amount_with_code || inv.total || inv.amount, (inv.notes || '').slice(0, 50)
      ])
      const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob)
      const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
      link.download = `invoice-lunas-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.csv`; link.click()
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/billing/unpaid" className="text-lg font-semibold pb-1 px-1 text-muted-foreground hover:text-foreground">Tagihan Belum Dibayar</Link>
          <Link href="/admin/billing/paid" className="text-lg font-semibold pb-1 px-1 border-b-2 border-green-500 text-foreground">Invoice Lunas</Link>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">PENDAPATAN</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(parseFloat(String(stats.total_revenue)) || 0)}</div>
            <p className="text-xs text-muted-foreground">{total} invoice lunas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">BIAYA ADMIN</CardTitle>
            <ChevronLeft className="h-4 w-4 text-orange-500 rotate-90" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatCurrency(parseFloat(String(stats.total_fee)) || 0)}</div>
            <p className="text-xs text-muted-foreground">Biaya gateway</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">PENDAPATAN BERSIH</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(parseFloat(String(stats.net_revenue)) || 0)}</div>
            <p className="text-xs text-muted-foreground">Setelah biaya admin</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />PRINT</Button>
            <Button size="sm" variant="outline"><Send className="h-4 w-4 mr-1" />NOTIF WA</Button>
            <Button size="sm" variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-1" />EXPORT</Button>
            <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />REKAP HARIAN</Button>
            <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />REKAP BULANAN</Button>
            <Button size="sm" variant="outline"><RotateCcw className="h-4 w-4 mr-1" />RollBack</Button>
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
                <th className="text-left p-3 font-medium">INVOICE</th>
                <th className="text-left p-3 font-medium">NO LAYANAN</th>
                <th className="text-left p-3 font-medium">PELANGGAN</th>
                <th className="text-left p-3 font-medium">PROFILE</th>
                <th className="text-left p-3 font-medium">MITRA</th>
                <th className="text-left p-3 font-medium">KATEGORI</th>
                <th className="text-left p-3 font-medium">TGL BAYAR</th>
                <th className="text-left p-3 font-medium">ADMIN</th>
                <th className="text-left p-3 font-medium">CABAR</th>
                <th className="text-left p-3 font-medium">CHANNEL</th>
                <th className="text-right p-3 font-medium">SUBTOTAL</th>
                <th className="text-right p-3 font-medium">DISKON</th>
                <th className="text-right p-3 font-medium">ADM</th>
                <th className="text-right p-3 font-medium">KODE UNIK</th>
                <th className="text-right p-3 font-medium">TOTAL</th>
                <th className="text-left p-3 font-medium">NOTE</th>
                <th className="text-center p-3 font-medium w-20">AKSI</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={18} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={18} className="p-8 text-center text-muted-foreground">Tidak ada invoice lunas</td></tr>
              ) : records.map(record => (
                <tr key={record.id} className="border-b hover:bg-muted/50">
                  <td className="p-3"><input type="checkbox" checked={selectedIds.has(record.id)} onChange={() => toggleSelect(record.id)} /></td>
                  <td className="p-3"><p className="font-medium">{record.invoice_number}</p><p className="text-xs text-muted-foreground">{formatDate(record.created_at)}</p></td>
                  <td className="p-3"><p className="font-mono text-xs">{record.service_number || '-'}</p></td>
                  <td className="p-3"><p className="font-medium text-sm">{record.customer_name}</p><p className="text-xs text-muted-foreground">{record.customer_phone}</p></td>
                  <td className="p-3">{record.package_name || '-'}</td>
                  <td className="p-3 text-xs">{record.mitra || record.area || '-'}</td>
                  <td className="p-3"><span className="text-xs bg-muted px-1.5 py-0.5 rounded">{record.kategori || 'OTOMATIS'}</span></td>
                  <td className="p-3 text-xs">{formatDateTime(record.paid_at)}</td>
                  <td className="p-3 text-xs">{record.processed_by || '-'}</td>
                  <td className="p-3 text-xs">{record.payment_source === 'tripay' ? 'TRIPAY' : 'TRANSFER'}</td>
                  <td className="p-3 text-xs">{record.payment_method_display || record.payment_method || '-'}</td>
                  <td className="p-3 text-right font-mono text-xs">{formatCurrency(record.amount)}</td>
                  <td className="p-3 text-right text-xs text-green-600">{record.diskon > 0 ? formatCurrency(record.diskon) : '0'}</td>
                  <td className="p-3 text-right text-xs">{formatCurrency(record.adm || record.payment_fee_amount || 0)}</td>
                  <td className="p-3 text-right font-mono text-xs text-blue-600">{record.unique_code != null ? String(record.unique_code).padStart(3, '0') : '-'}</td>
                  <td className="p-3 text-right font-medium text-xs">{formatCurrency(record.amount_with_code || record.total || record.amount)}</td>
                  <td className="p-3 text-xs max-w-[100px] truncate" title={record.notes || ''}>{record.notes?.slice(0, 25) || '-'}</td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="ghost" onClick={() => { setSelectedRecord(record); setShowDetail(true) }}><Eye className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Detail Modal */}
      {showDetail && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDetail(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0"><h2 className="text-lg font-semibold">Detail Invoice</h2><Button variant="ghost" size="icon" onClick={() => setShowDetail(false)}><span className="text-xl">&times;</span></Button></div>
            <div className="p-6 space-y-2 text-sm">
              {[
                {k:'Invoice',v:selectedRecord.invoice_number},
                {k:'No. Layanan',v:selectedRecord.service_number||'-'},
                {k:'Pelanggan',v:selectedRecord.customer_name},
                {k:'Profile',v:selectedRecord.package_name},
                {k:'Mitra',v:selectedRecord.mitra||'-'},
                {k:'Kategori',v:selectedRecord.kategori||'OTOMATIS'},
                {k:'Tgl Bayar',v:formatDateTime(selectedRecord.paid_at)},
                {k:'Admin',v:selectedRecord.processed_by||'-'},
                {k:'CABAR',v:selectedRecord.payment_source==='tripay'?'TRIPAY':'TRANSFER'},
                {k:'Channel',v:selectedRecord.payment_method_display||selectedRecord.payment_method||'-'},
                {k:'Subtotal',v:formatCurrency(selectedRecord.amount)},
                {k:'Diskon',v:selectedRecord.diskon>0?formatCurrency(selectedRecord.diskon):'0'},
                {k:'ADM',v:formatCurrency(selectedRecord.adm||selectedRecord.payment_fee_amount||0)},
                ...(selectedRecord.unique_code != null ? [
                  {k:'Kode Unik',v:<span className="font-mono text-blue-600">{String(selectedRecord.unique_code).padStart(3, '0')}</span>},
                  {k:'Total Transfer',v:<span className="font-mono font-bold">{formatCurrency(selectedRecord.amount_with_code || selectedRecord.amount)}</span>}
                ] : []),
                {k:'Total',v:formatCurrency(selectedRecord.amount_with_code||selectedRecord.total||selectedRecord.amount)},
                {k:'Note',v:selectedRecord.notes||'-'}
              ].map(row=>(<div key={row.k} className="flex justify-between"><span className="text-muted-foreground">{row.k}:</span><span className="font-medium">{row.v}</span></div>))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
