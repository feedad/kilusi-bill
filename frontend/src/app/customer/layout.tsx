'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { customerAPI } from '@/lib/customer-api'
import CustomerAuth from '@/lib/customer-auth'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LogOut,
  FileText,
  Wifi,
  Headset,
  User,
  Bell,
  Home,
  ChevronDown,
  UserCircle,
  CreditCard,
  Smartphone,
  Mail,
  MapPin,
  Sun,
  Moon,
  Router,
  Settings,
  Gift
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext'
import BroadcastBanner from '@/components/customer/BroadcastBanner'

interface CustomerLayoutProps {
  children: React.ReactNode
}

function CustomerLayoutContent({
  children,
}: CustomerLayoutProps) {
  const [title] = useState<string>('')
  const [showNavigation] = useState<boolean>(true)
  const router = useRouter()
  const pathname = usePathname()
  const { customer, logout, regenerateToken, isAuthenticated, loading } = useCustomerAuth()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [customerData, setCustomerData] = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Set auth checked when loading is complete
    console.log('🔑 Layout: Loading state changed:', { loading, isAuthenticated })
    if (!loading) {
      setAuthChecked(true)
      console.log('🔑 Layout: Auth checked = true, isAuthenticated:', isAuthenticated)
    }
  }, [loading, isAuthenticated])

  useEffect(() => {
    // Generate portal URL when customer data is available
    if (customer && authChecked) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      const token = localStorage.getItem('customer_token')
      setPortalUrl(`${baseUrl}/customer/login/${token}`)

      // Fetch comprehensive customer data for profile dropdown
      const fetchCustomerData = async () => {
        try {
          console.log('🔄 Layout Debug - Fetching customer data for dropdown...')
          console.log('🔄 Layout Debug - Current customer from context:', customer)

          // Use same method as portal page - CustomerAuth.apiRequest
          const result = await CustomerAuth.apiRequest('/api/v1/customer-auth-nextjs/get-customer-data')

          console.log('📡 Layout Debug - Full API result:', result)
          console.log('📡 Layout Debug - result.success:', result.success)
          console.log('📡 Layout Debug - result.data:', result.data)
          console.log('📡 Layout Debug - result.data.customer:', result.data?.customer)

          if (result.success && result.data?.customer) {
            console.log('✅ Layout Debug - Customer data fetched successfully:', result.data.customer)
            console.log('✅ Layout Debug - result.data.customer.customer_id:', result.data.customer.customer_id)
            setCustomerData(result.data.customer)
          } else {
            console.log('❌ Layout Debug - Failed to fetch customer data:', result)
            console.log('🔄 Layout Debug - Using localStorage fallback...')

            // Fallback to localStorage data (which has correct customer_id)
            const storedCustomer = CustomerAuth.getCurrentCustomer()
            if (storedCustomer) {
              console.log('✅ Layout Debug - Using localStorage customer data:', storedCustomer)
              setCustomerData(storedCustomer)
            } else {
              console.log('❌ Layout Debug - No fallback data available')
            }
          }
        } catch (error) {
          console.error('❌ Layout Debug - Error fetching customer data for dropdown:', error)
          console.log('🔄 Layout Debug - Using localStorage fallback due to API error...')

          // Fallback to localStorage data on error
          const storedCustomer = CustomerAuth.getCurrentCustomer()
          if (storedCustomer) {
            console.log('✅ Layout Debug - Using localStorage customer data as fallback:', storedCustomer)
            setCustomerData(storedCustomer)
          } else {
            console.log('❌ Layout Debug - No fallback data available on error')
          }
        }
      }

      fetchCustomerData()

      // Fetch notifications
      fetchNotifications()
    }
  }, [customer])

  // Separate effect to ensure customer data is always fetched, especially after refresh
  useEffect(() => {
    // Also fetch if we have a token but no customerData yet (covers refresh scenario)
    const token = localStorage.getItem('customer_token')
    if (token && !customerData && authChecked) {
      console.log('🔄 Layout Debug - Token available but no customerData, fetching...')

      const fetchCustomerDataFallback = async () => {
        try {
          console.log('🔄 Layout Debug - Fallback fetching customer data...')

          // Use same method as portal page - CustomerAuth.apiRequest
          const result = await CustomerAuth.apiRequest('/api/v1/customer-auth-nextjs/get-customer-data')

          console.log('📡 Layout Debug - Fallback API result:', result)
          console.log('📡 Layout Debug - Fallback result.success:', result.success)
          console.log('📡 Layout Debug - Fallback result.data:', result.data)
          console.log('📡 Layout Debug - Fallback result.data.customer:', result.data?.customer)

          if (result.success && result.data?.customer) {
            console.log('✅ Layout Debug - Fallback customer data fetched successfully:', result.data.customer)
            setCustomerData(result.data.customer)
          } else {
            console.log('❌ Layout Debug - Fallback failed, using localStorage...')

            // Fallback to localStorage data
            const storedCustomer = CustomerAuth.getCurrentCustomer()
            if (storedCustomer) {
              console.log('✅ Layout Debug - Using localStorage customer data as fallback:', storedCustomer)
              setCustomerData(storedCustomer)
            } else {
              console.log('❌ Layout Debug - No fallback data available')
            }
          }
        } catch (error) {
          console.error('❌ Layout Debug - Error in fallback fetch:', error)

          // Fallback to localStorage data on error
          const storedCustomer = CustomerAuth.getCurrentCustomer()
          if (storedCustomer) {
            console.log('✅ Layout Debug - Using localStorage customer data due to fallback error:', storedCustomer)
            setCustomerData(storedCustomer)
          }
        }
      }

      fetchCustomerDataFallback()
    }
  }, [authChecked, customerData])

  // Debug: Log when customer context changes
  useEffect(() => {
    console.log('🔍 Layout Debug - Customer context changed:', customer)
  }, [customer])

  // Debug: Log when customerData changes
  useEffect(() => {
    console.log('🔍 Layout Debug - CustomerData state changed:', customerData)
  }, [customerData])

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      // Get customer ID from stored data or use a reasonable default
      const customerId = customer?.id || 1 // Fallback to 1 if customer ID not available

      const result = await customerAPI.getNotifications(customerId)

      if (result.success) {
        setNotifications(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      // Set some default notifications for demo
      setNotifications([
        {
          id: 1,
          type: 'payment',
          title: 'Pembayaran Berhasil',
          message: 'Pembayaran tagihan November telah terverifikasi',
          date: '2025-11-22',
          read: false
        },
        {
          id: 2,
          type: 'maintenance',
          title: 'Pemeliharaan Jaringan',
          message: 'Jadwal maintenance: 23 Nov 2025, pukul 02:00-04:00 WIB',
          date: '2025-11-21',
          read: true
        }
      ])
    }
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userDropdownOpen) {
        const target = event.target as Element
        if (!target.closest('.user-dropdown')) {
          setUserDropdownOpen(false)
        }
      }
      if (notificationDropdownOpen) {
        const target = event.target as Element
        if (!target.closest('.notification-dropdown')) {
          setNotificationDropdownOpen(false)
        }
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [userDropdownOpen, notificationDropdownOpen])

  // Close sidebar on ESC key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }

    if (sidebarOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sidebarOpen])

  
  const handleRegenerateToken = async () => {
    const result = await regenerateToken()
    if (result) {
      toast.success('✅ Token berhasil diperbarui')
      setPortalUrl(result.loginUrl)
    } else {
      toast.error('❌ Gagal memperbarui token')
    }
  }

  const handleMarkNotificationRead = (notificationId: number) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    )
  }

  const getUnreadCount = () => {
    return notifications.filter(n => !n.read).length
  }

  const navigation = [
    {
      name: 'Dashboard',
      href: '/customer/portal',
      icon: Home,
      current: pathname === '/customer/portal'
    },
    {
      name: 'Tagihan',
      href: '/customer/billing',
      icon: FileText,
      current: pathname?.startsWith('/customer/billing') || false
    },
    {
      name: 'Referral',
      href: '/customer/referrals',
      icon: Gift,
      current: pathname === '/customer/referrals'
    },
    {
      name: 'Setting Perangkat',
      href: '/customer/settings/device',
      icon: Router,
      current: pathname === '/customer/settings/device'
    },
    {
      name: 'Support',
      href: '/customer/support',
      icon: Headset,
      current: pathname?.startsWith('/customer/support') || false
    }
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">Aktif</Badge>
      case 'suspended':
        return <Badge className="bg-orange-500">Suspended</Badge>
      case 'inactive':
        return <Badge className="bg-gray-500">Inactive</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header - Show loading skeleton or actual header */}
      {!authChecked ? (
        // Loading skeleton header
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 transition-colors animate-pulse">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-lg mr-3"></div>
                <div>
                  <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-32 mb-2"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-8"></div>
                <div className="h-8 w-8 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
              </div>
            </div>
          </div>
        </header>
      ) : (isAuthenticated || (localStorage.getItem('customer_token') && localStorage.getItem('customer_data'))) && (
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Mobile menu button */}
              <button
                onClick={() => {
                  setSidebarOpen(!sidebarOpen)
                }}
                className="lg:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle navigation menu"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Logo and Title */}
              <div className="flex items-center">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg mr-3"></div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Portal Pelanggan</h1>
                    {title && <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>}
                  </div>
                </div>
              </div>

              {/* Desktop Navigation */}
              {showNavigation && (
                <nav className="hidden lg:flex items-center space-x-8">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center text-sm font-medium transition-colors ${
                        item.current
                          ? 'text-blue-600'
                          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <item.icon className="w-4 h-4 mr-2" />
                      {item.name}
                    </Link>
                  ))}
                </nav>
              )}

              {/* User Menu */}
              <div className="flex items-center space-x-4">
                {/* Theme Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleTheme}
                  className="hidden lg:flex items-center"
                  title="Toggle theme"
                >
                  {theme === 'light' ? (
                    <Moon className="w-4 h-4" />
                  ) : (
                    <Sun className="w-4 h-4" />
                  )}
                </Button>

                {/* Notifications */}
                <div className="relative notification-dropdown">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNotificationDropdownOpen(!notificationDropdownOpen)}
                    className="relative"
                    title="Notifications"
                  >
                    <Bell className="w-4 h-4" />
                    {getUnreadCount() > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {getUnreadCount()}
                      </span>
                    )}
                  </Button>

                  {/* Notification Dropdown */}
                  {notificationDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 max-h-96 overflow-y-auto">
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifikasi</h3>
                      </div>

                      {notifications.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                          Tidak ada notifikasi
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                              !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            }`}
                            onClick={() => handleMarkNotificationRead(notification.id)}
                          >
                            <div className="flex items-start">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {notification.title}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                  {notification.date}
                                </p>
                              </div>
                              {!notification.read && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* User Dropdown - Desktop only */}
                <div className="relative user-dropdown hidden lg:block">
                  <Button
                    variant="ghost"
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <User className="w-4 h-4" />
                    <span className="hidden sm:block text-sm font-medium">
                      {customer?.name || 'Pelanggan'}
                    </span>
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {customer?.name?.charAt(0).toUpperCase() || 'P'}
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>

                  {/* Dropdown Menu */}
                  {userDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
                      {/* Customer Info Section */}
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-lg font-medium">
                              {customer?.name?.charAt(0).toUpperCase() || 'P'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {customer?.name || 'Pelanggan'}
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge className="text-xs">
                                {(() => {
                                  console.log('🔍 Badge Debug - customerData.customer_id:', customerData?.customer_id);
                                  console.log('🔍 Badge Debug - customer.customer_id:', customer?.customer_id);
                                  console.log('🔍 Badge Debug - customer.id:', customer?.id);

                                  // Try to get customer_id from localStorage as fallback
                                  const localStorageCustomer = typeof window !== 'undefined'
                                    ? JSON.parse(localStorage.getItem('customer_data') || '{}')
                                    : {};

                                  console.log('🔍 Badge Debug - localStorage customer:', localStorageCustomer);

                                  // Debug API response first
                                  console.log('🔍 Badge Debug - Full customerData object:', customerData);
                                  console.log('🔍 Badge Debug - customerData keys:', customerData ? Object.keys(customerData) : 'null');

                                  // Prioritize customer_id with database fallback
                                  let displayId;
                                  if (customerData?.customer_id && customerData.customer_id !== customerData.id?.toString()) {
                                    displayId = customerData.customer_id;
                                  } else if (customer?.customer_id && customer.customer_id !== customer.id?.toString()) {
                                    displayId = customer.customer_id;
                                  } else if (localStorageCustomer?.customer_id && localStorageCustomer.customer_id !== localStorageCustomer.id?.toString()) {
                                    displayId = localStorageCustomer.customer_id;
                                  } else {
                                    displayId = `CUS${customer?.id?.toString().padStart(5, '0') || '00000'}`;
                                  }

                                  console.log('🔍 Badge Debug - Final display ID:', displayId);
                                  return displayId;
                                })()}
                              </Badge>
                              {getStatusBadge(customerData?.status || customer?.status)}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Customer Details */}
                      <div className="px-4 py-3 space-y-2 border-b border-gray-200 dark:border-gray-700">
                        {customerData?.package_name && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center text-gray-600 dark:text-gray-400">
                              <CreditCard className="w-4 h-4 mr-2" />
                              <span>Paket</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-white">{customerData.package_name}</span>
                          </div>
                        )}

                        {customerData?.phone && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center text-gray-600 dark:text-gray-400">
                              <Smartphone className="w-4 h-4 mr-2" />
                              <span>Telepon</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-white">{customerData.phone}</span>
                          </div>
                        )}

                        {customerData?.email && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center text-gray-600 dark:text-gray-400">
                              <Mail className="w-4 h-4 mr-2" />
                              <span>Email</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-white truncate max-w-[180px]">{customerData.email}</span>
                          </div>
                        )}

                        {customerData?.address && (
                          <div className="flex items-start text-sm">
                            <div className="flex items-center text-gray-600 dark:text-gray-400 mt-0.5">
                              <MapPin className="w-4 h-4 mr-2" />
                              <span>Alamat</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-white ml-auto text-right max-w-[180px] truncate">{customerData.address}</span>
                          </div>
                        )}
                      </div>

                      {/* Menu Actions */}
                      <div className="py-2">
                        <Link
                          href="/customer/settings/profile"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <UserCircle className="w-4 h-4 mr-3" />
                          My Profile
                        </Link>

                        <Link
                          href="/customer/settings/device"
                          onClick={() => setUserDropdownOpen(false)}
                          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <Router className="w-4 h-4 mr-3" />
                          Setting Perangkat
                        </Link>

                        <button
                          onClick={() => {
                            if (confirm('Apakah Anda yakin ingin keluar?')) {
                              logout()
                              router.push('/customer/login')
                            }
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <LogOut className="w-4 h-4 mr-3" />
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                </div>
            </div>
          </div>
        </header>
      )}

      {/* Mobile Navigation Sidebar - Only show when authenticated */}
      {(isAuthenticated || (localStorage.getItem('customer_token') && localStorage.getItem('customer_data'))) && sidebarOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Mobile Sidebar */}
          <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out lg:hidden">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg mr-3"></div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Portal Pelanggan</h1>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Theme Toggle (Mobile) */}
              <div className="px-4 py-3 border-b dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleTheme}
                  className="w-full justify-start"
                >
                  {theme === 'light' ? (
                    <>
                      <Moon className="w-4 h-4 mr-2" />
                      Mode Gelap
                    </>
                  ) : (
                    <>
                      <Sun className="w-4 h-4 mr-2" />
                      Mode Terang
                    </>
                  )}
                </Button>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-4 space-y-2">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      item.current
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-r-2 border-blue-600'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <item.icon className="w-4 h-4 mr-3" />
                    {item.name}
                  </Link>
                ))}
              </nav>

              {/* Profile Menu - Mobile Only */}
              <div className="px-4 py-2 border-t dark:border-gray-700 lg:hidden">
                <Link
                  href="/customer/settings/profile"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <UserCircle className="w-4 h-4 mr-3" />
                  Profile Saya
                </Link>
                <Link
                  href="/customer/settings/device"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <Settings className="w-4 h-4 mr-3" />
                  Pengaturan Perangkat
                </Link>
                <Link
                  href="/customer/billing"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <FileText className="w-4 h-4 mr-3" />
                  Tagihan & Pembayaran
                </Link>
                <Link
                  href="/customer/support"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <Headset className="w-4 h-4 mr-3" />
                  Bantuan Teknis
                </Link>
              </div>

              {/* Logout Button */}
              <div className="p-4 border-t dark:border-gray-700">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm('Apakah Anda yakin ingin keluar?')) {
                      logout()
                      router.push('/customer/login')
                    }
                  }}
                  className="w-full justify-start"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Keluar
                </Button>
              </div>

              {/* User Info Footer */}
              {customer && (
                <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {customer.name?.charAt(0).toUpperCase() || 'P'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {customer.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {customer.phone}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      {(isAuthenticated || (localStorage.getItem('customer_token') && localStorage.getItem('customer_data'))) ? (
        <main className="flex-1">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Broadcast Banner */}
            <BroadcastBanner
              customerId={customer?.id}
              customerRegion={customer?.region}
              className="mb-6"
              autoRefresh={true}
              refreshInterval={30}
            />

            {/* Page Content */}
            {children}
          </div>
        </main>
      ) : (
        <main className="flex-1">
          {/* Page Content - Show without styling when not authenticated */}
          {children}
        </main>
      )}
    </div>
  )
}

export default function CustomerLayout({
  children,
}: CustomerLayoutProps) {
  return (
    <CustomerAuthProvider>
      <CustomerLayoutContent>
        {children}
      </CustomerLayoutContent>
    </CustomerAuthProvider>
  )
}