'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Wifi,
  WifiOff,
  AlertTriangle,
  Zap,
  CreditCard,
  RefreshCw,
  Smartphone,
  Calendar,
  ChevronDown,
  ChevronUp,
  Ticket,
  Globe,
  Home,
  Building2,
  MapPin,
  Clock,
  ArrowRightLeft,
  CheckCircle2
} from 'lucide-react'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { customerAPI } from '@/lib/customer-api'
import CustomerAuth, { Customer } from '@/lib/customer-auth'

interface CustomerData extends Customer {
  accounts?: Customer[]
  registration_date?: string
  isolation_date?: string
  expiry_date?: string
  calculated_isolir_date?: string
  service_id?: string | number
  hasInvoice?: boolean
  isOnline?: boolean
  package_price?: number // ensure type override if needed
}

interface BillingStats {
  totalInvoices: number
  paidInvoices: number
  unpaidInvoices: number
  totalPaid: number
  totalUnpaid: number
  overdueInvoices: number
}

interface UsageStats {
  total_usage: number
  download: number
  upload: number
  usage_percentage: number
  limit: number
}

interface RadiusStatus {
  connected: boolean
  lastSeen?: string
  onlineTime?: string
  ipAddress?: string
  uptime?: string
}

export default function CustomerPortal() {
  const router = useRouter()
  const { customer, loginWithToken } = useCustomerAuth()
  const [customerData, setCustomerData] = useState<CustomerData | null>(null)
  const [availableAccounts, setAvailableAccounts] = useState<Customer[]>([])
  const [billingStats, setBillingStats] = useState<BillingStats>({
    totalInvoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    overdueInvoices: 0
  })
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [radiusStatus, setRadiusStatus] = useState<RadiusStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [showDetailedInfo, setShowDetailedInfo] = useState(false)

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 10) return 'Selamat Pagi'
    if (hour < 15) return 'Selamat Siang'
    if (hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  }

  const fetchCustomerData = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('customer_token')

      if (!token) {
        router.push('/customer/login')
        return
      }

      // Check for available accounts in localStorage
      // We prioritize the persistent storage we created in CustomerAuth
      const storedAccounts = CustomerAuth.getAccounts()
      const storedCustomer = CustomerAuth.getCurrentCustomer()

      if (storedAccounts.length > 0) {
        setAvailableAccounts(storedAccounts)
      } else if (storedCustomer?.accounts && storedCustomer.accounts.length > 0) {
        setAvailableAccounts(storedCustomer.accounts)
      } else if (storedCustomer) {
        // If no list found, at least show current
        setAvailableAccounts([storedCustomer])
      }

      const result = await customerAPI.getCustomerData()

      if (!result.success) {
        if (result.error?.includes('Authentication') || result.error?.includes('Unauthorized')) {
          CustomerAuth.logout()
          router.push('/customer/login')
          return
        }
        throw new Error(result.message || 'API returned error')
      }

      const { customer: apiCustomer, radiusStatus: apiRadius, billingStats: apiBilling, usageStats: apiUsage } = result.data

      const enrichedCustomer: CustomerData = {
        ...apiCustomer,
        registration_date: apiCustomer.install_date?.split('T')[0],
        package_price: parseFloat(apiCustomer.package_price) || 0,
        // Preserve accounts list from persistence if API doesn't return it
        accounts: (apiCustomer.accounts && apiCustomer.accounts.length > 0)
          ? apiCustomer.accounts
          : storedAccounts
      }

      setCustomerData(enrichedCustomer)
      setBillingStats(apiBilling)
      setRadiusStatus(apiRadius)
      setUsageStats(apiUsage)

      // Update available accounts and persistence if API returned new list
      if (enrichedCustomer.accounts && enrichedCustomer.accounts.length > 0) {
        setAvailableAccounts(enrichedCustomer.accounts)
        // Update persistent storage
        CustomerAuth.setAccounts(enrichedCustomer.accounts)
      } else if (storedAccounts.length > 0) {
        // If API didn't return accounts but we have them stored, keep them in state
        setAvailableAccounts(storedAccounts)
      }

    } catch (error: any) {
      console.error('Error fetching data:', error)
      // Fallback
      if (customer) {
        setCustomerData({
          ...customer,
          package_price: parseFloat(customer.package_price?.toString() || '0')
        })
        if (customer.accounts) setAvailableAccounts(customer.accounts)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCustomerData()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchCustomerData()
    setRefreshing(false)
    toast.success('Data diperbarui')
  }

  const handleSwitchAccount = async (targetId: number) => {
    if (!customerData?.id || targetId === customerData.id) return

    setSwitching(true)
    const toastId = toast.loading('Memindahkan akun...')

    try {
      const res = await customerAPI.switchAccount(targetId)

      if (res.success && res.data) {
        // Update credentials
        // IMPORTANT: We must preserve the accounts list before setting new auth data
        // because the switch-account endpoint might not return the full list of linked accounts
        const currentAccounts = CustomerAuth.getAccounts()

        // If the response includes accounts, use them, otherwise keep existing
        if (res.data.customer.accounts && res.data.customer.accounts.length > 0) {
          CustomerAuth.setAccounts(res.data.customer.accounts)
        } else if (currentAccounts.length > 0) {
          // Inject existing accounts into the new customer object for consistency
          res.data.customer.accounts = currentAccounts
        }

        CustomerAuth.setAuthData(res.data.customer, res.data.token)

        // Reload page to ensure clean state
        window.location.reload()
      } else {
        toast.error('Gagal berpindah akun')
      }
    } catch (error) {
      console.error('Switch account error:', error)
      toast.error('Gagal berpindah akun')
    } finally {
      toast.dismiss(toastId)
      setSwitching(false)
    }
  }

  const handleRestartDevice = async () => {
    if (!confirm('Reboot perangkat? Koneksi akan terputus sebentar.')) return
    toast.loading('Mengirim perintah...')
    setTimeout(() => {
      toast.dismiss()
      toast.success('Perangkat sedang restart')
    }, 2000)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
  }

  if (!customerData) return null

  // Calculate usage
  const totalUsageBytes = usageStats?.total_usage || 0
  const limitBytes = usageStats?.limit || 0

  // If unlimited (0), use 100% full ring if usage > 0, else 0%
  // Or visual scale relative to 500GB if unlimited just for reference (optional), but safer to just show full ring if unlimited.
  const displayPercentage = limitBytes > 0
    ? Math.min((totalUsageBytes / limitBytes) * 100, 100)
    : (totalUsageBytes > 0 ? 100 : 0) // Full circle if active

  const usageDisplay = formatBytes(totalUsageBytes)
  const limitDisplay = limitBytes > 0 ? formatBytes(limitBytes) : 'Unlimited'

  const usageColor = displayPercentage > 90 && limitBytes > 0 ? 'text-red-500' : 'text-blue-500'
  const usageStroke = displayPercentage > 90 && limitBytes > 0 ? '#ef4444' : '#3b82f6'

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">

      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{getGreeting()}, {customerData.name.split(' ')[0]}</h1>
          <p className="text-muted-foreground">Kelola semua layanan internet Anda dalam satu tempat.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Account Service Switcher (New Feature) */}
      {availableAccounts.length > 0 && (
        <div className="w-full overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-4 min-w-max">
            {availableAccounts.map((acc: any) => {
              // Robust active check: Compare against current customer id OR serviceId OR pppoe_username
              const isActive = customerData && (
                (acc.pppoe_username && customerData.pppoe_username && acc.pppoe_username === customerData.pppoe_username) ||
                String(acc.id) === String(customerData.id) ||
                (customerData.service_id && String(acc.id) === String(customerData.service_id))
              )

              return (
                <div
                  key={acc.id}
                  onClick={() => !isActive && handleSwitchAccount(acc.id)}
                  className={`
                        cursor-pointer transition-all duration-300 group
                        rounded-xl p-5 w-[310px] flex flex-col gap-3 relative overflow-hidden
                        ${isActive
                      ? 'bg-blue-600 text-white shadow-[0_20px_40px_-15px_rgba(59,130,246,0.5)] scale-[1.02] border-none'
                      : 'bg-[#1e293b]/40 text-slate-400 hover:bg-slate-800 border border-slate-700/50 opacity-70 hover:opacity-100'
                    }
                        ${switching ? 'opacity-50 pointer-events-none' : ''}
                      `}
                >
                  {/* Managed Header */}
                  <div className="flex justify-between items-start z-10">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg backdrop-blur-sm ${isActive ? 'bg-white/20' : 'bg-background/20'}`}>
                        {acc.package_name?.toLowerCase().includes('corporate') || acc.package_name?.toLowerCase().includes('bisnis')
                          ? <Building2 className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
                          : <Home className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
                        }
                      </div>
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-white/70' : 'opacity-60'}`}>No. Layanan</span>
                        <span className={`font-mono text-xl font-black tracking-tight ${isActive ? 'text-white' : 'text-primary'}`}>
                          #{acc.service_number || (acc.pppoe_username ? acc.pppoe_username.split('@')[0] : null) || `ID:${acc.id}`}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <div className="bg-white/20 text-white px-2 py-0.5 rounded-full text-[10px] font-black tracking-tighter shadow-sm">
                        DIKELOLA
                      </div>
                    )}
                  </div>

                  <div className="z-10 mt-1">
                    <h3 className={`font-bold text-lg truncate mb-0.5 ${isActive ? 'text-white' : ''}`}>
                      {acc.address ? acc.address.split(',')[0] : `Layanan #${acc.id}`}
                    </h3>
                    <div className={`flex items-center gap-2 text-sm font-medium ${isActive ? 'text-white/90' : 'opacity-80'}`}>
                      <Zap className={`w-4 h-4 ${isActive ? 'text-white' : 'text-yellow-400'}`} /> {acc.package_name || 'Paket Internet'}
                    </div>
                  </div>

                  {/* Connection Indicator */}
                  <div className={`flex items-center gap-2 text-xs font-semibold z-10 mt-auto pt-3 border-t ${isActive ? 'border-white/10' : 'border-muted/20'}`}>
                    <div className={`w-2 h-2 rounded-full ${acc.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`}></div>
                    <span className={isActive ? 'text-white' : (acc.status === 'active' ? 'text-green-500' : 'text-red-500')}>
                      {acc.status === 'active' ? 'Layanan Aktif' : 'Suspended'}
                    </span>

                    {isActive ? (
                      <div className="ml-auto flex items-center gap-1.5 text-white">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[10px] font-black tracking-tighter uppercase">Sedang Dikelola</span>
                      </div>
                    ) : (
                      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] uppercase font-bold text-primary italic">Pilih Layanan</span>
                        <ArrowRightLeft className="w-3 h-3 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Background Decoration */}
                  <div className="absolute -right-6 -bottom-6 opacity-10 rotate-12">
                    <Wifi className="w-32 h-32" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Left Column: Usage & Status */}
        <Card className="md:col-span-2 border-0 shadow-sm bg-gradient-to-br from-card to-accent/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="w-5 h-5 text-primary" /> Status Koneksi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">

              {/* Gauge Visualization */}
              <div className="relative w-48 h-48 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-muted/20" />
                  <circle cx="96" cy="96" r="88" stroke={usageStroke} strokeWidth="12" fill="transparent"
                    strokeDasharray={2 * Math.PI * 88}
                    strokeDashoffset={2 * Math.PI * 88 * (1 - displayPercentage / 100)}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-bold">
                    {limitBytes > 0 ? `${Math.round(displayPercentage)}%` : usageDisplay.split(' ')[0]}
                  </span>
                  <span className="text-xs text-muted-foreground">{limitBytes > 0 ? 'Used' : usageDisplay.split(' ')[1]}</span>
                  <span className="text-sm font-medium mt-1">{limitDisplay}</span>
                </div>
              </div>

              {/* Connection Details */}
              <div className="flex-1 w-full space-y-4">

                <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${customerData.isOnline ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {customerData.isOnline ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Status Modem</p>
                      <p className={`font-semibold ${customerData.isOnline ? 'text-green-600' : 'text-red-500'}`}>
                        {customerData.isOnline ? 'Online / Terhubung' : 'Offline / Terputus'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-background border">
                    <p className="text-xs text-muted-foreground mb-1">IP Address</p>
                    <p className="font-mono text-sm font-medium">{radiusStatus?.ipAddress || '-'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background border">
                    <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                    <p className="font-mono text-sm font-medium">{radiusStatus?.uptime || '-'}</p>
                  </div>
                </div>

              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Billing & Actions */}
        <div className="space-y-6">

          {/* Billing Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Tagihan Bulan Ini
                <CreditCard className="w-4 h-4 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mt-2">
                <span className="text-3xl font-bold tracking-tight">
                  {customerData.hasInvoice && billingStats?.unpaidInvoices > 0
                    ? formatCurrency(customerData.package_price)
                    : 'Rp 0'}
                </span>
                <p className="text-sm text-muted-foreground mt-1">
                  {customerData.hasInvoice && billingStats?.unpaidInvoices > 0
                    ? 'Belum dibayar'
                    : 'Lunas / Tidak ada tagihan'}
                </p>
              </div>

              {customerData.hasInvoice && billingStats?.unpaidInvoices > 0 && (
                <Button className="w-full mt-4 bg-green-600 hover:bg-green-700" onClick={() => router.push('/customer/billing')}>
                  Bayar Sekarang
                </Button>
              )}
              {billingStats?.unpaidInvoices <= 0 && (
                <Button variant="outline" className="w-full mt-4" onClick={() => router.push('/customer/billing')}>
                  Riwayat Tagihan
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aksi Cepat</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button variant="ghost" className="h-auto py-3 flex flex-col gap-2" onClick={handleRestartDevice}>
                <RefreshCw className="w-5 h-5 text-blue-500" />
                <span className="text-xs">Restart WiFi</span>
              </Button>
              <Button variant="ghost" className="h-auto py-3 flex flex-col gap-2" onClick={() => router.push('/customer/support/tickets/new')}>
                <Ticket className="w-5 h-5 text-purple-500" />
                <span className="text-xs">Buat Tiket</span>
              </Button>
              <Button variant="ghost" className="h-auto py-3 flex flex-col gap-2" onClick={() => router.push('/customer/settings/device')}>
                <Globe className="w-5 h-5 text-orange-500" />
                <span className="text-xs">Ganti Password</span>
              </Button>
              <Button variant="ghost" className="h-auto py-3 flex flex-col gap-2" onClick={() => setShowDetailedInfo(!showDetailedInfo)}>
                <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showDetailedInfo ? 'rotate-180' : ''}`} />
                <span className="text-xs">Detail Info</span>
              </Button>
            </CardContent>
          </Card>

        </div>

      </div>

      {/* Detailed Info Section (Collapsible) */}
      {showDetailedInfo && (
        <Card className="animate-in fade-in slide-in-from-top-4">
          <CardHeader>
            <CardTitle className="text-lg">Informasi Teknis</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Package ID</p>
              <p className="font-medium">{customerData.package_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">PPPoE Username</p>
              <p className="font-mono text-sm">{customerData.pppoe_username}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Lokasi</p>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                <p className="text-sm">{customerData.address}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Terdaftar Sejak</p>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm">
                  {customerData.registration_date
                    ? new Date(customerData.registration_date).toLocaleDateString('id-ID', { dateStyle: 'long' })
                    : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}