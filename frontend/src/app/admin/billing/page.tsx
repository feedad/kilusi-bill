'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CreditCard,
  Search,
  Plus,
  Download,
  Filter,
  Eye,
  Edit,
  Trash2,
  Send,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Clock,
  X,
  Loader2,
  Wallet,
  FileText,
  CreditCard as CreditCardIcon,
  Mail,
  Printer,
  File,
  Reply,
  Bell,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'

interface BillingRecord {
  id: string
  invoice_number: string
  customer_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  package_name: string
  amount: number
  due_date: string
  status: 'draft' | 'sent' | 'paid' | 'unpaid' | 'overdue' | 'cancelled'
  paid_at: string | null
  payment_method: string | null
  description: string
  created_at: string
  payments?: Payment[]
}

interface Payment {
  id: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string
  created_at: string
}

interface PaymentFormData {
  invoice_id: string
  amount: number
  payment_method: string
  payment_date: string
  notes: string
}

interface BillingStats {
  draftCount: number
  sentCount: number
  paidCount: number
  unpaidCount: number
  overdueCount: number
  cancelledCount: number
  totalRevenue: number
  pendingRevenue: number
}

export default function IntegratedBillingPage() {
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([])
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'sent' | 'paid' | 'unpaid' | 'overdue' | 'cancelled'>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    invoice_id: '',
    amount: 0,
    payment_method: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: ''
  })
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  // Separate records by status
  const draftRecords = billingRecords.filter(record => record.status === 'draft')
  const sentRecords = billingRecords.filter(record => record.status === 'sent')
  const paidRecords = billingRecords.filter(record => record.status === 'paid')
  const unpaidRecords = billingRecords.filter(record => record.status === 'unpaid')
  const overdueRecords = billingRecords.filter(record => record.status === 'overdue')
  const cancelledRecords = billingRecords.filter(record => record.status === 'cancelled')

  const activeRecords = activeTab === 'all' ? billingRecords :
                      activeTab === 'draft' ? draftRecords :
                      activeTab === 'sent' ? sentRecords :
                      activeTab === 'paid' ? paidRecords :
                      activeTab === 'unpaid' ? unpaidRecords :
                      activeTab === 'overdue' ? overdueRecords :
                      activeTab === 'cancelled' ? cancelledRecords :
                      billingRecords

  useEffect(() => {
    fetchBillingRecords()
  }, [currentPage, searchQuery, filterStatus])

  const fetchBillingRecords = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching billing records via API')

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })

      const response = await api.get(`${endpoints.billing.invoices}?${params}`)

      if (response.data.success) {
        const invoices = response.data.data.invoices || []
        setBillingRecords(invoices)

        // Calculate stats from invoice data
        setStats({
          draftCount: invoices.filter((r: any) => r.status === 'draft').length,
          sentCount: invoices.filter((r: any) => r.status === 'sent').length,
          paidCount: invoices.filter((r: any) => r.status === 'paid').length,
          unpaidCount: invoices.filter((r: any) => r.status === 'unpaid').length,
          overdueCount: invoices.filter((r: any) => r.status === 'overdue').length,
          cancelledCount: invoices.filter((r: any) => r.status === 'cancelled').length,
          totalRevenue: invoices.filter((r: any) => r.status === 'paid').reduce((sum: number, r: any) => sum + r.amount, 0),
          pendingRevenue: [...invoices.filter((r: any) => r.status === 'sent'), ...invoices.filter((r: any) => r.status === 'unpaid'), ...invoices.filter((r: any) => r.status === 'overdue')].reduce((sum: number, r: any) => sum + r.amount, 0),
        })
      }
    } catch (err: any) {
      console.error('Error fetching billing records:', err)
      setError(err.message || 'Failed to load billing records')
    } finally {
      setLoading(false)
    }
  }

  const handlePayment = async () => {
    if (!selectedRecord || !paymentForm.invoice_id) return

    try {
      setIsProcessingPayment(true)

      const response = await api.post(`${endpoints.billing.recordPayment}`, paymentForm)

      if (response.data.success) {
        // Reset form and close modal
        setPaymentForm({
          invoice_id: '',
          amount: 0,
          payment_method: '',
          payment_date: new Date().toISOString().split('T')[0],
          notes: ''
        })
        setShowPaymentModal(false)
        setSelectedRecord(null)

        // Refresh data
        await fetchBillingRecords()

        // Show success message
        alert('Pembayaran berhasil dicatat!')
      }
    } catch (err: any) {
      console.error('Error processing payment:', err)
      alert(err.response?.data?.message || 'Terjadi kesalahan saat memproses pembayaran')
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const handleSendInvoice = async () => {
    if (!selectedRecord) return

    try {
      setIsSending(true)

      // TODO: Implement API for sending invoice
      // const response = await api.post(`${endpoints.billing.sendInvoice}`, { invoice_id: selectedRecord.id })

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000))

      setShowSendModal(false)
      setSelectedRecord(null)
      await fetchBillingRecords()

      alert('Invoice berhasil dikirim!')
    } catch (err: any) {
      console.error('Error sending invoice:', err)
      alert('Terjadi kesalahan saat mengirim invoice')
    } finally {
      setIsSending(false)
    }
  }

  const openPaymentModal = (record: BillingRecord) => {
    if (record.status === 'paid') {
      alert('Invoice ini sudah dibayar')
      return
    }

    setSelectedRecord(record)
    setPaymentForm({
      invoice_id: record.id,
      amount: record.amount,
      payment_method: '',
      payment_date: new Date().toISOString().split('T')[0],
      notes: ''
    })
    setShowPaymentModal(true)
  }

  const openSendModal = (record: BillingRecord) => {
    if (record.status !== 'draft') {
      alert('Invoice sudah dikirim')
      return
    }

    setSelectedRecord(record)
    setShowSendModal(true)
  }

  const filteredRecords = activeRecords.filter((record) => {
    const matchesSearch = record.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         record.customer_phone.includes(searchQuery) ||
                         record.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         record.package_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' || record.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-success bg-success/10'
      case 'draft':
        return 'text-muted bg-muted'
      case 'sent':
        return 'text-info bg-info/10'
      case 'unpaid':
        return 'text-warning bg-warning/10'
      case 'overdue':
        return 'text-error bg-error/10'
      case 'cancelled':
        return 'text-muted bg-muted'
      default:
        return 'text-muted bg-muted'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Lunas'
      case 'draft':
        return 'Draft'
      case 'sent':
        return 'Terkirim'
      case 'unpaid':
        return 'Menunggu'
      case 'overdue':
        return 'Terlambat'
      case 'cancelled':
        return 'Dibatalkan'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return CheckCircle
      case 'draft':
        return FileText
      case 'sent':
        return Mail
      case 'unpaid':
        return Clock
      case 'overdue':
        return AlertCircle
      case 'cancelled':
        return TrendingDown
      default:
        return Clock
    }
  }

  const getActionButtons = (record: BillingRecord) => {
    const buttons = []

    // View button - always available
    buttons.push(
      <Button
        key="view"
        variant="ghost"
        size="icon"
        onClick={() => {
          setSelectedRecord(record)
          setShowDetailModal(true)
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>
    )

    // Status-specific buttons
    switch (record.status) {
      case 'draft':
        buttons.push(
          <Button
            key="send"
            variant="ghost"
            size="icon"
            className="text-info hover:text-info"
            onClick={() => openSendModal(record)}
            title="Kirim Invoice"
          >
            <Send className="h-4 w-4" />
          </Button>,
          <Button
            key="edit"
            variant="ghost"
            size="icon"
            className="text-warning hover:text-warning"
            title="Edit Invoice"
          >
            <Edit className="h-4 w-4" />
          </Button>,
          <Button
            key="delete"
            variant="ghost"
            size="icon"
            className="text-error hover:text-error"
            title="Hapus Invoice"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )
        break

      case 'sent':
      case 'unpaid':
      case 'overdue':
        buttons.push(
          <Button
            key="pay"
            variant="ghost"
            size="icon"
            className="text-success hover:text-success"
            onClick={() => openPaymentModal(record)}
            title="Proses Pembayaran"
          >
            <Wallet className="h-4 w-4" />
          </Button>,
          <Button
            key="remind"
            variant="ghost"
            size="icon"
            className="text-warning hover:text-warning"
            title="Kirim Pengingat"
          >
            <Bell className="h-4 w-4" />
          </Button>
        )
        break

      case 'paid':
        buttons.push(
          <Button
            key="receipt"
            variant="ghost"
            size="icon"
            className="text-info hover:text-info"
            title="Cetak Receipt"
          >
            <Printer className="h-4 w-4" />
          </Button>
        )
        break
    }

    return buttons
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Billing & Invoice</h1>
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Billing & Invoice</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading billing records</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchBillingRecords}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing & Invoice</h1>
          <p className="text-sm text-muted-foreground">Kelola invoice dan pembayaran dalam satu dashboard</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            Buat Invoice
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Draft</CardTitle>
              <FileText className="h-4 w-4 text-muted" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-muted">{stats.draftCount}</div>
              <p className="text-xs text-muted-foreground">Belum dikirim</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Terkirim</CardTitle>
              <Send className="h-4 w-4 text-info" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-info">{stats.sentCount}</div>
              <p className="text-xs text-muted-foreground">Menunggu pembayaran</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Menunggu</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-warning">{stats.unpaidCount}</div>
              <p className="text-xs text-muted-foreground">Belum dibayar</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Terlambat</CardTitle>
              <AlertCircle className="h-4 w-4 text-error" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-error">{stats.overdueCount}</div>
              <p className="text-xs text-muted-foreground">Perlu ditagih</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Lunas</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-success">{stats.paidCount}</div>
              <p className="text-xs text-muted-foreground">Pembayaran berhasil</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Pendapatan</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Bulan ini</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Revenue Summary */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-foreground">Ringkasan Pendapatan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pendapatan Tercatat</span>
                  <span className="font-medium text-success">{formatCurrency(stats.totalRevenue)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Menunggu Pembayaran</span>
                  <span className="font-medium text-warning">{formatCurrency(stats.pendingRevenue)}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Total Potensial</span>
                    <span className="font-bold text-foreground">{formatCurrency(stats.totalRevenue + stats.pendingRevenue)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-foreground">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>Buat Invoice</span>
                </Button>
                <Button variant="outline" size="sm" className="flex items-center space-x-2">
                  <Bell className="h-4 w-4" />
                  <span>Reminder</span>
                </Button>
                <Button variant="outline" size="sm" className="flex items-center space-x-2">
                  <Wallet className="h-4 w-4" />
                  <span>Payment</span>
                </Button>
                <Button variant="outline" size="sm" className="flex items-center space-x-2">
                  <Download className="h-4 w-4" />
                  <span>Export</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari invoice atau pelanggan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">Semua Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Terkirim</option>
                <option value="unpaid">Menunggu</option>
                <option value="overdue">Terlambat</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Billing Records with Tabs */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Daftar Invoice & Pembayaran</CardTitle>
              <div className="text-sm text-muted-foreground">
                Total: {activeRecords.length} transaksi
              </div>
            </div>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="all" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Semua
                </TabsTrigger>
                <TabsTrigger value="draft" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted" />
                  Draft ({draftRecords.length})
                </TabsTrigger>
                <TabsTrigger value="sent" className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-info" />
                  Terkirim ({sentRecords.length})
                </TabsTrigger>
                <TabsTrigger value="unpaid" className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning" />
                  Menunggu ({unpaidRecords.length})
                </TabsTrigger>
                <TabsTrigger value="overdue" className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-error" />
                  Terlambat ({overdueRecords.length})
                </TabsTrigger>
                <TabsTrigger value="paid" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Lunas ({paidRecords.length})
                </TabsTrigger>
                <TabsTrigger value="cancelled" className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-muted" />
                  Batal ({cancelledRecords.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-foreground">Invoice</th>
                  <th className="text-left p-4 font-medium text-foreground">Pelanggan</th>
                  <th className="text-left p-4 font-medium text-foreground">Paket</th>
                  <th className="text-left p-4 font-medium text-foreground">Jumlah</th>
                  <th className="text-left p-4 font-medium text-foreground">Jatuh Tempo</th>
                  <th className="text-left p-4 font-medium text-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => {
                  const StatusIcon = getStatusIcon(record.status)
                  return (
                    <tr key={record.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{record.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(record.created_at).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{record.customer_name}</p>
                          <p className="text-sm text-muted-foreground">{record.customer_phone}</p>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-foreground">{record.package_name}</td>
                      <td className="p-4">
                        <p className="font-medium text-foreground">{formatCurrency(record.amount)}</p>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-sm text-foreground">{record.due_date}</p>
                          {record.paid_at && (
                            <p className="text-xs text-success">Dibayar {record.paid_at}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {getStatusText(record.status)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          {getActionButtons(record)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Detail Invoice</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDetailModal(false)}
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nomor Invoice</p>
                  <p className="font-medium text-foreground">{selectedRecord.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Dibuat</p>
                  <p className="font-medium text-foreground">{selectedRecord.created_at}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nama Pelanggan</p>
                  <p className="font-medium text-foreground">{selectedRecord.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{selectedRecord.customer_email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telepon</p>
                  <p className="font-medium text-foreground">{selectedRecord.customer_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedRecord.status)}`}>
                    {getStatusText(selectedRecord.status)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paket Layanan</p>
                  <p className="font-medium text-foreground">{selectedRecord.package_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jumlah Tagihan</p>
                  <p className="font-medium text-foreground">{formatCurrency(selectedRecord.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jatuh Tempo</p>
                  <p className="font-medium text-foreground">{selectedRecord.due_date}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Deskripsi</p>
                <p className="text-foreground">{selectedRecord.description}</p>
              </div>

              {selectedRecord.status === 'paid' && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Pembayaran</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tanggal Pembayaran</p>
                      <p className="font-medium text-foreground">{selectedRecord.paid_at}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Metode Pembayaran</p>
                      <p className="font-medium text-foreground capitalize">{selectedRecord.payment_method}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Proses Pembayaran</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowPaymentModal(false)
                    setSelectedRecord(null)
                    setPaymentForm({
                      invoice_id: '',
                      amount: 0,
                      payment_method: '',
                      payment_date: new Date().toISOString().split('T')[0],
                      notes: ''
                    })
                  }}
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Invoice Info */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">No. Invoice:</span>
                  <span className="font-medium">{selectedRecord.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Pelanggan:</span>
                  <span className="font-medium">{selectedRecord.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Jumlah Tagihan:</span>
                  <span className="font-bold text-foreground">{formatCurrency(selectedRecord.amount)}</span>
                </div>
              </div>

              {/* Payment Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Jumlah Pembayaran
                  </label>
                  <Input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})}
                    placeholder="0"
                    min={0}
                    max={selectedRecord.amount}
                    step={0.01}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maks: {formatCurrency(selectedRecord.amount)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Metode Pembayaran
                  </label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({...paymentForm, payment_method: e.target.value})}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Pilih metode pembayaran</option>
                    <option value="cash">Tunai</option>
                    <option value="transfer">Transfer Bank</option>
                    <option value="ewallet">E-Wallet</option>
                    <option value="credit">Kartu Kredit</option>
                    <option value="other">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Tanggal Pembayaran
                  </label>
                  <div className="relative">
                  <Input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                    required
                    className="pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                  />
                  <Calendar
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-300 pointer-events-none"
                  />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Catatan (Opsional)
                  </label>
                  <textarea
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                    placeholder="Tambahkan catatan pembayaran..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPaymentModal(false)
                    setSelectedRecord(null)
                    setPaymentForm({
                      invoice_id: '',
                      amount: 0,
                      payment_method: '',
                      payment_date: new Date().toISOString().split('T')[0],
                      notes: ''
                    })
                  }}
                >
                  Batal
                </Button>
                <Button
                  onClick={handlePayment}
                  disabled={isProcessingPayment || !paymentForm.payment_method || paymentForm.amount <= 0}
                  className="flex items-center space-x-2"
                >
                  {isProcessingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Wallet className="h-4 w-4" />
                      <span>Proses Pembayaran</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Invoice Modal */}
      {showSendModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Kirim Invoice</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowSendModal(false)
                    setSelectedRecord(null)
                  }}
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">No. Invoice:</span>
                  <span className="font-medium">{selectedRecord.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Pelanggan:</span>
                  <span className="font-medium">{selectedRecord.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Email:</span>
                  <span className="font-medium">{selectedRecord.customer_email || 'Tidak tersedia'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Jumlah:</span>
                  <span className="font-bold text-foreground">{formatCurrency(selectedRecord.amount)}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Tujuan
                  </label>
                  <Input
                    type="email"
                    value={selectedRecord.customer_email || ''}
                    placeholder="email@example.com"
                    disabled
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Pesan (Opsional)
                  </label>
                  <textarea
                    placeholder="Tambahkan pesan untuk invoice ini..."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSendModal(false)
                    setSelectedRecord(null)
                  }}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleSendInvoice}
                  disabled={isSending}
                  className="flex items-center space-x-2"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Mengirim...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Kirim Invoice</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}