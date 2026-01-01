'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  FileText,
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
  CheckCircle,
  Clock,
  AlertCircle,
  Mail,
  Printer,
  X,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'

interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  customer_name: string
  customer_email: string
  customer_phone: string
  package_name: string
  amount: number
  due_date: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  paid_at: string | null
  payment_method: string | null
  description: string
  created_at: string
}

interface InvoiceStats {
  totalInvoices: number
  draftInvoices: number
  sentInvoices: number
  paidInvoices: number
  overdueInvoices: number
  totalRevenue: number
  pendingRevenue: number
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [stats, setStats] = useState<InvoiceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    fetchInvoices()
  }, [currentPage, searchQuery, filterStatus])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching invoices via API')

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })

      const response = await api.get(`${endpoints.billing.invoices}?${params}`)

      if (response.data.success) {
        const invoiceList = response.data.data.invoices || []
        setInvoices(invoiceList)

        // Calculate stats from invoice data
        setStats({
          totalInvoices: invoiceList.length,
          draftInvoices: invoiceList.filter(i => i.status === 'draft').length,
          sentInvoices: invoiceList.filter(i => i.status === 'sent').length,
          paidInvoices: invoiceList.filter(i => i.status === 'paid').length,
          overdueInvoices: invoiceList.filter(i => i.status === 'overdue').length,
          totalRevenue: invoiceList.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0),
          pendingRevenue: invoiceList.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0),
        })
      }
    } catch (err: any) {
      console.error('Error fetching invoices:', err)
      setError(err.message || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch = invoice.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.customer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         invoice.package_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' || invoice.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'text-muted bg-muted'
      case 'sent':
        return 'text-warning bg-warning/10'
      case 'paid':
        return 'text-success bg-success/10'
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
      case 'draft':
        return 'Draft'
      case 'sent':
        return 'Terkirim'
      case 'paid':
        return 'Lunas'
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
      case 'draft':
        return FileText
      case 'sent':
        return Send
      case 'paid':
        return CheckCircle
      case 'overdue':
        return AlertCircle
      case 'cancelled':
        return Trash2
      default:
        return Clock
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Invoice</h1>
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
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
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/4"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Invoice</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading invoices</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchInvoices}>Try Again</Button>
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
        <h1 className="text-2xl font-semibold text-foreground">Invoice</h1>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Invoice</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">{stats.totalInvoices}</div>
              <p className="text-xs text-muted-foreground">Semua invoice</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Draft</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-muted">{stats.draftInvoices}</div>
              <p className="text-xs text-muted-foreground">Belum dikirim</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Terkirim</CardTitle>
              <Send className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-warning">{stats.sentInvoices}</div>
              <p className="text-xs text-muted-foreground">Menunggu pembayaran</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Lunas</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-success">{stats.paidInvoices}</div>
              <p className="text-xs text-muted-foreground">Sudah dibayar</p>
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
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Invoice Terlambat</span>
                  <span className="font-medium text-error">{stats.overdueInvoices} invoice</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-foreground">Statistik Bulan Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Invoice Dibuat</span>
                  <span className="font-medium text-foreground">{stats.totalInvoices}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tingkat Lunas</span>
                  <span className="font-medium text-success">
                    {stats.totalInvoices > 0 ? Math.round((stats.paidInvoices / stats.totalInvoices) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Rata-rata Invoice</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(stats.totalInvoices > 0 ? stats.totalRevenue / stats.totalInvoices : 0)}
                  </span>
                </div>
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
                  placeholder="Cari invoice..."
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
                <option value="paid">Lunas</option>
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

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Invoice</CardTitle>
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
                {filteredInvoices.map((invoice) => {
                  const StatusIcon = getStatusIcon(invoice.status)
                  return (
                    <tr key={invoice.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(invoice.created_at).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{invoice.customer_name}</p>
                          <p className="text-sm text-muted-foreground">{invoice.customer_phone}</p>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-foreground">{invoice.package_name}</td>
                      <td className="p-4">
                        <p className="font-medium text-foreground">{formatCurrency(invoice.amount)}</p>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="text-sm text-foreground">{invoice.due_date}</p>
                          {invoice.paid_at && (
                            <p className="text-xs text-success">Dibayar {invoice.paid_at}</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {getStatusText(invoice.status)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedInvoice(invoice)
                              setShowDetailModal(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-error hover:text-error"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
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
                  <p className="font-medium text-foreground">{selectedInvoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Dibuat</p>
                  <p className="font-medium text-foreground">{selectedInvoice.created_at}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nama Pelanggan</p>
                  <p className="font-medium text-foreground">{selectedInvoice.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{selectedInvoice.customer_email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telepon</p>
                  <p className="font-medium text-foreground">{selectedInvoice.customer_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paket Layanan</p>
                  <p className="font-medium text-foreground">{selectedInvoice.package_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedInvoice.status)}`}>
                    {getStatusText(selectedInvoice.status)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jumlah Tagihan</p>
                  <p className="font-medium text-foreground">{formatCurrency(selectedInvoice.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jatuh Tempo</p>
                  <p className="font-medium text-foreground">{selectedInvoice.due_date}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Deskripsi</p>
                <p className="text-foreground">{selectedInvoice.description}</p>
              </div>

              {selectedInvoice.status === 'paid' && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Pembayaran</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tanggal Pembayaran</p>
                      <p className="font-medium text-foreground">{selectedInvoice.paid_at}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Metode Pembayaran</p>
                      <p className="font-medium text-foreground capitalize">{selectedInvoice.payment_method}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="border-t pt-4 flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                  Tutup
                </Button>
                <Button>
                  <Mail className="h-4 w-4 mr-2" />
                  Kirim
                </Button>
                <Button variant="outline">
                  <Printer className="h-4 w-4 mr-2" />
                  Cetak
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {invoices.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Tidak ada invoice ditemukan</h3>
              <p className="text-muted-foreground">Coba ubah filter atau kata kunci pencarian Anda.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}