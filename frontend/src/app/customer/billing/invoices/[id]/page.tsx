'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/lib/api'
import {
  ArrowLeft,
  Download,
  Calendar,
  DollarSign,
  User,
  MapPin,
  Phone,
  Mail,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  CreditCard,
  Receipt,
  Share2,
  Printer
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'

interface InvoiceDetail {
  id: string
  invoice_number: string
  customer: {
    name: string
    phone: string
    email?: string
    address: string
  }
  package: {
    name: string
    price: number
    description?: string
  }
  amount: number
  tax: number
  discount: number
  total_amount: number
  status: 'paid' | 'unpaid' | 'pending' | 'cancelled'
  due_date: string
  created_at: string
  paid_at?: string
  description: string
  payment_method?: string
  payment_details?: {
    method: string
    bank_name?: string
    account_number?: string
    account_name?: string
  }
  items: Array<{
    description: string
    quantity: number
    unit_price: number
    total: number
  }>
  notes?: string
  download_url?: string
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { customer } = useCustomerAuth()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchInvoiceDetail(params.id as string)
    }
  }, [params.id])

  const fetchInvoiceDetail = async (invoiceId: string) => {
    try {
      setLoading(true)
      const response = await api.get(`/api/v1/customer-billing/invoices/${invoiceId}`)

      if (response.data.success) {
        setInvoice(response.data.data)
      } else {
        toast.error(`❌ ${response.data.message || 'Gagal memuat detail invoice'}`)
      }
    } catch (error: any) {
      console.error('Error fetching invoice detail:', error)
      if (error.response?.status === 404) {
        toast.error('❌ Invoice tidak ditemukan')
      } else if (error.response?.status === 401) {
        toast.error('❌ Anda tidak memiliki akses ke invoice ini')
      } else {
        toast.error('❌ Gagal memuat detail invoice')
      }
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Lunas</Badge>
      case 'unpaid':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><AlertCircle className="w-3 h-3 mr-1" />Belum Dibayar</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Dibatalkan</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
      }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const handlePayInvoice = async () => {
    // In a real implementation, this would redirect to payment page
    toast.success('🔄 Mengalihkan ke halaman pembayaran...')
  }

  const handleDownloadInvoice = async () => {
    try {
      setDownloading(true)
      if (invoice?.download_url) {
        // In a real implementation, this would download the invoice
        toast.success('📥 Mengunduh invoice...')
      } else {
        toast.error('❌ File tidak tersedia')
      }
    } catch (error) {
      toast.error('❌ Gagal mengunduh invoice')
    } finally {
      setDownloading(false)
    }
  }

  const handlePrintInvoice = () => {
    window.print()
  }

  const handleShareInvoice = async () => {
    if (invoice) {
      const shareText = `Invoice ${invoice.invoice_number} - ${formatCurrency(invoice.total_amount)}`

      if (navigator.share) {
        try {
          await navigator.share({
            title: `Invoice ${invoice.invoice_number}`,
            text: shareText,
            url: window.location.href
          })
        } catch (error) {
          console.log('Share cancelled or failed')
        }
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(`${shareText} - ${window.location.href}`)
        toast.success('✅ Link invoice berhasil disalin!')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 dark:text-gray-300">Memuat detail invoice...</p>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 dark:text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-400 mb-4">Invoice tidak ditemukan</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => router.back()}
              className="no-print"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white dark:text-white">{invoice.invoice_number}</h1>
              <p className="text-gray-600 dark:text-gray-300 dark:text-gray-300">Detail Tagihan Internet</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 no-print">
            {getStatusBadge(invoice.status)}
            {invoice.status === 'unpaid' && (
              <Button
                onClick={handlePayInvoice}
                className="bg-green-600 hover:bg-green-700"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Bayar Sekarang
              </Button>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-8 no-print">
          <Button
            variant="outline"
            onClick={handleDownloadInvoice}
            disabled={downloading}
          >
            <Download className="h-4 w-4 mr-2" />
            {downloading ? 'Mengunduh...' : 'Download PDF'}
          </Button>

          <Button variant="outline" onClick={handlePrintInvoice}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>

          <Button variant="outline" onClick={handleShareInvoice}>
            <Share2 className="h-4 w-4 mr-2" />
            Bagikan
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Invoice Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Invoice Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white dark:text-white">INVOICE</h2>
                    <p className="text-gray-600 dark:text-gray-300 dark:text-gray-300">{invoice.invoice_number}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-400">Tanggal Invoice</div>
                    <div className="font-semibold">{formatDate(invoice.created_at)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Diterbitkan kepada:</div>
                    <div>
                      <div className="font-semibold">{invoice.customer.name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">{invoice.customer.address}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">{invoice.customer.phone}</div>
                      {invoice.customer.email && (
                        <div className="text-sm text-gray-600 dark:text-gray-300">{invoice.customer.email}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Diterbitkan oleh:</div>
                    <div>
                      <div className="font-semibold">PT Kilusi Digital Network</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">Jl. Technology No. 123</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">Jakarta, Indonesia</div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">contact@kilusi.id</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Invoice Items */}
            <Card>
              <CardHeader>
                <CardTitle>Rincian Tagihan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                    {invoice.description}
                  </div>

                  <div className="border-t pt-4">
                    {invoice.items.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2">
                        <div className="flex-1">
                          <div className="font-medium">{item.description}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {item.quantity} x {formatCurrency(item.unit_price)}
                          </div>
                        </div>
                        <div className="font-semibold">{formatCurrency(item.total)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal</span>
                      <span>{formatCurrency(invoice.amount)}</span>
                    </div>
                    {invoice.tax > 0 && (
                      <div className="flex justify-between text-sm">
                        <span>Pajak (11%)</span>
                        <span>{formatCurrency(invoice.tax)}</span>
                      </div>
                    )}
                    {invoice.discount > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Diskon</span>
                        <span>-{formatCurrency(invoice.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total</span>
                      <span>{formatCurrency(invoice.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {invoice.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Catatan</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 dark:text-gray-300">{invoice.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status & Due Date */}
            <Card>
              <CardHeader>
                <CardTitle>Status Pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Status</span>
                    {getStatusBadge(invoice.status)}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Jatuh Tempo</span>
                    <span className={`font-medium ${
                      new Date(invoice.due_date) < new Date() && invoice.status !== 'paid'
                        ? 'text-red-600'
                        : ''
                    }`}>
                      {formatDate(invoice.due_date)}
                    </span>
                  </div>

                  {invoice.paid_at && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Tanggal Bayar</span>
                      <span className="font-medium text-green-600">
                        {formatDate(invoice.paid_at)}
                      </span>
                    </div>
                  )}

                  {invoice.payment_method && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Metode</span>
                      <span className="font-medium">{invoice.payment_method}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Information */}
            {invoice.status === 'unpaid' && invoice.payment_details && (
              <Card>
                <CardHeader>
                  <CardTitle>Informasi Pembayaran</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">Metode Pembayaran</div>
                      <div className="font-semibold">{invoice.payment_details.method}</div>
                    </div>

                    {invoice.payment_details.bank_name && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">Bank</div>
                        <div className="font-semibold">{invoice.payment_details.bank_name}</div>
                      </div>
                    )}

                    {invoice.payment_details.account_number && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">No. Rekening</div>
                        <div className="font-semibold font-mono">
                          {invoice.payment_details.account_number}
                        </div>
                      </div>
                    )}

                    {invoice.payment_details.account_name && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">Atas Nama</div>
                        <div className="font-semibold">{invoice.payment_details.account_name}</div>
                      </div>
                    )}

                    <Alert className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="ml-2">
                        Mohon sertakan nomor invoice <strong>{invoice.invoice_number}</strong> saat melakukan transfer.
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Aksi Cepat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => router.push("/customer/support/tickets/new")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Ajukan Tiket Bantuan
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => router.push("/customer/billing")}
                  >
                    <Receipt className="h-4 w-4 mr-2" />
                    Lihat Semua Tagihan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}