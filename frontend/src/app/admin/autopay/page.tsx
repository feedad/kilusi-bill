'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'react-hot-toast'
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Smartphone,
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  FileText,
  ShieldCheck,
  Ban,
  Check,
  X,
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import { CONFIG } from '@/lib/config'

interface Mutation {
  id: number
  bank_id: number | null
  amount: number
  type: string
  source_type: string
  description: string
  sender_info: string
  raw_content: string
  status: 'PENDING' | 'MATCHED' | 'IGNORED' | 'FAILED'
  matched_invoice_id: number | null
  matched_at: string | null
  created_at: string
  invoice_number?: string
  customer_id?: string
  customer_name?: string
  customer_phone?: string
}

interface Device {
  id: number
  device_name: string
  api_key: string
  created_at: string
}

interface UnpaidInvoice {
  id: number
  invoice_number: string
  amount: number
  total_amount: number
  unique_code: number | null
  amount_with_code: number | null
  due_date: string
  status: string
  customer_name: string
  customer_phone: string
}

interface AutopayStats {
  todayCount: number
  todayAmount: number
  todayMatchedCount: number
  todayMatchedAmount: number
  pendingCount: number
  pendingAmount: number
  activeDevicesCount: number
}
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'response' in error) {
    const res = error.response
    if (res && typeof res === 'object' && 'data' in res) {
      const data = res.data
      if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
        return data.message
      }
    }
  }
  return 'Terjadi kesalahan sistem'
}

