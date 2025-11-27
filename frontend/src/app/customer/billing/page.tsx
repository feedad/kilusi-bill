'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  CreditCard,
  Receipt,
  Calendar,
  Download,
  Eye,
  Search,
  X,
  Calculator
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { api } from '@/lib/api'

interface Invoice {
  id: string
  invoice_number: string
  amount: number
  status: 'paid' | 'unpaid' | 'pending' | 'cancelled'
  due_date: string
  created_at: string
  paid_at?: string
  description?: string
  payment_method?: string
  download_url?: string
}

interface Payment {
  id: number
  invoice_id: number
  invoice_number: string
  amount: string
  payment_date: string
  payment_method: string
  reference_number: string
  notes: string
  created_at: string
  due_date: string
}

export default function CustomerBilling() {
  const router = useRouter()
  const { customer } = useCustomerAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices')
  const [searchTerm, setSearchTerm] = useState('')
  const [showBulkPaymentModal, setShowBulkPaymentModal] = useState(false)
  const [selectedMonths, setSelectedMonths] = useState(1)
  const [bulkPaymentSettings, setBulkPaymentSettings] = useState<any>(null)
  const [calculating, setCalculating] = useState(false)
  const [calculationResult, setCalculationResult] = useState<any>(null)

  useEffect(() => {
    // Fetch data from backend
    const fetchBillingData = async () => {
      try {
        // Get customer phone from auth context
        let customerPhone = null

        // Try to get phone from authenticated customer first
        if (customer?.phone) {
          customerPhone = customer.phone
        } else {
          // Fallback to localStorage
          const customerData = localStorage.getItem('customer_data')
          if (customerData) {
            try {
              const parsedCustomer = JSON.parse(customerData)
              customerPhone = parsedCustomer.phone
            } catch (e) {
              console.log('Could not parse customer data from localStorage')
            }
          }
        }

        console.log('Billing: Using customer phone:', customerPhone)

        // Fetch invoices with customer phone using correct API endpoints
        const invoicesResponse = await api.get('/api/v1/customer-billing/my-invoices', {
          params: customerPhone ? { phone: customerPhone } : {},
          headers: customerPhone ? { 'x-customer-phone': customerPhone } : {}
        })
        const paymentsResponse = await api.get('/api/v1/customer-billing/my-payments', {
          params: customerPhone ? { phone: customerPhone } : {},
          headers: customerPhone ? { 'x-customer-phone': customerPhone } : {}
        })
        const bulkPaymentResponse = await api.get('/api/v1/customer-billing/bulk-payment-settings')

        setInvoices(invoicesResponse.data.data || [])
        setPayments(paymentsResponse.data.data || [])
        setBulkPaymentSettings(bulkPaymentResponse.data.data || {
          enabled: true,
          discount_1_month_type: 'percentage',
          discount_1_month_value: 0,
          discount_2_months_type: 'percentage',
          discount_2_months_value: 0,
          discount_3_months_type: 'percentage',
          discount_3_months_value: 5,
          discount_6_months_type: 'percentage',
          discount_6_months_value: 10,
          discount_12_months_type: 'percentage',
          discount_12_months_value: 15
        })
      } catch (error) {
        console.error('Error fetching billing data:', error)
        // Initialize with empty arrays on error
        setInvoices([])
        setPayments([])
        setBulkPaymentSettings({
          enabled: true,
          discount_1_month_type: 'percentage',
          discount_1_month_value: 0,
          discount_2_months_type: 'percentage',
          discount_2_months_value: 0,
          discount_3_months_type: 'percentage',
          discount_3_months_value: 5,
          discount_6_months_type: 'percentage',
          discount_6_months_value: 10,
          discount_12_months_type: 'percentage',
          discount_12_months_value: 15
        })
      } finally {
        setLoading(false)
      }
    }

    fetchBillingData()
  }, [customer]) // Add customer dependency to refetch when customer changes

  // Recalculate when months change
  useEffect(() => {
    if (showBulkPaymentModal && selectedMonths > 0) {
      handleRecalculation()
    }
  }, [selectedMonths])

  // Helper function to format discount display
  const formatDiscountDisplay = (type: string, value: number) => {
    switch (type) {
      case 'percentage':
        return `Diskon ${value}%`
      case 'free_months':
        return `Gratis ${value} bulan`
      case 'fixed_amount':
        return `Diskon Rp ${value.toLocaleString('id-ID')}`
      default:
        return `Diskon ${value}%`
    }
  }

  const handleRecalculation = async () => {
    setCalculating(true)
    try {
      const result = await calculateBulkPayment(selectedMonths)
      setCalculationResult(result)
    } catch (error) {
      console.error('Error in recalculation:', error)
    } finally {
      setCalculating(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Sudah Dibayar</Badge>
      case 'unpaid':
        return <Badge className="bg-red-100 text-red-800"><AlertCircle className="w-3 h-3 mr-1" />Belum Dibayar</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const handlePayInvoice = (invoice: Invoice) => {
    toast.success(`🔄 Memproses pembayaran untuk ${invoice.invoice_number}...`)
    // TODO: Integrasikan dengan payment gateway
  }

  const handleDownloadInvoice = (invoice: Invoice) => {
    toast.success('📥 Mengunduh invoice...')
    // TODO: Implement download functionality
  }

  const handleBulkPayment = () => {
    setShowBulkPaymentModal(true)
  }

  const calculateBulkPayment = async (months: number) => {
    try {
      const packagePrice = customer?.package_price || 0

      // Call API to calculate bulk payment with dynamic discount using correct API endpoint
      const response = await api.post('/api/v1/customer-billing/calculate-bulk-payment', {
        months,
        packagePrice
      })

      if (response.data.success) {
        const result = response.data
        const currentDate = new Date()
        const isolationDate = new Date(currentDate.setMonth(currentDate.getMonth() + months))

        return {
          total: result.data.finalTotal,
          originalTotal: result.data.originalTotal,
          discount: result.data.discount,
          discountType: result.data.discountType,
          discountDisplay: result.data.discountDisplay,
          isolationDate: isolationDate.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          effectiveMonths: result.data.effectiveMonths,
          totalMonthsPaid: result.data.totalMonthsPaid,
          perMonthEffective: result.data.perMonthEffective
        }
      } else {
        // Fallback to client-side calculation with dynamic discounts
        const packagePrice = customer?.package_price || 0
        let discount = 0
        let discountType = 'none'
        let discountDisplay = 'Tidak ada diskon'
        let effectiveMonths = months
        let totalMonthsPaid = months

        // Get discount settings based on selected months
        const discountKey = months === 1 ? 'discount_1_month' :
                           months === 2 ? 'discount_2_months' :
                           months === 3 ? 'discount_3_months' :
                           months === 6 ? 'discount_6_months' :
                           months === 12 ? 'discount_12_months' : null

        if (discountKey && bulkPaymentSettings?.enabled) {
          const discountTypeField = `${discountKey}_type`
          const discountValueField = `${discountKey}_value`
          const currentDiscountType = bulkPaymentSettings[discountTypeField] || 'percentage'
          const currentDiscountValue = bulkPaymentSettings[discountValueField] || 0

          if (currentDiscountValue > 0) {
            discountType = currentDiscountType
            switch (currentDiscountType) {
              case 'percentage':
                discount = (packagePrice * months) * (currentDiscountValue / 100)
                discountDisplay = `Diskon ${currentDiscountValue}%`
                break
              case 'free_months':
                discount = packagePrice * currentDiscountValue
                discountDisplay = `Gratis ${currentDiscountValue} bulan`
                effectiveMonths = months + currentDiscountValue
                break
              case 'fixed_amount':
                discount = currentDiscountValue
                discountDisplay = `Diskon Rp ${currentDiscountValue.toLocaleString('id-ID')}`
                break
            }
          }
        }

        const total = (packagePrice * months) - discount
        const currentDate = new Date()
        const isolationDate = new Date(currentDate.setMonth(currentDate.getMonth() + effectiveMonths))

        return {
          total,
          originalTotal: packagePrice * months,
          discount,
          discountType,
          discountDisplay,
          isolationDate: isolationDate.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          effectiveMonths,
          totalMonthsPaid,
          perMonthEffective: total / effectiveMonths
        }
      }
    } catch (error) {
      console.error('Error calculating bulk payment:', error)
      // Fallback to client-side calculation with dynamic discounts
      const packagePrice = customer?.package_price || 0
      let discount = 0
      let discountType = 'none'
      let discountDisplay = 'Tidak ada diskon'
      let effectiveMonths = months
      let totalMonthsPaid = months

      // Get discount settings based on selected months
      const discountKey = months === 1 ? 'discount_1_month' :
                         months === 2 ? 'discount_2_months' :
                         months === 3 ? 'discount_3_months' :
                         months === 6 ? 'discount_6_months' :
                         months === 12 ? 'discount_12_months' : null

      if (discountKey && bulkPaymentSettings?.enabled) {
        const discountTypeField = `${discountKey}_type`
        const discountValueField = `${discountKey}_value`
        const currentDiscountType = bulkPaymentSettings[discountTypeField] || 'percentage'
        const currentDiscountValue = bulkPaymentSettings[discountValueField] || 0

        if (currentDiscountValue > 0) {
          discountType = currentDiscountType
          switch (currentDiscountType) {
            case 'percentage':
              discount = (packagePrice * months) * (currentDiscountValue / 100)
              discountDisplay = `Diskon ${currentDiscountValue}%`
              break
            case 'free_months':
              discount = packagePrice * currentDiscountValue
              discountDisplay = `Gratis ${currentDiscountValue} bulan`
              effectiveMonths = months + currentDiscountValue
              break
            case 'fixed_amount':
              discount = currentDiscountValue
              discountDisplay = `Diskon Rp ${currentDiscountValue.toLocaleString('id-ID')}`
              break
          }
        }
      }

      const total = (packagePrice * months) - discount
      const currentDate = new Date()
      const isolationDate = new Date(currentDate.setMonth(currentDate.getMonth() + effectiveMonths))

      return {
        total,
        originalTotal: packagePrice * months,
        discount,
        discountType,
        discountDisplay,
        isolationDate: isolationDate.toLocaleDateString('id-ID', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        effectiveMonths,
        totalMonthsPaid,
        perMonthEffective: total / effectiveMonths
      }
    }
  }

  const confirmBulkPayment = async () => {
    toast.loading('🔄 Menghitung diskon pembayaran...')
    const calculation = await calculateBulkPayment(selectedMonths)
    toast.dismiss()

    toast.success(`🔄 Memproses pembayaran ${calculation.totalMonthsPaid} bulan sebesar ${formatCurrency(calculation.total)}...`)
    setShowBulkPaymentModal(false)
    // TODO: Integrasikan dengan payment gateway
  }

  const monthOptions = bulkPaymentSettings ? [
    {
      value: 1,
      label: '1 Bulan',
      discount: bulkPaymentSettings.discount_1_month_value || 0,
      discountType: bulkPaymentSettings.discount_1_month_type || 'percentage'
    },
    {
      value: 2,
      label: '2 Bulan',
      discount: bulkPaymentSettings.discount_2_months_value || 0,
      discountType: bulkPaymentSettings.discount_2_months_type || 'percentage'
    },
    {
      value: 3,
      label: '3 Bulan',
      discount: bulkPaymentSettings.discount_3_months_value || 0,
      discountType: bulkPaymentSettings.discount_3_months_type || 'percentage'
    },
    {
      value: 6,
      label: '6 Bulan',
      discount: bulkPaymentSettings.discount_6_months_value || 0,
      discountType: bulkPaymentSettings.discount_6_months_type || 'percentage'
    },
    {
      value: 12,
      label: '1 Tahun',
      discount: bulkPaymentSettings.discount_12_months_value || 0,
      discountType: bulkPaymentSettings.discount_12_months_type || 'percentage'
    }
  ] : [
    { value: 1, label: '1 Bulan', discount: 0, discountType: 'percentage' },
    { value: 2, label: '2 Bulan', discount: 0, discountType: 'percentage' },
    { value: 3, label: '3 Bulan', discount: 10, discountType: 'percentage' },
    { value: 6, label: '6 Bulan', discount: 1, discountType: 'free_months' },
    { value: 12, label: '1 Tahun', discount: 2, discountType: 'free_months' }
  ]

  const filteredInvoices = invoices.filter(invoice =>
    invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredPayments = payments.filter(payment =>
    payment.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Check if bulk payment is enabled
  const isBulkPaymentEnabled = bulkPaymentSettings?.enabled !== false

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat data billing...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tagihan Anda</h1>
          <p className="text-gray-600 mt-1">Kelola tagihan dan riwayat pembayaran Anda</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex-1 flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'invoices'
              ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm dark:shadow-none'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <FileText className="w-4 h-4 mr-2" />
          Tagihan
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`flex-1 flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'payments'
              ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm dark:shadow-none'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <Receipt className="w-4 h-4 mr-2" />
          Riwayat Pembayaran
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-12 pb-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-300 dark:text-green-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Tagihan Sudah Lunas</h3>
              <p className="text-gray-500 dark:text-gray-400">Belum ada tagihan yang perlu dibayar saat ini</p>
              {isBulkPaymentEnabled && (
                <Button
                  onClick={handleBulkPayment}
                  className="mt-6 bg-blue-600 hover:bg-blue-700 text-white"
                  size="lg"
                >
                  <Calculator className="w-5 h-5 mr-2" />
                  Bayar di Muka
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Search Bar - Only in payments tab */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Cari nomor invoice..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                />
              </div>
            </CardContent>
          </Card>

          {filteredPayments.length === 0 ? (
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-12 pb-12 text-center">
                <Receipt className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Tidak Ada Riwayat Pembayaran</h3>
                <p className="text-gray-500 dark:text-gray-400">Anda belum memiliki riwayat pembayaran yang bisa ditampilkan</p>
              </CardContent>
            </Card>
          ) : (
            filteredPayments.map((payment) => (
              <Card key={payment.id} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                          <Receipt className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors group"
                               onClick={() => router.push(`/customer/billing/invoices/${payment.invoice_id}`)}>
                            <span>{payment.invoice_number}</span>
                            <Eye className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Metode: {payment.payment_method}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(payment.amount)}
                      </div>
                      <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Sukses
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      Tanggal Pembayaran: {formatDate(payment.payment_date)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Bulk Payment Modal */}
      {showBulkPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Pembayaran di Muka</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkPaymentModal(false)}
                  className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pilih Durasi Pembayaran
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {monthOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setSelectedMonths(option.value)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          selectedMonths === option.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <div className="font-medium">{option.label}</div>
                        {option.discount > 0 && (
                          <div className="text-xs text-green-600 dark:text-green-400">
                            {formatDiscountDisplay(option.discountType, option.discount)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  {calculating ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
                      <span className="text-sm text-gray-600 dark:text-gray-300">Menghitung diskon...</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Paket {customer?.package_name || 'Internet'}</span>
                        <span className="text-gray-900 dark:text-white">{formatCurrency(customer?.package_price || 0)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Durasi</span>
                        <span className="text-gray-900 dark:text-white">{selectedMonths} Bulan</span>
                      </div>
                      {calculationResult && (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-300">Subtotal</span>
                            <span className="text-gray-900 dark:text-white">{formatCurrency(calculationResult.originalTotal)}</span>
                          </div>
                          {calculationResult.discount > 0 && (
                            <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                              <span>{calculationResult.discountDisplay}</span>
                              <span>-{formatCurrency(calculationResult.discount)}</span>
                            </div>
                          )}
                          <div className="border-t pt-2 flex justify-between font-semibold">
                            <span className="text-gray-900 dark:text-white">Total Pembayaran</span>
                            <span className="text-blue-600 dark:text-blue-400">{formatCurrency(calculationResult.total)}</span>
                          </div>
                          {calculationResult.effectiveMonths !== selectedMonths && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 text-center">
                              Mendapatkan layanan untuk {calculationResult.effectiveMonths} bulan
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <div className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Perpanjangan Layanan:</strong>
                    {calculationResult ?
                      ` Sampai ${calculationResult.isolationDate}` :
                      ` Sampai ${calculateBulkPayment(selectedMonths).then(r => r.isolationDate).catch(() => '...')}`
                    }
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowBulkPaymentModal(false)}
                  >
                    Batal
                  </Button>
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={confirmBulkPayment}
                  >
                    Bayar Sekarang
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}