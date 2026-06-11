'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'react-hot-toast'
import {
  CheckCircle,
  XCircle,
  Eye,
  Search,
  Loader2,
  Calendar,
  User,
  FileText,
  Image,
  AlertCircle,
  Download
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import { CONFIG } from '@/lib/config'
import { useDebounceSearch } from '@/hooks/useDebounceSearch'

interface PaymentVerification {
  id: number
  invoice_id: number
  invoice_number: string
  customer_id: number
  customer_name: string
  customer_email: string
  customer_phone: string
  package_name: string
  amount: number
  payment_method: string
  proof_of_payment: string
  manual_payment_details?: {
    type: string
    bank_name?: string
    account_number?: string
    account_holder?: string
    provider?: string
    phone_number?: string
  }
  is_from_chatbot?: boolean
  status: string
  created_at: string
  due_date: string
}

export default function PaymentsVerificationPage() {
  const [payments, setPayments] = useState<PaymentVerification[]>([])
  const [loading, setLoading] = useState(true)
  const { searchQuery: searchTerm, searchInput, setSearchInput, clearSearch, isSearching } = useDebounceSearch({
    delay: 500,
  })
  const [selectedPayment, setSelectedPayment] = useState<PaymentVerification | null>(null)
  const [processing, setProcessing] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [approveNotes, setApproveNotes] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [proofImageModal, setProofImageModal] = useState<string | null>(null)
  const [stats, setStats] = useState({
    pending_count: 0,
    verified_count: 0,
    rejected_count: 0,
    pending_amount: 0
  })

  useEffect(() => {
    fetchPendingPayments()
    fetchStats()
  }, [])

  const fetchPendingPayments = async () => {
    try {
      setLoading(true)
      const response = await adminApi.get('/api/v1/admin/payments-verification/pending')

      if (response.data.success) {
        setPayments(response.data.data.transactions)
      } else {
        toast.error('Gagal mengambil data pembayaran')
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
      toast.error('Terjadi kesalahan saat mengambil data')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await adminApi.get('/api/v1/admin/payments-verification/stats/summary')

      if (response.data.success) {
        setStats(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleApprove = async () => {
    if (!selectedPayment) return

    try {
      setProcessing(true)
      const response = await adminApi.post(`/api/v1/admin/payments-verification/${selectedPayment.id}/approve`, {
        notes: approveNotes
      })

      if (response.data.success) {
        toast.success('Pembayaran berhasil diverifikasi')
        setShowApproveModal(false)
        setApproveNotes('')
        setSelectedPayment(null)
        fetchPendingPayments()
        fetchStats()
      } else {
        toast.error(response.data.error || 'Gagal memverifikasi pembayaran')
      }
    } catch (error) {
      console.error('Error approving payment:', error)
      toast.error('Terjadi kesalahan saat memverifikasi')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selectedPayment || !rejectReason.trim()) {
      toast.error('Silakan isi alasan penolakan')
      return
    }

    try {
      setProcessing(true)
      const response = await adminApi.post(`/api/v1/admin/payments-verification/${selectedPayment.id}/reject`, {
        reason: rejectReason
      })

      if (response.data.success) {
        toast.success('Pembayaran ditolak')
        setShowRejectModal(false)
        setRejectReason('')
        setSelectedPayment(null)
        fetchPendingPayments()
        fetchStats()
      } else {
        toast.error(response.data.error || 'Gagal menolak pembayaran')
      }
    } catch (error) {
      console.error('Error rejecting payment:', error)
      toast.error('Terjadi kesalahan saat menolak pembayaran')
    } finally {
      setProcessing(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getProofImageUrl = (path: string) => {
    // Use API base URL for uploaded files (backend serves them)
    // Remove /api/v1 from API_BASE_URL to get the base server URL
    const serverUrl = CONFIG.API_BASE_URL.replace('/api/v1', '')
    // Ensure path starts with /
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${serverUrl}${cleanPath}`
  }

  const filteredPayments = payments.filter(payment =>
    payment.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Verifikasi Pembayaran Manual</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Verifikasi bukti pembayaran transfer manual dari customer
          </p>
        </div>
        <Button onClick={fetchPendingPayments} variant="outline" size="sm">
          <Loader2 className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">Menunggu Verifikasi</p>
                <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100 mt-1">
                  {stats.pending_count}
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  {formatCurrency(stats.pending_amount)}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400">Terverifikasi Hari Ini</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                  {stats.verified_count}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400">Ditolak Hari Ini</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100 mt-1">
                  {stats.rejected_count}
                </p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
            <Input
              type="text"
              placeholder="Cari berdasarkan nama customer atau nomor invoice..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 animate-spin" />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payments List */}
      {loading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-gray-500">Memuat data pembayaran...</p>
          </CardContent>
        </Card>
      ) : filteredPayments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {searchTerm ? 'Tidak ada pembayaran yang cocok dengan pencarian' : 'Tidak ada pembayaran menunggu verifikasi'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredPayments.map((payment) => (
            <Card key={payment.id} className="hover:shadow-lg transition-shadow relative overflow-hidden">
              {payment.is_from_chatbot && (
                <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden z-10 pointer-events-none">
                  <div className="absolute top-3 right-[-30px] rotate-45 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-[10px] font-bold py-1 px-8 shadow-lg whitespace-nowrap tracking-wider">
                    OMNICHAT
                  </div>
                </div>
              )}
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Customer Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                          {payment.customer_name}
                        </h3>
                        <p className="text-sm text-gray-500">{payment.customer_phone}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm pl-13">
                      <div>
                        <p className="text-gray-500">Invoice</p>
                        <p className="font-medium text-gray-900 dark:text-white">{payment.invoice_number}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Paket</p>
                        <p className="font-medium text-gray-900 dark:text-white">{payment.package_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Jumlah</p>
                        <p className="font-bold text-lg text-blue-600 dark:text-blue-400">
                          {formatCurrency(payment.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Metode</p>
                        <Badge variant="secondary">{payment.payment_method}</Badge>
                      </div>
                      <div>
                        <p className="text-gray-500">Tanggal Upload</p>
                        <p className="text-gray-900 dark:text-white">{formatDate(payment.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Jatuh Tempo</p>
                        <p className="text-gray-900 dark:text-white">{formatDate(payment.due_date)}</p>
                      </div>
                    </div>

                    {/* Manual Payment Details */}
                    {payment.manual_payment_details && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Detail Pembayaran:</p>
                        <div className="text-sm text-blue-900 dark:text-blue-100">
                          {payment.manual_payment_details.type === 'bank' && (
                            <>
                              <p><span className="font-medium">Bank:</span> {payment.manual_payment_details.bank_name}</p>
                              <p><span className="font-medium">No. Rek:</span> {payment.manual_payment_details.account_number}</p>
                              <p><span className="font-medium">A/N:</span> {payment.manual_payment_details.account_holder}</p>
                            </>
                          )}
                          {payment.manual_payment_details.type === 'ewallet' && (
                            <>
                              <p><span className="font-medium">E-Wallet:</span> {payment.manual_payment_details.provider}</p>
                              <p><span className="font-medium">No. HP:</span> {payment.manual_payment_details.phone_number}</p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Proof Image & Actions */}
                  <div className="flex flex-col items-center gap-3">
                    {payment.proof_of_payment && (
                      <div
                        className="relative w-32 h-32 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                        onClick={() => setProofImageModal(getProofImageUrl(payment.proof_of_payment))}
                      >
                        <img
                          src={getProofImageUrl(payment.proof_of_payment)}
                          alt="Bukti Pembayaran"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 flex items-center justify-center transition-all">
                          <Eye className="w-6 h-6 text-white opacity-0 hover:opacity-100" />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setSelectedPayment(payment)
                          setShowApproveModal(true)
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Setuju
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setSelectedPayment(payment)
                          setShowRejectModal(true)
                        }}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Tolak
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) { showApproveModal ? setShowApproveModal(false) : setShowRejectModal(false) } }}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Setujui Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                <p><span className="font-medium">Customer:</span> {selectedPayment.customer_name}</p>
                <p><span className="font-medium">Invoice:</span> {selectedPayment.invoice_number}</p>
                <p><span className="font-medium">Jumlah:</span> {formatCurrency(selectedPayment.amount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Catatan (opsional)</label>
                <Textarea
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Tambahkan catatan untuk pembayaran ini..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => {
                  setShowApproveModal(false)
                  setApproveNotes('')
                  setSelectedPayment(null)
                }}>
                  Batal
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleApprove}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Setujui
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={e => { if (e.target === e.currentTarget) { showApproveModal ? setShowApproveModal(false) : setShowRejectModal(false) } }}>
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Tolak Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                <p><span className="font-medium">Customer:</span> {selectedPayment.customer_name}</p>
                <p><span className="font-medium">Invoice:</span> {selectedPayment.invoice_number}</p>
                <p><span className="font-medium">Jumlah:</span> {formatCurrency(selectedPayment.amount)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Alasan Penolakan *</label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Jelaskan mengapa pembayaran ini ditolak..."
                  rows={3}
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => {
                  setShowRejectModal(false)
                  setRejectReason('')
                  setSelectedPayment(null)
                }}>
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Tolak
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Proof Image Modal */}
      {proofImageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={() => setProofImageModal(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={proofImageModal}
              alt="Bukti Pembayaran"
              className="max-w-full max-h-[80vh] object-contain"
            />
            <Button
              size="sm"
              variant="outline"
              className="absolute top-4 right-4 bg-white"
              onClick={(e) => {
                e.stopPropagation()
                setProofImageModal(null)
              }}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Tutup
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
