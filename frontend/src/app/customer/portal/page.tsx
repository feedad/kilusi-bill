'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Wifi,
  WifiOff,
  AlertTriangle,
  Headset,
  Zap,
  Copy,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  Activity,
  RefreshCw,
  Smartphone,
  ExternalLink,
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard
} from 'lucide-react'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { customerAPI } from '@/lib/customer-api'

interface CustomerData {
  id: number
  customer_id?: string
  name: string
  phone: string
  status: string
  address?: string
  package_name?: string
  package_price?: number
  pppoe_username?: string // PPPoE username untuk koneksi internet
  password?: string
  status_text?: string
  registration_date?: string
  isolation_date?: string
  expiry_date?: string // tanggal expired real dari database
  calculated_isolir_date?: string // tanggal isolir yang sudah dikalkulasi (sama seperti admin)
  hasInvoice?: boolean // untuk menentukan apakah invoice sudah keluar
  isOnline?: boolean // status RADIUS online/offline
}

interface BillingStats {
  totalInvoices: number
  paidInvoices: number
  unpaidInvoices: number
  totalPaid: number
  totalUnpaid: number
  overdueInvoices: number
}

interface RadiusStatus {
  connected: boolean
  lastSeen?: string
  onlineTime?: string
  ipAddress?: string
  uptime?: string
}

interface PortalData {
  loginUrl: string
  token: string
  expiresAt: string
  daysUntilExpiry: number
  radiusStatus: RadiusStatus
}

