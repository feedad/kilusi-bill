'use client'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button, Input } from '@/components/ui'
import { toast } from 'react-hot-toast'
import {
  Search, Download, AlertCircle, Clock, Printer, Percent, Send,
  Loader2, Eye, Wallet, ChevronLeft, ChevronRight, CheckCircle,
  Trash2, RotateCcw
} from 'lucide-react'
import { SearchBar } from '@/components/SearchBar'
import { formatCurrency } from '@/lib/utils'
import { adminApi, endpoints } from '@/lib/api-clients'
import RapelModal from '@/components/Rapel/RapelModal'

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
  adm?: number
  payment_fee_amount?: number
  due_date: string
  status: string
  sent_at?: string
  created_at: string
  paid_at?: string
  payment_method?: string
  payment_method_display?: string
  payment_source?: string
  processed_by?: string
  cabar?: string
  payment_notes?: string
  notes?: string
  unique_code?: number
  amount_with_code?: number
  service_status?: string
  isolir_date?: string
  suspension_time?: string
}

const formatDate = (d: string | null) => {
  if (!d) return '-'
  const dt = new Date(d)
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const formatDateTime = (d: string | null) => {
  if (!d) return '-'
  const dt = new Date(d)
  return dt.toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  suspended: { label: 'SUSPENDED', color: 'bg-red-500/10 text-red-600 border-red-500/30' },
  unpaid: { label: 'UNPAID', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' },
  sent: { label: 'SENT', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  draft: { label: 'DRAFT', color: 'bg-muted text-muted-foreground border-muted-foreground/30' },
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'TUNAI', channel: '-', type: 'tunai' },
  { value: 'bank_bri', label: 'TRANSFER BANK BRI', channel: 'BRI', type: 'transfer' },
  { value: 'bank_bca', label: 'TRANSFER BANK BCA', channel: 'BCA', type: 'transfer' },
  { value: 'bank_mandiri', label: 'TRANSFER BANK MANDIRI', channel: 'MANDIRI', type: 'transfer' },
  { value: 'bank_ocbc', label: 'TRANSFER BANK OCBC', channel: 'OCBC', type: 'transfer' },
  { value: 'qris', label: 'QRIS', channel: 'QRIS', type: 'transfer' },
  { value: 'ewallet', label: 'E-WALLET', channel: 'E-Wallet', type: 'transfer' },
]

const monthOptions: { value: string; label: string }[] = []
const now = new Date()
for (let i = 0; i < 12; i++) {
  const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
  monthOptions.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('id-ID', { month: '2-digit', year: 'numeric' }) })
}

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'unpaid' | 'paid'>('unpaid')

  // Unpaid state
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
  const [pageSize, setPageSize] = useState(10)
  const [showRapel, setShowRapel] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [payForm, setPayForm] = useState(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return { amount: 0, payment_method: '', payment_date: `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`, notes: '' }
  })
  const [paying, setPaying] = useState(false)
  const [sendingWA, setSendingWA] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<{ value: string; label: string; channel?: string }[]>([])
  const [showDiskon, setShowDiskon] = useState(false)
  const [discounts, setDiscounts] = useState<any[]>([])
  const [applyingDiskon, setApplyingDiskon] = useState(false)
  const [showRekapHarian, setShowRekapHarian] = useState(false)
  const [showRekapBulanan, setShowRekapBulanan] = useState(false)
  const [rekapHarianRange, setRekapHarianRange] = useState(() => {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    return { start: today, end: today }
  })
  const [rekapBulananRange, setRekapBulananRange] = useState({ startMonth: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`, endMonth: `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}` })

  // Paid state
  const [paidRecords, setPaidRecords] = useState<BillingRecord[]>([])
  const [paidLoading, setPaidLoading] = useState(true)
  const [paidPage, setPaidPage] = useState(1)
  const [paidTotalPages, setPaidTotalPages] = useState(1)
  const [paidTotal, setPaidTotal] = useState(0)
  const [paidPageSize, setPaidPageSize] = useState(10)
  const [paidSearch, setPaidSearch] = useState('')
  const [paidMonth, setPaidMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [paidSelectedIds, setPaidSelectedIds] = useState<Set<string>>(new Set())
  const [paidStats, setPaidStats] = useState({ paid_count: 0, cancelled_count: 0, total_revenue: 0, total_fee: 0, net_revenue: 0 })

  // Fetch bank accounts for payment modal
  useEffect(() => {
    const fetchBankAccounts = async () => {
      try {
        const res = await adminApi.get(`${endpoints.admin.settings}/payment-methods`)
        if (res.data?.success && res.data?.data?.payment_methods) {
          const mapped = res.data.data.payment_methods
            .filter((m: any) => m.active !== false)
            .map((m: any) => ({
              value: m.id,
              label: m.displayName || m.name
            }))
          setBankAccounts(mapped)
        }
      } catch (e) {
        // Fallback to empty
      }
    }
    fetchBankAccounts()
  }, [])

  const fetchUnpaid = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
      if (search) params.set('search', search)
      if (selectedMonth && !search) {
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

  const fetchPaid = useCallback(async () => {
    setPaidLoading(true)
    try {
      const params = new URLSearchParams({ page: String(paidPage), limit: String(paidPageSize) })
      if (paidSearch) params.set('search', paidSearch)
      if (paidMonth && !paidSearch) {
        const [y, m] = paidMonth.split('-')
        params.set('year', y); params.set('month', m)
      }
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/paid?${params}`)
      if (res.data?.success) {
        setPaidRecords(res.data.data || [])
        setPaidTotalPages(res.data.pagination?.totalPages || 1)
        setPaidTotal(res.data.pagination?.total || 0)
        if (res.data.meta?.stats) setPaidStats(res.data.meta.stats)
      }
    } catch (e) { toast.error('Gagal memuat data') }
    finally { setPaidLoading(false) }
  }, [paidPage, pageSize, paidSearch, paidMonth])

  useEffect(() => { fetchUnpaid() }, [fetchUnpaid])
  useEffect(() => { fetchPaid() }, [fetchPaid])

  // When switching tabs, reset selections
  useEffect(() => { setSelectedIds(new Set()); setPaidSelectedIds(new Set()) }, [activeTab])

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === records.length ? new Set() : new Set(records.map(r => r.id)))
  }

  const togglePaidSelect = (id: string) => {
    const next = new Set(paidSelectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setPaidSelectedIds(next)
  }
  const togglePaidSelectAll = () => {
    setPaidSelectedIds(paidSelectedIds.size === paidRecords.length ? new Set() : new Set(paidRecords.map(r => r.id)))
  }

  const openPayModal = (record: BillingRecord) => {
    setSelectedRecord(record)
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setPayForm({ amount: record.total || record.amount, payment_method: '', payment_date: `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`, notes: '' })
    setShowPayModal(true)
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
        fetchUnpaid()
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

  const handlePaidExport = async () => {
    try {
      const params = new URLSearchParams({ limit: '10000' })
      if (paidMonth) { const [y, m] = paidMonth.split('-'); params.set('year', y); params.set('month', m) }
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/paid?${params}`)
      if (!res.data?.success) return
      const invoices = res.data.data || []
      const headers = ['Invoice','No.Layanan','Pelanggan','Profile','Mitra','Kategori','Tgl Bayar','Admin','CABAR','Channel','Subtotal','Diskon','PPN','ADM','Kode Unik','Total','Note']
      const rows = invoices.map((inv: BillingRecord) => [
        inv.invoice_number, inv.service_number || '-', inv.customer_name, inv.package_name || '-',
        inv.mitra || '-', inv.kategori || 'OTOMATIS', formatDateTime(inv.paid_at),
        inv.processed_by || '-', inv.cabar || (inv.payment_source === 'tripay' ? 'TRIPAY' : inv.payment_source === 'autopay' ? 'AUTOPAY' : 'TRANSFER'),
        inv.payment_method_display || inv.payment_method || '-',
        inv.amount, inv.diskon || 0, inv.ppn || 0, inv.adm || inv.payment_fee_amount || 0,
        inv.unique_code != null ? String(inv.unique_code).padStart(3, '0') : '',
        inv.amount_with_code || inv.total || inv.amount, (inv.notes || '').slice(0, 50)
      ])
      const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => typeof c === 'string' && c.includes(',') ? `"${c}"` : c).join(',')).join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0')
      link.download = `invoice-lunas-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}.csv`; link.click()
      toast.success('Export berhasil')
    } catch (e) { toast.error('Gagal export') }
  }

  // Build dynamic payment method list with 4 categories
  const paymentMethodOptions = bankAccounts.length > 0
    ? [
        { value: 'cash', label: 'TUNAI', channel: '-' },
        ...bankAccounts.map(b => ({ value: b.value, label: b.label.toUpperCase(), channel: b.label })),
      ]
    : [
        ...PAYMENT_METHODS.map(m => ({ value: m.value, label: m.label, channel: m.channel })),
      ]

  // Rekap Harian (tanggal, max 30 hari)
  const handleRekapHarian = async () => {
    try {
      const { start, end } = rekapHarianRange
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/paid?limit=10000&start_date=${start}&end_date=${end}`)
      if (!res.data?.success) { toast.error('Gagal memuat data'); return }
      printRekapPDF(res.data.data || [], 'Rekap Harian', `${start} s/d ${end}`, ['Invoice','Pelanggan','Profile','Channel','Subtotal','Diskon','ADM','Total','Tgl Bayar','Note'],
        (inv: BillingRecord) => [inv.invoice_number, inv.customer_name, inv.package_name||'-', inv.payment_method_display||inv.payment_method||'-', inv.amount, inv.diskon||0, inv.adm||inv.payment_fee_amount||0, inv.total||inv.amount, formatDateTime(inv.paid_at), (inv.notes||'').slice(0,30)]
      )
      setShowRekapHarian(false)
    } catch (e) { toast.error('Gagal rekap harian') }
  }

  // Rekap Bulanan (bulan ke bulan)
  const handleRekapBulanan = async () => {
    try {
      const [sy, sm] = rekapBulananRange.startMonth.split('-')
      const [ey, em] = rekapBulananRange.endMonth.split('-')
      const res = await adminApi.get(`${endpoints.admin.billing}/invoices/paid?limit=10000&start_date=${sy}-${sm}-01&end_date=${ey}-${em}-28`)
      if (!res.data?.success) { toast.error('Gagal memuat data'); return }
      printRekapPDF(res.data.data || [], 'Rekap Bulanan', `${rekapBulananRange.startMonth} s/d ${rekapBulananRange.endMonth}`, ['Invoice','Pelanggan','Profile','Channel','Subtotal','Diskon','ADM','Total','Tgl Bayar','Note'],
        (inv: BillingRecord) => [inv.invoice_number, inv.customer_name, inv.package_name||'-', inv.payment_method_display||inv.payment_method||'-', inv.amount, inv.diskon||0, inv.adm||inv.payment_fee_amount||0, inv.total||inv.amount, formatDateTime(inv.paid_at), (inv.notes||'').slice(0,30)]
      )
      setShowRekapBulanan(false)
    } catch (e) { toast.error('Gagal rekap bulanan') }
  }

  // Print rekap as PDF via browser print
  const printRekapPDF = (invoices: BillingRecord[], title: string, periode: string, headers: string[], rowFn: (inv: BillingRecord) => any[]) => {
    const totalAmount = invoices.reduce((sum, inv) => sum + (parseFloat(String(inv.total || inv.amount)) || 0), 0)
    const totalAdm = invoices.reduce((sum, inv) => sum + (parseFloat(String(inv.adm || inv.payment_fee_amount)) || 0), 0)
    const rows = invoices.map(rowFn)
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:Arial,sans-serif;margin:20px;color:#333} h2{text-align:center;margin-bottom:0} .periode{text-align:center;color:#666;font-size:14px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:12px} th{background:#f0f0f0;border:1px solid #ddd;padding:6px 8px;text-align:left} td{border:1px solid #ddd;padding:4px 8px} .right{text-align:right}
      .summary{margin-top:15px;font-size:13px} .summary div{margin:2px 0} .summary strong{display:inline-block;width:150px} @media print{body{margin:0}}
</style></head><body><h2>${title}</h2><p class="periode">Periode: ${periode}</p><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c: any) => `<td class="${typeof c === 'number' ? 'right' : ''}">${typeof c === 'number' ? c.toLocaleString('id-ID') : c}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="summary"><div><strong>Total Invoice:</strong> ${invoices.length}</div><div><strong>Total Pendapatan:</strong> Rp ${totalAmount.toLocaleString('id-ID')}</div><div><strong>Total Biaya Admin:</strong> Rp ${totalAdm.toLocaleString('id-ID')} (ditanggung pelanggan)</div><div><strong>Pendapatan Bersih:</strong> Rp ${totalAmount.toLocaleString('id-ID')}</div></div><script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script></body></html>`
    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) { w.document.write(html); w.document.close() }
    toast.success(`${invoices.length} invoice siap dicetak`)
  }

  // Apply diskon from active discount rules
  const handleApplyDiskon = async (discountId: number) => {
    setApplyingDiskon(true)
    try {
      const res = await adminApi.post(`/api/v1/discounts/${discountId}/apply`)
      if (res.data?.success) {
        toast.success(`Diskon diterapkan ke ${res.data.data?.appliedCount || 0} invoice`)
        setShowDiskon(false); fetchUnpaid()
      } else { toast.error(res.data?.message || 'Gagal') }
    } catch (e: any) { toast.error(e.response?.data?.message || 'Gagal menerapkan diskon') }
    finally { setApplyingDiskon(false) }
  }

  // Rollback (hanya 1x per invoice)
  const handleRollback = async () => {
    if (paidSelectedIds.size === 0) { toast.error('Pilih invoice dulu'); return }
    if (!confirm(`Rollback ${paidSelectedIds.size} pembayaran? Tindakan ini tidak dapat dibatalkan.`)) return
    let success = 0; let failed = 0
    try {
      for (const id of Array.from(paidSelectedIds)) {
        try {
          const res = await adminApi.post(`${endpoints.admin.billing}/payments/${id}/rollback`, { reason: 'Admin rollback' })
          if (res.data?.success) success++; else failed++
        } catch (e: any) {
          if (e.response?.status === 409) { toast.error('Beberapa invoice sudah di-rollback sebelumnya'); failed++ }
          else failed++
        }
      }
      toast.success(`Rollback: ${success} berhasil, ${failed} gagal`)
      setPaidSelectedIds(new Set()); fetchPaid()
    } catch (e: any) { toast.error(e.response?.data?.message || 'Gagal rollback') }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setActiveTab('unpaid')}
          className={`text-lg font-semibold pb-1 px-1 border-b-2 transition-colors ${activeTab === 'unpaid' ? 'border-red-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Tagihan Belum Dibayar
        </button>
        <button
          onClick={() => setActiveTab('paid')}
          className={`text-lg font-semibold pb-1 px-1 border-b-2 transition-colors ${activeTab === 'paid' ? 'border-green-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Invoice Lunas
        </button>
      </div>

      {/* UNPAID TAB */}
      {activeTab === 'unpaid' && (
        <>
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

          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* Row 1: Action buttons */}
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
                <Button size="sm" variant="outline" onClick={async () => { 
                  try { const r = await adminApi.get('/api/v1/discounts?status=active&limit=50'); const list = r.data?.data?.data || r.data?.data || []; setDiscounts(Array.isArray(list) ? list : []); setShowDiskon(true) } catch { setDiscounts([]); setShowDiskon(true) }
                }}>
                  <Percent className="h-4 w-4 mr-1" />DISKON
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleSendWA()} disabled={sendingWA}>
                  <Send className="h-4 w-4 mr-1" />{sendingWA ? 'KIRIM...' : 'TAGIH WA'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" />EXPORT
                </Button>
              </div>
              {/* Row 2: Search + filters - full width on mobile */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <SearchBar onSearch={(q: string) => { setSearch(q); setPage(1) }} onSearchChange={() => {}} placeholder="Cari invoice..." />
                </div>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/baris</option>)}
                </select>
                <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setPage(1) }} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {monthOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
            </CardContent>
          </Card>

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
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={16} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                  ) : records.length === 0 ? (
                    <tr><td colSpan={16} className="p-8 text-center text-muted-foreground">Tidak ada invoice</td></tr>
                  ) : records.map(record => {
                    // SUSPENDED when service_status=suspended (by cron) OR when invoice is overdue
                    const today = new Date(); today.setHours(0, 0, 0, 0)
                    const dueDate = new Date(record.due_date); dueDate.setHours(0, 0, 0, 0)
                    let effectiveStatus = record.status
                    if (record.service_status === 'suspended') {
                      effectiveStatus = 'suspended'
                    } else if ((record.status === 'unpaid' || record.status === 'sent') && record.due_date && dueDate < today) {
                      effectiveStatus = 'suspended'
                    }
                    const sc = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.unpaid
                    const isSent = record.sent_at != null
                    return (
                      <tr key={record.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => { setSelectedRecord(record); setShowDetail(true) }}>
                        <td className="p-3"><input type="checkbox" checked={selectedIds.has(record.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(record.id)} /></td>
                        <td className="p-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>{sc.label}</span></td>
                        <td className="p-3"><p className="font-medium">{record.invoice_number}</p></td>
                        <td className="p-3"><p className="font-mono text-xs">{record.service_number || '-'}</p></td>
                        <td className="p-3"><p className="font-medium text-sm">{record.customer_name}</p><p className="text-xs text-muted-foreground">{record.customer_phone}</p></td>
                        <td className="p-3">{record.package_name || '-'}</td>
                        <td className="p-3 text-xs">{record.mitra || record.area || '-'}</td>
                        <td className="p-3"><span className="text-xs bg-muted px-1.5 py-0.5 rounded">{record.kategori || 'OTOMATIS'}</span></td>
                        <td className="p-3 text-xs">{formatDate(record.created_at)}</td>
                        <td className={`p-3 text-xs ${effectiveStatus === 'suspended' ? 'text-red-500 font-medium' : ''}`}>{formatDate(record.due_date)}</td>
                        <td className="p-3 text-right font-mono text-xs">{formatCurrency(record.amount)}</td>
                       <td className="p-3 text-right text-xs text-green-600">{record.diskon > 0 ? formatCurrency(record.diskon) : '0'}</td>
                       <td className="p-3 text-right font-mono text-xs text-blue-600">{record.unique_code != null ? String(record.unique_code).padStart(3, '0') : '-'}</td>
                        <td className="p-3 text-right font-medium text-xs">{formatCurrency(record.payment_source === 'autopay' ? (record.amount_with_code || record.total || record.amount) : (record.payment_source === 'tripay' ? ((record.total || record.amount) + (record.adm || 0)) : (record.total || record.amount)))}</td>
                        <td className="p-3 text-xs max-w-[100px] truncate" title={record.notes || ''}>{record.notes?.slice(0, 25) || '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages || 1} ({total} total)</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
          </Card>
        </>
      )}

      {/* PAID TAB */}
      {activeTab === 'paid' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">PENDAPATAN</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(parseFloat(String(paidStats.total_revenue)) || 0)}</div>
                <p className="text-xs text-muted-foreground">{paidTotal} invoice lunas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">BIAYA ADMIN</CardTitle>
                <ChevronLeft className="h-4 w-4 text-orange-500 rotate-90" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{formatCurrency(parseFloat(String(paidStats.total_fee)) || 0)}</div>
                <p className="text-xs text-muted-foreground">Biaya gateway</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">PENDAPATAN BERSIH</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(parseFloat(String(paidStats.net_revenue)) || 0)}</div>
                <p className="text-xs text-muted-foreground">Setelah biaya admin</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* Row 1: Action buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />PRINT</Button>
                <Button size="sm" variant="outline"><Send className="h-4 w-4 mr-1" />NOTIF WA</Button>
                <Button size="sm" variant="outline" onClick={handlePaidExport}><Download className="h-4 w-4 mr-1" />EXPORT</Button>
                <Button size="sm" variant="outline" onClick={() => setShowRekapHarian(true)}><Download className="h-4 w-4 mr-1" />REKAP HARIAN</Button>
                <Button size="sm" variant="outline" onClick={() => setShowRekapBulanan(true)}><Download className="h-4 w-4 mr-1" />REKAP BULANAN</Button>
                <Button size="sm" variant="outline" onClick={handleRollback} disabled={paidSelectedIds.size === 0}><RotateCcw className="h-4 w-4 mr-1" />RollBack</Button>
              </div>
              {/* Row 2: Search + filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <SearchBar onSearch={(q: string) => { setPaidSearch(q); setPaidPage(1) }} onSearchChange={() => {}} placeholder="Cari invoice lunas..." />
                </div>
                <select value={paidPageSize} onChange={(e) => { setPaidPageSize(Number(e.target.value)); setPaidPage(1) }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/baris</option>)}
                </select>
                <select value={paidMonth} onChange={(e) => { setPaidMonth(e.target.value); setPaidPage(1) }} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {monthOptions.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 w-8"><input type="checkbox" onChange={togglePaidSelectAll} checked={paidSelectedIds.size === paidRecords.length && paidRecords.length > 0} /></th>
                    <th className="text-left p-3 font-medium">STATUS</th>
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
                  </tr>
                </thead>
                <tbody>
                  {paidLoading ? (
                    <tr><td colSpan={18} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                  ) : paidRecords.length === 0 ? (
                    <tr><td colSpan={18} className="p-8 text-center text-muted-foreground">Tidak ada invoice lunas</td></tr>
                  ) : paidRecords.map(record => (
                    <tr key={record.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => { setSelectedRecord(record); setShowDetail(true) }}>
                      <td className="p-3"><input type="checkbox" checked={paidSelectedIds.has(record.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePaidSelect(record.id)} /></td>
                      <td className="p-3"><span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-green-500/10 text-green-600 border-green-500/30">{record.status === 'cancelled' ? 'CANCELLED' : 'PAID'}</span></td>
                      <td className="p-3"><p className="font-medium">{record.invoice_number}</p><p className="text-xs text-muted-foreground">{formatDate(record.created_at)}</p></td>
                      <td className="p-3"><p className="font-mono text-xs">{record.service_number || '-'}</p></td>
                      <td className="p-3"><p className="font-medium text-sm">{record.customer_name}</p><p className="text-xs text-muted-foreground">{record.customer_phone}</p></td>
                      <td className="p-3">{record.package_name || '-'}</td>
                      <td className="p-3 text-xs">{record.mitra || record.area || '-'}</td>
                      <td className="p-3"><span className="text-xs bg-muted px-1.5 py-0.5 rounded">{record.kategori || 'OTOMATIS'}</span></td>
                      <td className="p-3 text-xs">{formatDateTime(record.paid_at)}</td>
                      <td className="p-3 text-xs">{record.processed_by || '-'}</td>
                      <td className="p-3 text-xs">{record.cabar || (record.payment_source === 'tripay' ? 'TRIPAY' : record.payment_source === 'autopay' ? 'AUTOPAY' : 'TRANSFER')}</td>
                      <td className="p-3 text-xs">{record.payment_method_display || record.payment_method || '-'}</td>
                      <td className="p-3 text-right font-mono text-xs">{formatCurrency(record.amount)}</td>
                      <td className="p-3 text-right text-xs text-green-600">{record.diskon > 0 ? formatCurrency(record.diskon) : '0'}</td>
                       <td className="p-3 text-right text-xs">{formatCurrency(record.adm || record.payment_fee_amount || 0)}</td>
                       <td className="p-3 text-right font-mono text-xs text-blue-600">{record.payment_source === 'autopay' ? String(record.unique_code || 0).padStart(3, '0') : '-'}</td>
                       <td className="p-3 text-right font-medium text-xs">{formatCurrency(record.payment_source === 'autopay' ? (record.amount_with_code || record.total || record.amount) : (record.payment_source === 'tripay' ? ((record.total || record.amount) + (record.adm || 0)) : (record.total || record.amount)))}</td>
                       <td className="p-3 text-xs max-w-[100px] truncate" title={record.notes || ''}>{record.notes?.slice(0, 25) || '-'}</td>
                     </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">Page {paidPage} of {paidTotalPages || 1} ({paidTotal} total)</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setPaidPage(p => Math.max(1, p - 1))} disabled={paidPage <= 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setPaidPage(p => Math.min(paidTotalPages, p + 1))} disabled={paidPage >= paidTotalPages}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
          </Card>
        </>
      )}

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
                <div className="flex justify-between font-bold"><span>Jumlah:</span><span>{formatCurrency(payForm.amount)}</span></div>
              </div>
              <div><label className="text-sm font-medium">Metode Bayar</label>
                <select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
                  <option value="">-- Pilih --</option>
                  <option value="cash">TUNAI</option>
                  {paymentMethodOptions.filter(m => m.value !== 'cash').map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div><label className="text-sm font-medium">Tgl Bayar</label><Input type="datetime-local" value={payForm.payment_date?.substring(0, 16) || ''} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value ? e.target.value + ':00' : '' })} className="mt-1" /></div>
              <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setShowPayModal(false)}>Batal</Button><Button className="flex-1" onClick={handlePay} disabled={paying || !payForm.payment_method}>{paying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}BAYAR</Button></div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDetail(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0 sticky top-0 bg-card">
              <h2 className="text-lg font-semibold">Detail Invoice</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowDetail(false)}><span className="text-xl">&times;</span></Button>
            </div>
            <div className="p-6 space-y-2 text-sm">
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice:</span><span className="font-medium">{selectedRecord.invoice_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status:</span><span className="font-medium">{selectedRecord.status?.toUpperCase() || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Kategori:</span><span>{selectedRecord.kategori || 'OTOMATIS'}</span></div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">No. Layanan:</span><span className="font-mono text-xs">{selectedRecord.service_number || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pelanggan:</span><span>{selectedRecord.customer_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Telepon:</span><span>{selectedRecord.customer_phone || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Profile:</span><span>{selectedRecord.package_name || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Mitra:</span><span>{selectedRecord.mitra || selectedRecord.area || '-'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Area:</span><span>{selectedRecord.region_name || selectedRecord.area || '-'}</span></div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Tgl Terbit:</span><span>{formatDate(selectedRecord.created_at)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Jatuh Tempo:</span><span className={(() => { const d = new Date(selectedRecord.due_date); d.setHours(0,0,0,0); const t = new Date(); t.setHours(0,0,0,0); return selectedRecord.due_date && d < t ? 'text-red-500 font-medium' : '' })()}>{formatDate(selectedRecord.due_date)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal:</span><span className="font-mono">{formatCurrency(selectedRecord.amount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Diskon:</span><span className={selectedRecord.diskon > 0 ? 'text-green-600' : ''}>{selectedRecord.diskon > 0 ? formatCurrency(selectedRecord.diskon) : '0'}</span></div>
                <div className="flex justify-between">{selectedRecord.diskon > 0 && <><span className="text-muted-foreground">Diskon:</span><span className="text-green-600">{formatCurrency(selectedRecord.diskon)}</span></>}</div>
                <div className="flex justify-between font-bold"><span>Total:</span><span className="font-mono">{formatCurrency(selectedRecord.payment_source === 'autopay' ? (selectedRecord.amount_with_code || selectedRecord.total || selectedRecord.amount) : (selectedRecord.total || selectedRecord.amount))}</span></div>
                {selectedRecord.payment_source === 'autopay' && selectedRecord.unique_code != null && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Kode Unik:</span><span className="font-mono text-blue-600">{String(selectedRecord.unique_code).padStart(3, '0')}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Transfer:</span><span className="font-mono font-bold">{formatCurrency(selectedRecord.payment_source === 'autopay' ? (selectedRecord.amount_with_code || selectedRecord.total || selectedRecord.amount) : selectedRecord.amount)}</span></div>
                  </>
                )}
              </div>
              {selectedRecord.status === 'paid' && (
                <div className="bg-green-500/5 rounded-lg p-3 space-y-1.5 border border-green-500/20">
                  <div className="flex justify-between"><span className="text-muted-foreground">Tgl Bayar:</span><span className="text-green-600">{formatDateTime(selectedRecord.paid_at)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Channel:</span><span>{selectedRecord.payment_method_display || selectedRecord.payment_method || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">CABAR:</span><span>{selectedRecord.cabar || (selectedRecord.payment_source === 'tripay' ? 'TRIPAY' : selectedRecord.payment_source === 'autopay' ? 'AUTOPAY' : 'TRANSFER')}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Admin:</span><span>{selectedRecord.processed_by || '-'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Biaya Admin:</span><span>{formatCurrency(selectedRecord.adm || selectedRecord.payment_fee_amount || 0)}</span></div>
                </div>
              )}
              {selectedRecord.notes && (
                <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Note:</span><span>{selectedRecord.notes}</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rekap Harian Modal */}
      {showRekapHarian && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRekapHarian(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0"><h2 className="text-lg font-semibold">Rekap Harian</h2><Button variant="ghost" size="icon" onClick={() => setShowRekapHarian(false)}><span className="text-xl">&times;</span></Button></div>
            <div className="p-6 space-y-4">
              <div><label className="text-sm font-medium">Tanggal Mulai</label><Input type="date" value={rekapHarianRange.start} onChange={(e) => setRekapHarianRange({...rekapHarianRange, start: e.target.value})} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Tanggal Akhir (max 30 hari)</label><Input type="date" value={rekapHarianRange.end} onChange={(e) => setRekapHarianRange({...rekapHarianRange, end: e.target.value})} className="mt-1" /></div>
              <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setShowRekapHarian(false)}>Batal</Button><Button className="flex-1" onClick={handleRekapHarian}>CETAK PDF</Button></div>
            </div>
          </div>
        </div>
      )}

      {/* Rekap Bulanan Modal */}
      {showRekapBulanan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRekapBulanan(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0"><h2 className="text-lg font-semibold">Rekap Bulanan</h2><Button variant="ghost" size="icon" onClick={() => setShowRekapBulanan(false)}><span className="text-xl">&times;</span></Button></div>
            <div className="p-6 space-y-4">
              <div><label className="text-sm font-medium">Bulan Mulai</label><Input type="month" value={rekapBulananRange.startMonth} onChange={(e) => setRekapBulananRange({...rekapBulananRange, startMonth: e.target.value})} className="mt-1" /></div>
              <div><label className="text-sm font-medium">Bulan Akhir</label><Input type="month" value={rekapBulananRange.endMonth} onChange={(e) => setRekapBulananRange({...rekapBulananRange, endMonth: e.target.value})} className="mt-1" /></div>
              <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setShowRekapBulanan(false)}>Batal</Button><Button className="flex-1" onClick={handleRekapBulanan}>CETAK PDF</Button></div>
            </div>
          </div>
        </div>
      )}
      <RapelModal isOpen={showRapel} onClose={() => setShowRapel(false)} onSuccess={fetchUnpaid} />

      {/* Diskon Modal */}
      {showDiskon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDiskon(false)}>
          <div className="bg-card border rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-0 sticky top-0 bg-card"><h2 className="text-lg font-semibold">Terapkan Diskon</h2><Button variant="ghost" size="icon" onClick={() => setShowDiskon(false)}><span className="text-xl">&times;</span></Button></div>
            <div className="p-6 space-y-3">
              {discounts.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p>Tidak ada diskon aktif</p>
                  <p className="text-xs">Buat diskon di halaman Diskon & Referral</p>
                </div>
              ) : (
                discounts.map((d: any) => (
                  <div key={d.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{d.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.discount_type === 'percentage' ? `${d.discount_value}%` : `Rp ${d.discount_value?.toLocaleString('id-ID')}`}
                          {d.max_discount_amount > 0 ? ` (max Rp ${d.max_discount_amount?.toLocaleString('id-ID')})` : ''}
                          {' · '}{d.target_type === 'all' ? 'Semua pelanggan' : d.target_type === 'area' ? 'Area' : d.target_type === 'package' ? 'Paket' : 'Pelanggan'}
                        </p>
                        {d.start_date && d.end_date && (
                          <p className="text-xs text-muted-foreground">{formatDate(d.start_date)} - {formatDate(d.end_date)}</p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => handleApplyDiskon(d.id)} disabled={applyingDiskon}>
                        {applyingDiskon ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Terapkan'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <div className="pt-2 border-t text-xs text-muted-foreground">
                <p>Diskon akan diterapkan ke semua invoice yang sesuai kriteria. Kelola diskon di halaman <a href="/admin/discounts-referrals" className="text-primary underline">Diskon & Referral</a>.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
