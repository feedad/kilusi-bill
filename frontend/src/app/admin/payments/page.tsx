'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Activity,
  Search,
  Plus,
  Download,
  Filter,
  Eye,
  CheckCircle,
  XCircle,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Smartphone,
  Building,
  User,
  Receipt,
  X,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'

interface Payment {
  id: string
  invoice_number: string
  customer_id: string
  customer_name: string
  customer_phone: string
  package_name: string
  amount: number
  payment_method: string | null
  paid_at: string | null
  description: string
  created_at: string
}

interface PaymentStats {
  totalPayments: number
  successfulPayments: number
  totalRevenue: number
  monthlyRevenue: number
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid' | 'overdue'>('all')
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    fetchPayments()
  }, [currentPage, searchQuery, filterStatus])

  const fetchPayments = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching payments via API')

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
        search: searchQuery,
        status: filterStatus === 'all' ? 'paid' : filterStatus === 'unpaid' ? 'unpaid' : filterStatus,
      })

      const response = await api.get(`${endpoints.billing.invoices}?${params}`)

      if (response.data.success) {
        const paymentList = response.data.data.invoices || []
        setPayments(paymentList)

        // Calculate stats from payment data (only paid invoices)
        const paidPayments = paymentList.filter(p => p.status === 'paid')
        setStats({
          totalPayments: paymentList.length,
          successfulPayments: paidPayments.length,
          totalRevenue: paidPayments.reduce((sum, p) => sum + p.amount, 0),
          monthlyRevenue: paidPayments.reduce((sum, p) => sum + p.amount, 0), // Assuming current month
        })
      }
    } catch (err: any) {
      console.error('Error fetching payments:', err)
      setError(err.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch = payment.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         payment.customer_phone.includes(searchQuery) ||
                         payment.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         payment.package_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' ||
                         (filterStatus === 'paid' && payment.status === 'paid') ||
                         (filterStatus === 'unpaid' && payment.status === 'unpaid') ||
                         (filterStatus === 'overdue' && payment.status === 'overdue')
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-success bg-success/10'
      case 'unpaid':
        return 'text-warning bg-warning/10'
      case 'overdue':
        return 'text-error bg-error/10'
      default:
        return 'text-muted bg-muted'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Berhasil'
      case 'unpaid':
        return 'Menunggu'
      case 'overdue':
        return 'Terlambat'
      default:
        return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return CheckCircle
      case 'unpaid':
        return Activity
      case 'overdue':
        return XCircle
      default:
        return Activity
    }
  }

  const getPaymentMethodIcon = (method: string | null) => {
    if (!method) return Activity

    switch (method.toLowerCase()) {
      case 'transfer':
        return Building
      case 'cash':
        return DollarSign
      case 'ewallet':
        return Smartphone
      case 'credit':
        return CreditCard
      default:
        return Receipt
    }
  }

  const getPaymentMethodText = (method: string | null) => {
    if (!method) return 'N/A'

    switch (method.toLowerCase()) {
      case 'transfer':
        return 'Transfer Bank'
      case 'cash':
        return 'Tunai'
      case 'ewallet':
        return 'E-Wallet'
      case 'credit':
        return 'Kartu Kredit'
      default:
        return method
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Pembayaran</h1>
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
          <h1 className="text-2xl font-semibold text-foreground">Pembayaran</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading payments</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchPayments}>Try Again</Button>
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
        <h1 className="text-2xl font-semibold text-foreground">Pembayaran</h1>
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
            Tambah Pembayaran
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Transaksi</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">{stats.totalPayments}</div>
              <p className="text-xs text-muted-foreground">Semua transaksi</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Berhasil</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-success">{stats.successfulPayments}</div>
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
              <p className="text-xs text-muted-foreground">Semua waktu</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Pendapatan Bulan Ini</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">{formatCurrency(stats.monthlyRevenue)}</div>
              <p className="text-xs text-muted-foreground">Bulan ini</p>
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
                  placeholder="Cari pembayaran..."
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
                <option value="paid">Berhasil</option>
                <option value="unpaid">Menunggu</option>
                <option value="overdue">Terlambat</option>
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-foreground">Transaksi</th>
                  <th className="text-left p-4 font-medium text-foreground">Pelanggan</th>
                  <th className="text-left p-4 font-medium text-foreground">Jumlah</th>
                  <th className="text-left p-4 font-medium text-foreground">Metode</th>
                  <th className="text-left p-4 font-medium text-foreground">Tanggal</th>
                  <th className="text-left p-4 font-medium text-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => {
                  const StatusIcon = getStatusIcon(payment.status)
                  const MethodIcon = getPaymentMethodIcon(payment.payment_method)
                  return (
                    <tr key={payment.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{payment.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(payment.created_at).toLocaleDateString('id-ID')}
                          </p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{payment.customer_name}</p>
                          <p className="text-sm text-muted-foreground">{payment.customer_phone}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-foreground">{formatCurrency(payment.amount)}</p>
                        <p className="text-xs text-muted-foreground">{payment.package_name}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <MethodIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-foreground">
                            {getPaymentMethodText(payment.payment_method)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          {payment.paid_at ? (
                            <>
                              <p className="text-sm text-foreground">{payment.paid_at}</p>
                              <p className="text-xs text-success">Diproses</p>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">-</p>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {getStatusText(payment.status)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedPayment(payment)
                              setShowDetailModal(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
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

      {/* Payment Detail Modal */}
      {showDetailModal && selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Detail Pembayaran</h2>
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
                  <p className="font-medium text-foreground">{selectedPayment.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Pembayaran</p>
                  <p className="font-medium text-foreground">
                    {selectedPayment.paid_at || 'Belum dibayar'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Nama Pelanggan</p>
                  <p className="font-medium text-foreground">{selectedPayment.customer_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telepon</p>
                  <p className="font-medium text-foreground">{selectedPayment.customer_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paket Layanan</p>
                  <p className="font-medium text-foreground">{selectedPayment.package_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedPayment.status)}`}>
                    {getStatusText(selectedPayment.status)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Jumlah Pembayaran</p>
                  <p className="font-medium text-foreground">{formatCurrency(selectedPayment.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Metode Pembayaran</p>
                  <p className="font-medium text-foreground">
                    {getPaymentMethodText(selectedPayment.payment_method)}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Deskripsi</p>
                <p className="text-foreground">{selectedPayment.description}</p>
              </div>

              <div className="border-t pt-4 flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                  Tutup
                </Button>
                <Button>
                  <Receipt className="h-4 w-4 mr-2" />
                  Cetak Bukti
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {payments.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Tidak ada pembayaran ditemukan</h3>
              <p className="text-muted-foreground">Coba ubah filter atau kata kunci pencarian Anda.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}