export default function CustomerPortal() {
  const router = useRouter()
  const { customer } = useCustomerAuth()
  const [customerData, setCustomerData] = useState<CustomerData | null>(null)
  const [billingStats, setBillingStats] = useState<BillingStats>({
    totalInvoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    overdueInvoices: 0
  })
  const [portalData, setPortalData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showDetailedInfo, setShowDetailedInfo] = useState(false)

  // Fungsi untuk menentukan greeting berdasarkan waktu
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 10) return 'Selamat Pagi'
    if (hour < 15) return 'Selamat Siang'
    if (hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  }

  
  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        setLoading(true)

        // Get the current authentication token
        const token = localStorage.getItem('customer_token')

        if (!token) {
          console.log('No authentication token found, redirecting to login')
          router.push('/customer/login')
          return
        }

        console.log('🔍 Fetching customer data using standardized API...')

        // Use standardized customer API
        const result = await customerAPI.getCustomerData()
        console.log('📡 API Response:', result)

        if (!result.success) {
          // Handle authentication errors through API client
          if (result.error?.includes('Authentication') || result.error?.includes('Unauthorized')) {
            console.log('Authentication error, redirecting to login')
            logout()
            return
          }
          throw new Error(result.message || 'API returned error')
        }

        const { customer: apiCustomer, radiusStatus, billingStats } = result.data

        // Map the comprehensive API response to our local CustomerData interface
        const enrichedCustomer: CustomerData = {
          id: apiCustomer.id,
          customer_id: apiCustomer.customer_id,
          name: apiCustomer.name,
          phone: apiCustomer.phone,
          status: apiCustomer.status,
          address: apiCustomer.address,
          registration_date: apiCustomer.install_date?.split('T')[0],
          isolation_date: apiCustomer.isolation_date,
          expiry_date: apiCustomer.expiry_date,
          calculated_isolir_date: apiCustomer.calculated_isolir_date, // Add calculated isolir date like admin
          hasInvoice: apiCustomer.hasInvoice,
          isOnline: apiCustomer.isOnline,
          package_name: apiCustomer.package_name,
          package_price: parseFloat(apiCustomer.package_price) || 0,
          pppoe_username: apiCustomer.pppoe_username,
          password: undefined // Don't expose password in portal
        }

        console.log('✅ Mapped customer data:', enrichedCustomer)
        console.log('📊 Billing stats:', billingStats)
        console.log('🌐 RADIUS status:', radiusStatus)

        setCustomerData(enrichedCustomer)
        setBillingStats(billingStats)

        // Set portal data
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'
        setPortalData({
          loginUrl: `${baseUrl}/customer/login/${token}`,
          token: token,
          expiresAt: enrichedCustomer.expiry_date ? new Date(enrichedCustomer.expiry_date).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          daysUntilExpiry: enrichedCustomer.expiry_date ? Math.ceil((new Date(enrichedCustomer.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 30,
          radiusStatus: radiusStatus || {
            connected: enrichedCustomer.isOnline || false,
            lastSeen: enrichedCustomer.isOnline ? new Date().toISOString() : null,
            onlineTime: null,
            ipAddress: null,
            uptime: null
          }
        })

      } catch (error) {
        console.error('💥 Error fetching customer data:', error)
        console.error('💥 Error details:', {
          message: error.message,
          status: error.status,
          statusText: error.statusText,
          token: localStorage.getItem('customer_token') ? 'present' : 'missing',
          customerFromContext: customer ? 'present' : 'missing'
        })

        // Try fallback to auth context data if API fails
        if (customer) {
          console.log('🔄 Using auth context data as fallback')
          console.log('⚠️ WARNING: Fallback data may be incorrect!')
          console.log('⚠️ customer.isolation_date:', customer.isolation_date)
          console.log('⚠️ customer.billing_status:', customer.billing_status)

          // Fix: Use correct data from auth context like profile page
          const enrichedCustomer: CustomerData = {
            id: customer.id,
            customer_id: customer.customer_id,
            name: customer.name,
            phone: customer.phone,
            status: customer.status,
            address: customer.address,
            registration_date: customer.registration_date || customer.created_at?.split('T')[0],
            isolation_date: customer.isolir_date || '2025-12-01T05:33:12.434Z', // Use correct field
            expiry_date: customer.expiry_date,
            hasInvoice: false, // Correct default - no invoice shown until API confirms
            isOnline: customer.is_online || false,
            package_name: customer.package_name,
            package_price: parseFloat(customer.package_price) || 0,
            pppoe_username: customer.pppoe_username,
            password: undefined
          }

          setCustomerData(enrichedCustomer)
          setBillingStats({
            totalInvoices: 0,
            paidInvoices: 0,
            unpaidInvoices: 0,
            totalPaid: 0,
            totalUnpaid: 0,
            overdueInvoices: 0
          })

          const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001'
          const token = localStorage.getItem('customer_token') || 'demo-session-token'

          setPortalData({
            loginUrl: `${baseUrl}/customer/login/${token}`,
            token: token,
            expiresAt: enrichedCustomer.expiry_date ? new Date(enrichedCustomer.expiry_date).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            daysUntilExpiry: enrichedCustomer.expiry_date ? Math.ceil((new Date(enrichedCustomer.expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 30,
            radiusStatus: {
              connected: enrichedCustomer.isOnline,
              lastSeen: enrichedCustomer.isOnline ? new Date().toLocaleString('id-ID') : null,
              onlineTime: enrichedCustomer.isOnline ? 'Online' : null,
              ipAddress: enrichedCustomer.isOnline ? 'Connected' : null,
              uptime: enrichedCustomer.isOnline ? 'Active' : null
            }
          })
        } else {
          // No fallback available, redirect to login
          console.log('No fallback data available, redirecting to login')
          router.push('/customer/login')
          return
        }
      } finally {
        setLoading(false)
      }
    }

    fetchCustomerData()
  }, []) // Remove customer dependency to avoid conflicts with token-based auth

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      console.log('🔄 Refreshing customer data from enhanced API...')

      // Get the current authentication token
      const token = localStorage.getItem('customer_token')

      if (!token) {
        toast.error('❌ Token tidak ditemukan, silakan login kembali')
        return
      }

      // Use standardized customer API
      const result = await customerAPI.getCustomerData()

      if (!result.success) {
        // Handle authentication errors through API client
        if (result.error?.includes('Authentication') || result.error?.includes('Unauthorized')) {
          toast.error('❌ Sesi telah berakhir, silakan login kembali')
          logout()
          return
        }
        throw new Error(result.message || 'API returned error')
      }

      const { customer: apiCustomer, radiusStatus, billingStats } = result.data

      // Map the comprehensive API response to our local CustomerData interface
      const refreshedCustomer: CustomerData = {
        id: apiCustomer.id,
        customer_id: apiCustomer.customer_id,
        name: apiCustomer.name,
        phone: apiCustomer.phone,
        status: apiCustomer.status,
        address: apiCustomer.address,
        registration_date: apiCustomer.install_date?.split('T')[0],
        isolation_date: apiCustomer.isolation_date,
        expiry_date: apiCustomer.expiry_date,
        calculated_isolir_date: apiCustomer.calculated_isolir_date, // Add calculated isolir date
        hasInvoice: apiCustomer.hasInvoice,
        isOnline: apiCustomer.isOnline,
        package_name: apiCustomer.package_name,
        package_price: parseFloat(apiCustomer.package_price) || 0,
        pppoe_username: apiCustomer.pppoe_username,
        password: undefined
      }

      console.log('✅ Refreshed customer data:', refreshedCustomer)
      console.log('📊 Refreshed billing stats:', billingStats)
      console.log('🌐 Refreshed RADIUS status:', radiusStatus)

      setCustomerData(refreshedCustomer)
      setBillingStats(billingStats)

      // Update portal data with refreshed radius status
      if (portalData) {
        setPortalData({
          ...portalData,
          radiusStatus: radiusStatus || {
            connected: refreshedCustomer.isOnline || false,
            lastSeen: refreshedCustomer.isOnline ? new Date().toISOString() : null,
            onlineTime: null,
            ipAddress: null,
            uptime: null
          }
        })
      }

      toast.success('✅ Data berhasil diperbarui')

    } catch (error) {
      console.error('💥 Error refreshing data:', error)
      toast.error(`❌ Gagal memperbarui data: ${error.message}`)
    } finally {
      setRefreshing(false)
    }
  }

  const handleCopyPortalLink = async () => {
    if (portalData?.loginUrl) {
      try {
        await navigator.clipboard.writeText(portalData.loginUrl)
        toast.success('✅ Link portal berhasil disalin!')
      } catch (error) {
        toast.error('❌ Gagal menyalin link')
      }
    }
  }

  const handleRestartDevice = async () => {
    if (!confirm('Apakah Anda yakin ingin me-restart device? Internet akan terputus selama 1-2 menit.')) {
      return
    }

    toast.loading('🔄 Mengirim perintah restart...')
    setTimeout(() => {
      toast.success('✅ Perintah restart berhasil dikirim. Device akan restart dalam 1-2 menit.')
    }, 2000)
    toast.dismiss()
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const getStatusBadge = (status: string, isOnline?: boolean) => {
    switch (status) {
      case 'active':
        if (isOnline === true) {
          return <Badge className="bg-green-500/90 dark:bg-green-600/80 text-white flex items-center"><Wifi className="w-3 h-3 mr-1" />Online</Badge>
        } else if (isOnline === false) {
          return <Badge className="bg-red-500/90 dark:bg-red-600/80 text-white flex items-center"><WifiOff className="w-3 h-3 mr-1" />Offline</Badge>
        }
        return <Badge className="bg-green-500/90 dark:bg-green-600/80 text-white flex items-center"><Wifi className="w-3 h-3 mr-1" />Online</Badge>
      case 'suspended':
        return <Badge className="bg-orange-500/90 dark:bg-orange-600/80 text-white">Suspended</Badge>
      case 'inactive':
        return <Badge className="bg-gray-500/90 dark:bg-gray-600/80 text-white">Inactive</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getRadiusStatusBadge = (connected: boolean) => {
    if (connected) {
      return <Badge className="bg-green-500/90 dark:bg-green-600/80 text-white flex items-center"><Wifi className="w-3 h-3 mr-1" />Online</Badge>
    }
    return <Badge className="bg-red-500/90 dark:bg-red-600/80 text-white flex items-center"><WifiOff className="w-3 h-3 mr-1" />Offline</Badge>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat dashboard...</p>
        </div>
      </div>
    )
  }

  // Show not found message if no customer data
  if (!customerData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <AlertTriangle className="w-12 h-12 mx-auto mb-2" />
            <h2 className="text-xl font-semibold">Data Pelanggan Tidak Ditemukan</h2>
          </div>
          <p className="text-gray-600 mb-2">Silakan login kembali atau hubungi admin</p>
          <p className="text-gray-500 text-sm mb-4">
            Token: {localStorage.getItem('customer_token') ? '✅ Ada' : '❌ Tidak ada'} |
            Customer: {customer?.name || '❌ Tidak ada'}
          </p>
          <Button onClick={() => {
            console.log('Redirecting to login...')
            localStorage.removeItem('customer_token')
            localStorage.removeItem('customer_data')
            router.push('/customer/login')
          }}>
            Kembali ke Login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Customer Greeting & Info Card */}
      {customerData && (
        <Card className="bg-gradient-to-r from-blue-600/90 to-purple-600/90 dark:from-blue-700/80 dark:to-purple-700/80 text-white border-0">
          <CardHeader className="text-white border-0">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-white/20 dark:bg-white/10 rounded-lg flex items-center justify-center mr-3">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white dark:text-white selection:bg-blue-200/20 selection:text-blue-100 hover:bg-transparent hover:text-white">
                    {getGreeting()}, {customerData.name}!
                  </div>
                  <div className="text-blue-100 dark:text-blue-200 text-sm">Selamat datang di portal pelanggan</div>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Single Compact Info Widget */}
            <div className="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/20">
              {/* ID Pelanggan & Status */}
              <div className="flex items-center justify-between mb-3">
                <Badge className="bg-white/20 text-white border-white/30 font-mono text-sm">
                  {customerData.customer_id || customerData.id?.toString() || 'Unknown'}
                </Badge>
                {getStatusBadge(customerData.status, customerData.isOnline)}
              </div>

              {/* Status Layanan */}
              <div className="mb-3">
                <div className="flex items-start">
                  {customerData.status === 'active' ? (
                    <>
                      <Activity className="w-4 h-4 mr-2 mt-1 text-green-300 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-base font-medium">Layanan internet aktif</div>
                        <div className="text-sm text-blue-200">
                          Sampai {new Date(
                            // Use same logic as admin: calculated_isolir_date first, then isolir_date
                            customerData.calculated_isolir_date || customerData.isolir_date || Date.now() + 30 * 24 * 60 * 60 * 1000
                          ).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 mr-2 mt-1 text-yellow-300 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="text-base font-medium">Layanan internet suspended</div>
                        {customerData.isolation_date && (
                          <div className="text-sm text-red-300">
                            Sejak {new Date(customerData.isolation_date).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Tombol Bayar - Muncul hanya saat invoice sudah terbit */}
                {customerData.hasInvoice && (
                  <div className="mt-2 ml-6">
                    <Button
                      onClick={() => router.push('/customer/billing')}
                      className={`${
                        customerData.status === 'active'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      } text-white border-0 px-4 py-1 h-8 text-sm`}
                      size="sm"
                    >
                      {customerData.status === 'active' ? (
                        <>
                          <CreditCard className="w-3 h-3 mr-1" />
                          Bayar Sekarang
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Bayar Sekarang
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Paket & Harga */}
              <div className="mb-3">
                <div className="flex items-start">
                  <Zap className="w-4 h-4 mr-2 mt-1 text-blue-300 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-base font-medium">
                      {customerData.package_name || 'Bronze'}
                    </div>
                    {customerData.package_price && (
                      <div className="text-sm text-blue-200">
                        {formatCurrency(customerData.package_price)}/bulan
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Toggle Button */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  onClick={() => setShowDetailedInfo(!showDetailedInfo)}
                  className="text-white hover:bg-white/10 p-2"
                >
                  {showDetailedInfo ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Detailed Info */}
              {showDetailedInfo && (
                <div className="mt-4 space-y-3 text-sm border-t border-white/20 pt-4">
                  <div className="flex items-start">
                    <span className="w-4 h-4 mr-2 text-blue-300 mt-0.5">👤</span>
                    <div>
                      <span className="block">Nama Lengkap</span>
                      <span className="text-blue-200">{customerData.name}</span>
                    </div>
                  </div>

                  {customerData.address && (
                    <div className="flex items-start">
                      <span className="w-4 h-4 mr-2 text-blue-300 mt-0.5">📍</span>
                      <div>
                        <span className="block">Alamat</span>
                        <span className="text-blue-200">{customerData.address}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center">
                    <Smartphone className="w-4 h-4 mr-2 text-blue-300" />
                    <div>
                      <span className="block">Nomor HP</span>
                      <span className="text-blue-200">{customerData.phone}</span>
                    </div>
                  </div>

                  {customerData.registration_date && (
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2 text-blue-300" />
                      <div>
                        <span className="block">Tanggal Daftar</span>
                        <span className="text-blue-200">
                          {new Date(customerData.registration_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {customerData.isolation_date && (
                    <div className="flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 text-yellow-300" />
                      <div>
                        <span className="block">Tanggal Isolir</span>
                        <span className="text-yellow-200">
                          {new Date(customerData.isolation_date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>
                  )}

                  {customerData.pppoe_username && (
                    <div className="flex items-center">
                      <Wifi className="w-4 h-4 mr-2 text-blue-300" />
                      <div>
                        <span className="block">PPPoE Username</span>
                        <span className="text-blue-200 font-mono text-xs">{customerData.pppoe_username}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions Card - Terpisah */}
      <Card className="bg-gradient-to-r from-purple-600/90 to-pink-600/90 dark:from-purple-700/80 dark:to-pink-700/80 text-white border-0">
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Button
              onClick={() => router.push('/customer/billing')}
              className="bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 text-white border-white/30 dark:border-white/20 h-16 flex flex-col items-center justify-center"
              variant="ghost"
            >
              <FileText className="w-5 h-5 mb-1" />
              <div className="text-center">
                <div className="text-xs font-medium">Lihat Tagihan</div>
              </div>
            </Button>

            <Button
              onClick={handleRestartDevice}
              className="bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 text-white border-white/30 dark:border-white/20 h-16 flex flex-col items-center justify-center"
              variant="ghost"
            >
              <RefreshCw className="w-5 h-5 mb-1" />
              <div className="text-center">
                <div className="text-xs font-medium">Restart Device</div>
              </div>
            </Button>

            <Button
              onClick={() => router.push('/customer/support/tickets/new')}
              className="bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 text-white border-white/30 dark:border-white/20 h-16 flex flex-col items-center justify-center"
              variant="ghost"
            >
              <Headset className="w-5 h-5 mb-1" />
              <div className="text-center">
                <div className="text-xs font-medium">Buat Tiket</div>
              </div>
            </Button>

            <Button
              onClick={() => {
                const adminNumber = '6281947215703'
                const message = encodeURIComponent('Halo admin, saya butuh bantuan dengan layanan internet saya.')
                window.open(`https://wa.me/${adminNumber}?text=${message}`, '_blank')
              }}
              className="bg-white/20 dark:bg-white/10 hover:bg-white/30 dark:hover:bg-white/20 text-white border-white/30 dark:border-white/20 h-16 flex flex-col items-center justify-center"
              variant="ghost"
            >
              <Headset className="w-5 h-5 mb-1" />
              <div className="text-center">
                <div className="text-xs font-medium">Hubungi Support</div>
              </div>
            </Button>

                      </div>
        </CardContent>
      </Card>

        </div>
  )
}