export default function AutopayPage() {
  const [mutations, setMutations] = useState<Mutation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [stats, setStats] = useState<AutopayStats>({
    todayCount: 0,
    todayAmount: 0,
    todayMatchedCount: 0,
    todayMatchedAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    activeDevicesCount: 0,
  })

  // Devices modal state
  const [showDeviceModal, setShowDeviceModal] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [newDeviceName, setNewDeviceName] = useState('')
  const [creatingDevice, setCreatingDevice] = useState(false)

  // Manual Match modal state
  const [selectedMutation, setSelectedMutation] = useState<Mutation | null>(null)
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([])
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('')
  const [searchingInvoices, setSearchingInvoices] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [matchingAction, setMatchingAction] = useState(false)

  // Detail / Raw Content modal state
  const [rawModalMutation, setRawModalMutation] = useState<Mutation | null>(null)

  const fetchMutations = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        status: statusFilter,
      })
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim())
      }

      const res = await adminApi.get(`/api/v1/autopay/mutations?${params.toString()}`)
      if (res.data.success) {
        setMutations(res.data.data.mutations || [])
        setTotalPages(res.data.data.pagination?.totalPages || 1)
        setTotalCount(res.data.data.pagination?.total || 0)
        if (res.data.data.stats) {
          setStats(res.data.data.stats)
        }
      }
    } catch (err: unknown) {
      toast.error('Gagal memuat data mutasi: ' + getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, searchTerm])

  useEffect(() => {
    fetchMutations()
  }, [fetchMutations])

  // Fetch Devices
  const fetchDevices = async () => {
    try {
      const res = await adminApi.get('/api/v1/autopay/devices')
      if (res.data.success) {
        setDevices(res.data.data || [])
      }
    } catch (err: unknown) {
      toast.error('Gagal memuat daftar perangkat: ' + getErrorMessage(err))
    }
  }

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDeviceName.trim()) return

    try {
      setCreatingDevice(true)
      const res = await adminApi.post('/api/v1/autopay/devices', {
        device_name: newDeviceName.trim(),
      })
      if (res.data.success) {
        toast.success('Perangkat berhasil didaftarkan!')
        setNewDeviceName('')
        fetchDevices()
        fetchMutations()
      }
    } catch (err: unknown) {
      toast.error('Gagal menambahkan perangkat: ' + getErrorMessage(err))
    } finally {
      setCreatingDevice(false)
    }
  }

  const handleDeleteDevice = async (id: number) => {
    if (!confirm('Yakin ingin menghapus perangkat ini? API key akan dinonaktifkan.')) return

    try {
      const res = await adminApi.delete(`/api/v1/autopay/devices/${id}`)
      if (res.data.success) {
        toast.success('Perangkat dihapus')
        fetchDevices()
        fetchMutations()
      }
    } catch (err: unknown) {
      toast.error('Gagal menghapus perangkat: ' + getErrorMessage(err))
    }
  }

  // Search unpaid invoices for manual match
  const searchUnpaidInvoices = async (queryStr: string) => {
    try {
      setSearchingInvoices(true)
      const res = await adminApi.get(`/api/v1/autopay/unpaid-invoices?q=${encodeURIComponent(queryStr)}`)
      if (res.data.success) {
        setUnpaidInvoices(res.data.data || [])
      }
    } catch (err: unknown) {
      toast.error('Gagal mencari tagihan: ' + getErrorMessage(err))
    } finally {
      setSearchingInvoices(false)
    }
  }

  const openManualMatch = (mutation: Mutation) => {
    setSelectedMutation(mutation)
    setSelectedInvoiceId(null)
    setInvoiceSearchQuery(String(Math.round(mutation.amount)))
    searchUnpaidInvoices(String(Math.round(mutation.amount)))
  }

  const handleExecuteManualMatch = async () => {
    if (!selectedMutation || !selectedInvoiceId) {
      toast.error('Pilih tagihan tujuan terlebih dahulu')
      return
    }

    try {
      setMatchingAction(true)
      const res = await adminApi.post(`/api/v1/autopay/mutations/${selectedMutation.id}/match`, {
        invoice_id: selectedInvoiceId,
      })
      if (res.data.success) {
        toast.success('Tagihan berhasil dilunaskan via Autopay!')
        setSelectedMutation(null)
        setSelectedInvoiceId(null)
        fetchMutations()
      }
    } catch (err: unknown) {
      toast.error('Gagal mencocokkan tagihan: ' + getErrorMessage(err))
    } finally {
      setMatchingAction(false)
    }
  }

  const handleIgnoreMutation = async (id: number) => {
    if (!confirm('Abaikan mutasi ini? Mutasi tidak akan dicocokkan otomatis.')) return

    try {
      const res = await adminApi.post(`/api/v1/autopay/mutations/${id}/ignore`)
      if (res.data.success) {
        toast.success('Mutasi diabaikan')
        fetchMutations()
      }
    } catch (err: unknown) {
      toast.error('Gagal mengabaikan mutasi: ' + getErrorMessage(err))
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} disalin ke clipboard!`)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const d = new Date(dateString)
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatCurrency = (val: number) => {
    return 'Rp ' + Math.round(Number(val) || 0).toLocaleString('id-ID')
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Autopay & Mutasi Bank</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pencocokan pembayaran otomatis realtime via notifikasi HP dan Cloudflare Email Worker
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowDeviceModal(true)
              fetchDevices()
            }}
            className="flex items-center space-x-2"
          >
            <Smartphone className="h-4 w-4" />
            <span>Kelola Perangkat ({stats.activeDevicesCount})</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMutations()}
            disabled={loading}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${statusFilter === 'ALL' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => {
            setStatusFilter('ALL')
            setPage(1)
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mutasi Hari Ini</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.todayAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.todayCount} transaksi masuk</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${statusFilter === 'MATCHED' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => {
            setStatusFilter('MATCHED')
            setPage(1)
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Otomatis Lunas</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats.todayMatchedAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stats.todayMatchedCount} invoice terlunasi</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors hover:bg-muted/50 ${statusFilter === 'PENDING' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => {
            setStatusFilter('PENDING')
            setPage(1)
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Menunggu Tindakan</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {formatCurrency(stats.pendingAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{stats.pendingCount} mutasi belum cocok</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50"
          onClick={() => {
            setShowDeviceModal(true)
            fetchDevices()
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Perangkat Aktif</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeDevicesCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Perangkat penerima terhubung</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Status Filter Tabs */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'ALL', label: 'Semua' },
                { id: 'PENDING', label: `Menunggu (${stats.pendingCount})` },
                { id: 'MATCHED', label: 'Berhasil Cocok' },
                { id: 'IGNORED', label: 'Diabaikan' },
              ].map((tab) => (
                <Button
                  key={tab.id}
                  variant={statusFilter === tab.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setStatusFilter(tab.id)
                    setPage(1)
                  }}
                  className="h-8 text-xs"
                >
                  {tab.label}
                </Button>
              ))}
            </div>

            {/* Search Box */}
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari pengirim, bank, nominal..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
                className="pl-8 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase border-b">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Bank / Sumber</th>
                  <th className="py-3 px-4">Pengirim / Keterangan</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Tagihan Terlunasi</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && mutations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                      Memuat daftar mutasi bank...
                    </td>
                  </tr>
                ) : mutations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">
                      Tidak ada mutasi yang sesuai filter
                    </td>
                  </tr>
                ) : (
                  mutations.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                      {/* Waktu */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(m.created_at)}
                      </td>

                      {/* Bank / Sumber */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                            {m.source_type}
                          </Badge>
                          <span className="font-semibold">{m.sender_info || 'Bank'}</span>
                        </div>
                      </td>

                      {/* Pengirim / Keterangan */}
                      <td className="py-3 px-4 max-w-xs md:max-w-md">
                        <p className="line-clamp-2 text-xs text-foreground/90 font-mono">
                          {m.description || '-'}
                        </p>
                      </td>

                      {/* Nominal */}
                      <td className="py-3 px-4 whitespace-nowrap text-right font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(m.amount)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        {m.status === 'MATCHED' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300">
                            MATCHED
                          </Badge>
                        ) : m.status === 'PENDING' ? (
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300">
                            PENDING
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-gray-500">
                            {m.status}
                          </Badge>
                        )}
                      </td>

                      {/* Tagihan Terlunasi */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {m.status === 'MATCHED' && m.invoice_number ? (
                          <div className="text-xs">
                            <span className="font-semibold text-primary">{m.invoice_number}</span>
                            {m.customer_name && (
                              <p className="text-[11px] text-muted-foreground">{m.customer_name}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {m.status === 'PENDING' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5"
                                onClick={() => openManualMatch(m)}
                              >
                                Cocokkan
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground hover:text-destructive px-2"
                                onClick={() => handleIgnoreMutation(m.id)}
                                title="Abaikan"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground px-2"
                            onClick={() => setRawModalMutation(m)}
                            title="Lihat Raw Payload"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
              <span>
                Menampilkan {mutations.length} dari {totalCount} mutasi
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2"
                >
                  Sebelumnya
                </Button>
                <span className="px-2 font-medium">
                  Halaman {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 px-2"
                >
                  Selanjutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: MANUAL MATCHING */}
      <Dialog
        open={!!selectedMutation}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMutation(null)
            setSelectedInvoiceId(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              Pencocokan Manual Tagihan
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Pilih tagihan yang belum lunas untuk dilunaskan oleh mutasi ini
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Selected Mutation Info Box */}
            {selectedMutation && (
              <div className="bg-muted/40 p-3 rounded-lg border space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Sumber / Bank:</span>
                  <span className="font-semibold">{selectedMutation.sender_info}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Nominal Transfer:</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatCurrency(selectedMutation.amount)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Waktu Masuk:</span>
                  <span>{formatDate(selectedMutation.created_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Berita:</span>
                  <p className="font-mono text-[11px] mt-0.5 text-foreground/80 break-words">
                    {selectedMutation.description}
                  </p>
                </div>
              </div>
            )}

            {/* Invoice Search Input */}
            <div>
              <label className="text-xs font-semibold block mb-1">
                Cari Tagihan Belum Lunas (Nama / No Invoice / Nominal)
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ketik nama pelanggan, no invoice, atau nominal..."
                  value={invoiceSearchQuery}
                  onChange={(e) => {
                    setInvoiceSearchQuery(e.target.value)
                    searchUnpaidInvoices(e.target.value)
                  }}
                  className="pl-8 text-sm"
                />
              </div>
            </div>

            {/* Invoice Search Results */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {searchingInvoices ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1 text-primary" />
                  Mencari tagihan...
                </div>
              ) : unpaidInvoices.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground border rounded-md">
                  Tidak ditemukan tagihan belum lunas dengan kata kunci tersebut.
                </div>
              ) : (
                unpaidInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInvoiceId(inv.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                      selectedInvoiceId === inv.id
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border hover:bg-muted/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{inv.invoice_number}</span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {inv.status}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-foreground/90 mt-0.5">
                        {inv.customer_name} ({inv.customer_phone})
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Jatuh tempo: {inv.due_date ? new Date(inv.due_date).toLocaleDateString('id-ID') : '-'}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-foreground">
                        {formatCurrency(inv.amount_with_code || inv.total_amount || inv.amount)}
                      </div>
                      {inv.unique_code && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Kode: +{inv.unique_code}
                        </span>
                      )}
                      {selectedInvoiceId === inv.id && (
                        <div className="mt-1 flex items-center justify-end text-xs text-primary font-semibold gap-1">
                          <Check className="h-3.5 w-3.5" /> Dipilih
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="p-4 border-t flex items-center justify-end gap-2 bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedMutation(null)
                setSelectedInvoiceId(null)
              }}
              disabled={matchingAction}
            >
              Batal
            </Button>
            <Button
              variant="default"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleExecuteManualMatch}
              disabled={!selectedInvoiceId || matchingAction}
            >
              {matchingAction ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-1.5" /> Memproses...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-1.5" /> Lunaskan Tagihan Ini
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: DEVICE MANAGEMENT */}
      <Dialog open={showDeviceModal} onOpenChange={setShowDeviceModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Kelola Perangkat Inbound (Tasker / MacroDroid)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Daftar API key perangkat yang diizinkan mengirim webhook notifikasi mutasi
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* Endpoint URLs Card */}
            <div className="bg-muted/40 p-3 rounded-lg border text-xs space-y-2">
              <span className="font-semibold block text-foreground">URL Endpoint Inbound HP:</span>
              <div className="flex items-center justify-between gap-2 bg-background p-2 rounded border font-mono text-[11px]">
                <span className="truncate">https://autopay.kilusi.id/api/v1/mobile/inbound</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    copyToClipboard(
                      'https://autopay.kilusi.id/api/v1/mobile/inbound',
                      'URL Inbound'
                    )
                  }
                >
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Gunakan header <code className="text-primary font-mono">X-API-Key: &lt;API_KEY&gt;</code> dan method <code className="text-primary font-mono">POST</code> dengan JSON body notifikasi.
              </p>
            </div>

            {/* Add Device Form */}
            <form onSubmit={handleCreateDevice} className="flex gap-2">
              <Input
                placeholder="Nama Perangkat Baru (misal: HP Tasker Toko, Cloudflare Worker)..."
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                className="text-sm flex-1"
              />
              <Button type="submit" disabled={creatingDevice || !newDeviceName.trim()} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Tambah
              </Button>
            </form>

            {/* Devices List */}
            <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
              {devices.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Belum ada perangkat terdaftar. Tambahkan perangkat pertama di atas.
                </div>
              ) : (
                devices.map((dev) => (
                  <div key={dev.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-sm text-foreground">{dev.device_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="bg-muted px-2 py-0.5 rounded font-mono text-[11px] text-primary">
                          {dev.api_key}
                        </code>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(dev.api_key, 'API Key')}
                          className="text-muted-foreground hover:text-foreground"
                          title="Salin API Key"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="text-[10px] text-muted-foreground block mt-1">
                        Dibuat: {formatDate(dev.created_at)}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 h-8 px-2"
                      onClick={() => handleDeleteDevice(dev.id)}
                      title="Hapus Device"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="p-4 border-t flex justify-end bg-muted/20">
            <Button size="sm" variant="outline" onClick={() => setShowDeviceModal(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: RAW PAYLOAD DETAIL */}
      <Dialog
        open={!!rawModalMutation}
        onOpenChange={(open) => {
          if (!open) setRawModalMutation(null)
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Raw Payload Mutasi #{rawModalMutation?.id}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 overflow-y-auto flex-1 font-mono text-xs">
            <pre className="bg-muted p-3 rounded-md whitespace-pre-wrap break-all text-[11px]">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(rawModalMutation?.raw_content || '{}'), null, 2)
                } catch {
                  return rawModalMutation?.raw_content || 'Kosong'
                }
              })()}
            </pre>
          </div>

          <DialogFooter className="p-3 border-t flex justify-end bg-muted/20">
            <Button size="sm" variant="outline" onClick={() => setRawModalMutation(null)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
