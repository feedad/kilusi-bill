'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  CreditCard,
  Search,
  Plus,
  Download,
  Filter,
  Eye,
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Clock,
  X,
  Loader2,
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
  customer_phone: string
  package_name: string
  amount: number
  due_date: string
  status: 'paid' | 'unpaid' | 'overdue' | 'cancelled'
  paid_at: string | null
  payment_method: string | null
  description: string
  created_at: string
}

interface BillingStats {
  paidCount: number
  pendingCount: number
  overdueCount: number
  totalRevenue: number
  pendingRevenue: number
}

export default function BillingPage() {
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([])
  const [stats, setStats] = useState<BillingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid' | 'overdue' | 'cancelled'>('all')
  const [selectedRecord, setSelectedRecord] = useState<BillingRecord | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

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
        status: filterStatus === 'all' ? '' : filterStatus === 'pending' ? 'unpaid' : filterStatus,
      })

      const response = await api.get(`${endpoints.billing.invoices}?${params}`)

      if (response.data.success) {
        const invoices = response.data.data.invoices || []
        setBillingRecords(invoices)

        // Calculate stats from invoice data
        const paidInvoices = invoices.filter(r => r.status === 'paid')
        const unpaidInvoices = invoices.filter(r => r.status === 'unpaid')
        const overdueInvoices = invoices.filter(r => r.status === 'overdue')

        setStats({
          paidCount: paidInvoices.length,
          pendingCount: unpaidInvoices.length,
          overdueCount: overdueInvoices.length,
          totalRevenue: paidInvoices.reduce((sum, r) => sum + r.amount, 0),
          pendingRevenue: [...unpaidInvoices, ...overdueInvoices].reduce((sum, r) => sum + r.amount, 0),
        })
      }
    } catch (err: any) {
      console.error('Error fetching billing records:', err)
      setError(err.message || 'Failed to load billing records')
    } finally {
      setLoading(false)
    }
  }

  const filteredRecords = billingRecords.filter((record) => {
    const matchesSearch = record.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         record.customer_phone.includes(searchQuery) ||
                         record.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         record.package_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' ||
                         (filterStatus === 'pending' && record.status === 'unpaid') ||
                         record.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-success bg-success/10'
      case 'pending':
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

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
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
          <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
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
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
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
            Buat Tagihan
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Lunas</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-success">{stats.paidCount}</div>
              <p className="text-xs text-muted-foreground">Pembayaran berhasil</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Menunggu Bayar</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-warning">{stats.pendingCount}</div>
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
                  placeholder="Cari billing record..."
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
                <option value="paid">Lunas</option>
                <option value="pending">Menunggu</option>
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

      {/* Billing Records Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Tagihan</CardTitle>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedRecord(record)
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

      {/* Billing Detail Modal */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Detail Tagihan</h2>
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
                  <p className="text-sm text-muted-foreground">Telepon</p>
                  <p className="font-medium text-foreground">{selectedRecord.customer_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paket Layanan</p>
                  <p className="font-medium text-foreground">{selectedRecord.package_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedRecord.status)}`}>
                    {getStatusText(selectedRecord.status)}
                  </span>
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
    </div>
  )
}