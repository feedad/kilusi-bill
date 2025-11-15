'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Users,
  Search,
  Plus,
  Download,
  Filter,
  Activity,
  DollarSign,
  Loader2,
  Shield,
  ChevronUp,
  ChevronDown,
  Save,
  MapPin,
  Edit,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select' // Replaced with native HTML selects
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'
import { API_BASE_URL } from '@/lib/api'
import CustomerMap from '@/components/CustomerMap'
import CoordinateMap from '@/components/CoordinateMap'
import RegionModal from '@/components/RegionModal'

interface Customer {
  id: string
  customer_id?: string
  name: string
  phone: string
  nik?: string
  address?: string
  latitude?: number
  longitude?: number
  package_name?: string
  package_price?: number
  package_speed?: string
  status: 'active' | 'inactive' | 'suspended'
  package_id?: string
  pppoe_username?: string
  pppoe_password?: string
  billing_type?: 'prepaid' | 'postpaid'
  siklus?: 'profile' | 'fixed' | 'monthly'
  router?: string
  router_name?: string
  router_ip?: string
  region?: string
  region_name?: string
  billing_status?: 'paid' | 'pending' | 'overdue'
  created_at: string
  updated_at: string
  last_invoice_date?: string
  is_online?: boolean
  install_date?: string
  active_date?: string
  isolir_date?: string
  calculated_isolir_date?: string
  connection_status?: {
    online: boolean
    status: 'online' | 'offline' | 'suspended'
    ip_address?: string
    nas_ip?: string
    session_start?: string
    last_seen?: string
  }
  odp_id?: string
  odp_name?: string
  odp_address?: string
  odp_port?: string
  region_id?: string
}

interface Package {
  id: number
  name: string
  price: number
  speed: string
  description?: string
  isActive: boolean
}

interface Router {
  id: number
  shortname: string
  nasname: string
  type: string
  description: string
  status: string
  ports?: number
  snmp_status?: string
}

interface FormData {
  name: string
  phone: string
  nik: string
  address: string
  latitude?: number
  longitude?: number
  package_id: string
  pppoe_username: string
  pppoe_password: string
  billing_type: string
  siklus: string
  router: string
  region: string
  // status field removed - customer status will be determined automatically by billing cycle
  odp_id?: string
  odp_name?: string
  odp_address?: string
  odp_port?: string
}


interface CustomerStats {
  totalCustomers: number
  activeCustomers: number
  inactiveCustomers: number
  suspendedCustomers: number
  totalRevenue: number
  outstandingBalance: number
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [routers, setRouters] = useState<Router[]>([])
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all')
  const [filterPackage, setFilterPackage] = useState('all')
  const [filterRouter, setFilterRouter] = useState('all')
  const [filterRegion, setFilterRegion] = useState('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [showRegionModal, setShowRegionModal] = useState(false)
  const [regions, setRegions] = useState<any[]>([])
  const [odps, setODPs] = useState<any[]>([])
  const [fetchingODPs, setFetchingODPs] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalItems, setTotalItems] = useState(0)
  const [sortField, setSortField] = useState<'customer_id' | 'isolir_date' | 'region' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [bulkAction, setBulkAction] = useState<'delete' | 'changeRouter' | 'changeStatus' | 'changeRegion' | 'changeCycle' | null>(null)
  const [submittingBulk, setSubmittingBulk] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    phone: '',
    nik: '',
    address: '',
    latitude: undefined,
    longitude: undefined,
    package_id: '',
    pppoe_username: '',
    pppoe_password: '',
    billing_type: 'postpaid',
    siklus: 'profile',
    router: 'all',
    status: '',
    region: '',
    // status field removed - customer status will be determined automatically by billing cycle
    odp_id: '',
    odp_name: '',
    odp_address: '',
    odp_port: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [fetchingStatus, setFetchingStatus] = useState<string | null>(null)
  const [lastStatusRefresh, setLastStatusRefresh] = useState<Date | null>(null)

  useEffect(() => {
    fetchDashboardStats()
    fetchCustomers()
    fetchPackages()
    fetchRegions()
    fetchRouters()
    fetchODPs()
  }, [currentPage, pageSize, searchQuery, filterStatus, filterPackage, filterRouter, filterRegion, sortField, sortDirection])

  // Auto refresh connection status every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (customers.length > 0) {
        // Refresh connection status for visible customers
        fetchConnectionStatusForVisibleCustomers(customers.slice(0, 10))
        setLastStatusRefresh(new Date())
      }
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [customers])

  // Function to fetch dashboard statistics
  const fetchDashboardStats = async () => {
    try {
      const statsResponse = await api.get('/dashboard/stats')
      if (statsResponse.data?.success) {
        const data = statsResponse.data.data

        // Calculate suspended customers from total
        const suspendedCustomers = data.totalCustomers - data.activeCustomers - data.inactiveCustomers

        setStats({
          totalCustomers: data.totalCustomers || 0,
          activeCustomers: data.activeCustomers || 0,
          inactiveCustomers: data.inactiveCustomers || 0,
          suspendedCustomers: suspendedCustomers || 0,
          totalRevenue: data.totalRevenue || 0,
          outstandingBalance: 0,
        })
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      // Fallback to zero stats if API fails
      setStats({
        totalCustomers: 0,
        activeCustomers: 0,
        inactiveCustomers: 0,
        suspendedCustomers: 0,
        totalRevenue: 0,
        outstandingBalance: 0,
      })
    }
  }

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
        package_id: filterPackage === 'all' ? '' : filterPackage,
        router_id: filterRouter === 'all' ? '' : filterRouter,
        region_id: filterRegion === 'all' ? '' : filterRegion,
        sort_field: sortField || '',
        sort_direction: sortDirection,
      })

      const response = await api.get(`${endpoints.customers.list}?${params}`)

      if (response.data.success) {
        const customerList = response.data.data.customers || []

        // Add default connection status (offline) to all customers
        const customersWithDefaultStatus = customerList.map((customer: Customer) => ({
          ...customer,
          connection_status: { online: false, status: 'offline' }
        }))

        setCustomers(customersWithDefaultStatus)
        const pagination = response.data.data.pagination || {}
        setTotalItems(pagination.total || 0)

        // Fetch connection status for first few customers (for better UX)
        const visibleCustomers = customersWithDefaultStatus.slice(0, Math.min(10, customersWithDefaultStatus.length))
        fetchConnectionStatusForVisibleCustomers(visibleCustomers)
      }
    } catch (err: any) {
      console.error('Error fetching customers:', err)
      setError(err.message || 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  // Function to fetch connection status for multiple customers in parallel
  const fetchConnectionStatusForVisibleCustomers = async (customerList: Customer[]) => {
    const customersWithUsername = customerList.filter(c => c.pppoe_username)

    if (customersWithUsername.length === 0) return

    try {
      const statusUpdates = await Promise.allSettled(
        customersWithUsername.map(async (customer) => {
          try {
            // Use hardcoded path to avoid endpoint function issues
            const endpointPath = `/radius/connection-status/${customer.pppoe_username}`
            const statusResponse = await api.get(endpointPath)

            const connectionStatus = statusResponse.data?.data?.connectionStatus || statusResponse.data?.connectionStatus || { online: false, status: 'offline' }

            return {
              customerId: customer.id,
              connectionStatus: connectionStatus
            }
          } catch (error) {
            console.warn(`Failed to fetch status for ${customer.pppoe_username}:`, error.message)
            return {
              customerId: customer.id,
              connectionStatus: { online: false, status: 'offline' }
            }
          }
        })
      )

      // Update customers with their connection status
      statusUpdates.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { customerId, connectionStatus } = result.value
          console.log(`Updating customer ${customerId} with status:`, connectionStatus)

          setCustomers(prev => {
            const updated = prev.map(customer =>
              customer.id === customerId
                ? { ...customer, connection_status: connectionStatus }
                : customer
            )

            // Log the updated customer
            const updatedCustomer = updated.find(c => c.id === customerId)
            if (updatedCustomer) {
              console.log(`Customer ${customerId} after update:`, {
                customer_id: updatedCustomer.customer_id,
                pppoe_username: updatedCustomer.pppoe_username,
                connection_status: updatedCustomer.connection_status,
                connection_status_online: updatedCustomer.connection_status?.online
              })
            }

            return updated
          })
        } else {
          console.warn('Failed to fetch status:', result.reason)
        }
      })
    } catch (error) {
      console.warn('Error fetching connection status for visible customers:', error)
    }
  }

  // Function to fetch connection status for a specific customer
  const fetchCustomerConnectionStatus = async (customer: Customer): Promise<Customer> => {
    if (customer.pppoe_username) {
      setFetchingStatus(customer.id)
      try {
        const statusResponse = await api.get(`${endpoints.radius.connectionStatus}/${customer.pppoe_username}`)
        console.log('Single customer response:', statusResponse.data)
        return {
          ...customer,
          connection_status: statusResponse.data?.data?.connectionStatus || statusResponse.data?.connectionStatus || { online: false, status: 'offline' }
        }
      } catch (error) {
        console.warn(`Failed to get connection status for ${customer.pppoe_username}:`, error)
        return customer
      } finally {
        setFetchingStatus(null)
      }
    }
    return customer
  }

  const fetchPackages = async () => {
    try {
      const response = await api.get(endpoints.packages.list)
      if (response.data.success) {
        setPackages(response.data.data.packages || [])
      }
    } catch (err: any) {
      console.error('Error fetching packages:', err)
    }
  }

  const fetchRegions = async () => {
    try {
      const response = await api.get(`${endpoints.regions.list}?limit=100&include_disabled=false`)
      if (response.data.success) {
        const regionsData = response.data.data || []
        setRegions(regionsData)
      }
    } catch (err: any) {
      console.error('Error fetching regions:', err)
    }
  }

  const fetchRouters = async () => {
    try {
      const response = await api.get(endpoints.radius.nas)
      if (response.data.success) {
        const routersData = response.data.data.nas || []
        console.log('📡 Routers fetched:', routersData)
        setRouters(routersData)
      }
    } catch (err: any) {
      console.error('Error fetching routers:', err)
    }
  }

  const fetchODPs = async () => {
    try {
      setFetchingODPs(true)
      console.log('🔄 Fetching ODPs...')
      const response = await api.get(endpoints.odp.list)
      console.log('✅ ODPs response:', response.data)

      if (response.data.success) {
        const odpList = response.data.data || []
        console.log(`📋 Found ${odpList.length} ODPs`)
        setODPs(Array.isArray(odpList) ? odpList : [])
      } else {
        console.error('❌ API Error:', response.data.message)
        setODPs([])
      }
    } catch (err: any) {
      console.error('❌ Error fetching ODPs:', err)
      setODPs([])
    } finally {
      setFetchingODPs(false)
    }
  }

  const handleCreateCustomer = async () => {
    if (!formData.name || !formData.phone) {
      setError('Nama dan nomor telepon wajib diisi')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const customerData = {
        name: formData.name,
        phone: formData.phone,
        nik: formData.nik || null,
        address: formData.address || null,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        package_id: formData.package_id || null,
        pppoe_username: formData.pppoe_username || null,
        pppoe_password: formData.pppoe_password || null,
        billing_type: formData.billing_type || 'postpaid',
        siklus: formData.siklus || 'profile',
        router: formData.router || 'all',
        region_id: formData.region || null,
        // status field removed - customer status will be determined automatically by billing cycle
        odp_id: formData.odp_id || null,
        odp_name: formData.odp_name || null,
        odp_address: formData.odp_address || null,
        odp_port: formData.odp_port || null
      }

      let response
      if (isEditing && editingCustomerId) {
        // Update existing customer
        response = await api.put(endpoints.customers.update(editingCustomerId), customerData)
      } else {
        // Create new customer
        response = await api.post(endpoints.customers.create, customerData)
      }

      if (response.data.success) {
        setShowCreateModal(false)
        resetForm()
        fetchCustomers()
        // Reset editing state
        setIsEditing(false)
        setEditingCustomerId(null)
        // Show success message
        alert(isEditing ? 'Pelanggan berhasil diupdate!' : 'Pelanggan berhasil ditambahkan!')
      } else {
        setError(response.data.message || `Gagal ${isEditing ? 'mengupdate' : 'menambahkan'} pelanggan`)
      }
    } catch (err: any) {
      console.error('Error creating customer:', err)
      setError(err.response?.data?.message || err.message || 'Gagal menambahkan pelanggan')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditCustomer = (customer: Customer) => {
    // Set form data with selected customer data
    setFormData({
      name: customer.name,
      phone: customer.phone,
      nik: customer.nik || '',
      address: customer.address || '',
      latitude: customer.latitude,
      longitude: customer.longitude,
      package_id: customer.package_id || '',
      pppoe_username: customer.pppoe_username || '',
      pppoe_password: customer.pppoe_password || '',
      billing_type: customer.billing_type || 'postpaid',
      siklus: customer.siklus || 'profile',
      router: customer.router || 'all',
      region: customer.region_id || '',
      // status field removed - customer status will be determined automatically by billing cycle
      odp_id: customer.odp_id || '',
      odp_name: customer.odp_name || '',
      odp_address: customer.odp_address || '',
      odp_port: customer.odp_port || ''
    })

    // Set editing state
    setIsEditing(true)
    setEditingCustomerId(customer.id)

    // Close detail modal and open create modal for editing
    setShowDetailModal(false)
    setShowCreateModal(true)
  }

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus pelanggan ini?')) {
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const response = await api.delete(endpoints.customers.delete(customerId))

      if (response.data.success) {
        setShowDetailModal(false)
        fetchCustomers() // Refresh customer list
      } else {
        setError(response.data.message || 'Gagal menghapus pelanggan')
      }
    } catch (err: any) {
      console.error('Error deleting customer:', err)
      setError(err.response?.data?.message || err.message || 'Gagal menghapus pelanggan')
    } finally {
      setSubmitting(false)
    }
  }

  // Bulk operation functions
  const handleSelectCustomer = (customerId: string, checked: boolean) => {
    setSelectedCustomers(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(customerId)
      } else {
        newSet.delete(customerId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = customers.map(c => c.id)
      setSelectedCustomers(new Set(allIds))
    } else {
      setSelectedCustomers(new Set())
    }
  }

  const handleBulkDelete = async () => {
    if (selectedCustomers.size === 0) return

    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${selectedCustomers.size} pelanggan?`)) {
      return
    }

    try {
      setSubmittingBulk(true)
      setError(null)

      const promises = Array.from(selectedCustomers).map(customerId =>
        api.delete(endpoints.customers.delete(customerId))
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        setError(`${failed} pelanggan gagal dihapus, ${successful} berhasil`)
      }

      setSelectedCustomers(new Set())
      setShowBulkActions(false)
      fetchCustomers()
      fetchDashboardStats()

    } catch (err: any) {
      console.error('Error in bulk delete:', err)
      setError(err.response?.data?.message || err.message || 'Gagal menghapus pelanggan')
    } finally {
      setSubmittingBulk(false)
    }
  }

  const handleBulkChangeRouter = async (newRouter: string) => {
    if (selectedCustomers.size === 0) return

    try {
      setSubmittingBulk(true)
      setError(null)

      const promises = Array.from(selectedCustomers).map(customerId =>
        api.put(endpoints.customers.update(customerId), { router: newRouter })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        setError(`${failed} pelanggan gagal diupdate, ${successful} berhasil`)
      }

      setSelectedCustomers(new Set())
      setShowBulkActions(false)
      setBulkAction(null)
      fetchCustomers()

    } catch (err: any) {
      console.error('Error in bulk router change:', err)
      setError(err.response?.data?.message || err.message || 'Gagal mengubah router')
    } finally {
      setSubmittingBulk(false)
    }
  }

  const handleBulkChangeStatus = async (newStatus: string) => {
    if (selectedCustomers.size === 0) return

    try {
      setSubmittingBulk(true)
      setError(null)

      const promises = Array.from(selectedCustomers).map(customerId =>
        api.put(endpoints.customers.update(customerId), { status: newStatus })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        setError(`${failed} pelanggan gagal diupdate, ${successful} berhasil`)
      }

      setSelectedCustomers(new Set())
      setShowBulkActions(false)
      setBulkAction(null)
      fetchCustomers()
      fetchDashboardStats()

    } catch (err: any) {
      console.error('Error in bulk status change:', err)
      setError(err.response?.data?.message || err.message || 'Gagal mengubah status')
    } finally {
      setSubmittingBulk(false)
    }
  }

  const handleBulkChangeRegion = async (newRegion: string) => {
    if (selectedCustomers.size === 0) return

    try {
      setSubmittingBulk(true)
      setError(null)

      const promises = Array.from(selectedCustomers).map(customerId =>
        api.put(endpoints.customers.update(customerId), { region_id: newRegion })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        setError(`${failed} pelanggan gagal diupdate, ${successful} berhasil`)
      }

      setSelectedCustomers(new Set())
      setShowBulkActions(false)
      setBulkAction(null)
      fetchCustomers()

    } catch (err: any) {
      console.error('Error in bulk region change:', err)
      setError(err.response?.data?.message || err.message || 'Gagal mengubah wilayah')
    } finally {
      setSubmittingBulk(false)
    }
  }

  const handleBulkChangeCycle = async (newCycle: string) => {
    if (selectedCustomers.size === 0) return

    try {
      setSubmittingBulk(true)
      setError(null)

      const promises = Array.from(selectedCustomers).map(customerId =>
        api.put(endpoints.customers.update(customerId), { siklus: newCycle })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      if (failed > 0) {
        setError(`${failed} pelanggan gagal diupdate, ${successful} berhasil`)
      }

      setSelectedCustomers(new Set())
      setShowBulkActions(false)
      setBulkAction(null)
      fetchCustomers()

    } catch (err: any) {
      console.error('Error in bulk cycle change:', err)
      setError(err.response?.data?.message || err.message || 'Gagal mengubah siklus')
    } finally {
      setSubmittingBulk(false)
    }
  }

  const handleSort = (field: 'customer_id' | 'isolir_date' | 'region') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const formatDate = (dateString: string) => {
    if (dateString === '-') return '-'
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: '2-digit',
      month: 'short',
      day: '2-digit'
    })
  }

  const getIsolirDate = (customer: Customer) => {
    // Prioritas: 1. Calculated auto isolir date, 2. Manual isolir date
    if (customer.calculated_isolir_date) {
      return customer.calculated_isolir_date
    }
    return customer.isolir_date
  }

  const isCustomerIsolir = (customer: Customer) => {
    const isolirDate = getIsolirDate(customer)
    if (!isolirDate || isolirDate === '-') {
      return false
    }

    // Cek apakah tanggal isolir sudah lewat hari ini
    const isolirDateTime = new Date(isolirDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Set ke awal hari untuk perbandingan yang fair

    return isolirDateTime < today
  }

  const getBillingTypeText = (type?: string) => {
    switch (type) {
      case 'prepaid':
        return 'Prabayar'
      case 'postpaid':
        return 'Pascabayar'
      default:
        return '-'
    }
  }

  const getBillingCycleText = (cycle?: string) => {
    switch (cycle) {
      // Backend values (siklus field)
      case 'profile':
        return 'Profile'
      case 'fixed':
        return 'Tetap'
      case 'monthly':
        return 'Bulanan'
      // Frontend legacy values (billing_cycle field)
      case 'tetap':
        return 'Tetap'
      case 'bulan':
        return 'Bulanan'
      default:
        return '-'
    }
  }

  const getRouterText = (router?: string, routers?: Router[]) => {
    if (router === 'all') {
      return 'All Router'
    }

    // Find router by ID or name
    if (router && routers) {
      const foundRouter = routers.find(r => r.id.toString() === router || r.shortname === router || r.nasname === router)
      if (foundRouter) {
        return foundRouter.shortname || foundRouter.nasname
      }
    }

    return router || '-'
  }

  const getConnectionStatus = (customer: Customer) => {
    // Priority 1: Check if customer is suspended (from billing or status)
    if (customer.status === 'suspended' || customer.status === 'inactive' || customer.billing_status === 'overdue') {
      return {
        status: 'suspended' as const,
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: '⚠️',
        text: 'Suspended'
      }
    }

    // Priority 2: Check connection status from RADIUS
    if (customer.connection_status?.online) {
      return {
        status: 'online' as const,
        color: 'bg-green-100 text-green-800 border-green-200',
        icon: '🟢',
        text: 'Online'
      }
    }

    // Priority 3: Default to offline
    return {
      status: 'offline' as const,
      color: 'bg-red-100 text-red-800 border-red-200',
      icon: '🔴',
      text: 'Offline'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-success bg-success/10'
      case 'inactive':
        return 'text-error bg-error/10'
      case 'suspended':
        return 'text-warning bg-warning/10'
      default:
        return 'text-muted bg-muted'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Aktif'
      case 'inactive':
        return 'Tidak Aktif'
      case 'suspended':
        return 'Ditangguh'
      default:
        return status
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      nik: '',
      address: '',
      latitude: undefined,
      longitude: undefined,
      package_id: '',
      pppoe_username: '',
      pppoe_password: '',
      billing_type: 'postpaid',
      siklus: 'profile',
            router: 'all',
      region: '',
      // status field removed - customer status will be determined automatically by billing cycle
    })
    setSelectedCustomer(null)

    // Reset editing state
    setIsEditing(false)
    setEditingCustomerId(null)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Pelanggan</h1>
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading customers...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Pelanggan</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading customers data</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={fetchCustomers}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Handler functions for search and filter
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setCurrentPage(1) // Reset to first page when searching
  }

  const handleFilterChange = (value: string) => {
    setFilterStatus(value as any)
    setCurrentPage(1) // Reset to first page when filtering
  }

  const handlePackageFilterChange = (value: string) => {
    setFilterPackage(value)
    setCurrentPage(1) // Reset to first page when filtering
  }

  const handleRouterFilterChange = (value: string) => {
    setFilterRouter(value)
    setCurrentPage(1) // Reset to first page when filtering
  }

  const handleRegionFilterChange = (value: string) => {
    setFilterRegion(value)
    setCurrentPage(1) // Reset to first page when filtering
  }

  const clearAllFilters = () => {
    setFilterStatus('all')
    setFilterPackage('all')
    setFilterRouter('all')
    setFilterRegion('all')
    setSearchQuery('')
    setCurrentPage(1) // Reset to first page
  }

  const handlePageSizeChange = (value: string) => {
    setPageSize(parseInt(value))
    setCurrentPage(1) // Reset to first page when changing page size
  }

  // Helper functions for pagination
  const getTotalPages = () => {
    return Math.ceil(totalItems / pageSize)
  }

  const getPageNumbers = () => {
    const totalPages = getTotalPages()
    const current = currentPage
    const delta = 2 // Number of pages to show before and after current page
    const range = []
    const rangeWithDots = []
    let l

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) {
        range.push(i)
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1)
        } else if (i - l !== 1) {
          rangeWithDots.push('...')
        }
      }
      rangeWithDots.push(i)
      l = i
    })

    return rangeWithDots
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Pelanggan</h1>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex items-center space-x-2"
            onClick={() => setShowRegionModal(true)}
          >
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Kelola Wilayah ({regions.length})</span>
            <span className="sm:hidden">Wilayah ({regions.length})</span>
          </Button>
          <Button
            className="flex items-center space-x-2"
            onClick={() => {
              resetForm()
              setShowCreateModal(true)
              fetchRegions() // Fetch regions when modal opens
            }}
          >
            <Plus className="h-4 w-4" />
            Tambah Pelanggan
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Total Pelanggan</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-foreground">{stats?.totalCustomers || 0}</div>
            <p className="text-xs text-muted-foreground">Total registrasi</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Pelanggan Aktif</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-success">
              {stats?.activeCustomers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Sedang aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Total Pendapatan</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(stats?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Semua waktu</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Ditangguh</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-warning">
              {stats?.suspendedCustomers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Status suspend</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari pelanggan (nama, telepon, NIK, ID Pelanggan, PPPoE)..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={filterStatus}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Tidak Aktif</option>
                <option value="suspended">Ditangguh</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                {showAdvancedFilters ? 'Sembunyikan' : 'Filter Lanjutan'}
              </Button>
              {(filterStatus !== 'all' || filterPackage !== 'all' || filterRouter !== 'all' || filterRegion !== 'all' || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Hapus Filter
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-4">Filter Lanjutan</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Package Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Filter Paket</label>
                <select
                  value={filterPackage}
                  onChange={(e) => handlePackageFilterChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Semua Paket</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({formatCurrency(pkg.price)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Router Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Filter Router</label>
                <select
                  value={filterRouter}
                  onChange={(e) => handleRouterFilterChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Semua Router</option>
                  {routers.map((router) => (
                    <option key={router.id} value={router.id}>
                      {router.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Region Filter */}
              <div>
                <label className="block text-sm font-medium mb-2">Filter Wilayah</label>
                <select
                  value={filterRegion}
                  onChange={(e) => handleRegionFilterChange(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Semua Wilayah</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Active Filters Summary */}
              <div>
                <label className="block text-sm font-medium mb-2">Filter Aktif</label>
                <div className="text-sm text-muted-foreground">
                  {filterStatus !== 'all' && <div>• Status: {filterStatus}</div>}
                  {filterPackage !== 'all' && <div>• Paket: {packages.find(p => p.id === filterPackage)?.name}</div>}
                  {filterRouter !== 'all' && <div>• Router: {routers.find(r => r.id === filterRouter)?.name}</div>}
                  {filterRegion !== 'all' && <div>• Wilayah: {regions.find(r => r.id === filterRegion)?.name}</div>}
                  {searchQuery && <div>• Pencarian: "{searchQuery}"</div>}
                  {filterStatus === 'all' && filterPackage === 'all' && filterRouter === 'all' &&
                   filterRegion === 'all' && !searchQuery && <div>Tidak ada filter aktif</div>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Daftar Pelanggan</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tampilkan:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value={10}>10 data</option>
                <option value={25}>25 data</option>
                <option value={50}>50 data</option>
                <option value={100}>100 data</option>
              </select>
              <span className="text-sm text-muted-foreground">
                dari {totalItems} total data
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchConnectionStatusForVisibleCustomers(customers.slice(0, 10))
                  setLastStatusRefresh(new Date())
                }}
                className="flex items-center gap-2"
              >
                <Activity className="h-4 w-4" />
                Refresh Status
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  console.log('🧪 MANUAL TEST: Fetching apptest status...')
                  try {
                    // Test hardcoded URL
                    const hardcodedUrl = '/radius/connection-status/apptest'
                    console.log('🧪 Hardcoded URL:', hardcodedUrl)
                    console.log('🧪 Full URL:', `${process.env.NEXT_PUBLIC_API_URL}/api/v1${hardcodedUrl}`)
                    console.log('🧪 Endpoints function result:', endpoints.radius.connectionStatus('apptest'))

                    const response = await api.get(hardcodedUrl)
                    console.log('🧪 MANUAL RESPONSE:', response.data)

                    const connectionStatus = response.data?.data?.connectionStatus || response.data?.connectionStatus || { online: false, status: 'offline' }
                    console.log('🧪 CONNECTION STATUS:', connectionStatus)

                    // Update specific customer
                    setCustomers(prev => prev.map(c =>
                      c.pppoe_username === 'apptest'
                        ? { ...c, connection_status: connectionStatus }
                        : c
                    ))

                    // Test if UI updates
                    setTimeout(() => {
                      const updated = customers.find(c => c.pppoe_username === 'apptest')
                      console.log('🧪 Updated customer in state:', updated?.connection_status)
                    }, 100)

                  } catch (error) {
                    console.error('🧪 MANUAL ERROR:', error)
                  }
                }}
                className="flex items-center gap-2"
              >
                Test apptest
              </Button>
              {lastStatusRefresh && (
                <span className="text-xs text-muted-foreground">
                  Last: {lastStatusRefresh.toLocaleTimeString('id-ID')}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Bulk Actions Bar */}
          {selectedCustomers.size > 0 && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {selectedCustomers.size} pelanggan dipilih
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                    disabled={submittingBulk}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Hapus
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction('changeRouter')}
                    disabled={submittingBulk}
                    className="flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Ganti Router
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction('changeStatus')}
                    disabled={submittingBulk}
                    className="flex items-center gap-2"
                  >
                    <Shield className="w-4 h-4" />
                    Aktif/Nonaktif
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction('changeRegion')}
                    disabled={submittingBulk}
                    className="flex items-center gap-2"
                  >
                    <MapPin className="w-4 h-4" />
                    Ganti Wilayah
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction('changeCycle')}
                    disabled={submittingBulk}
                    className="flex items-center gap-2"
                  >
                    <Activity className="w-4 h-4" />
                    Ganti Siklus
                  </Button>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCustomers(new Set())}
              >
                Batal
              </Button>
            </div>
          )}

          {/* Router Selection Modal */}
          {bulkAction === 'changeRouter' && (
            <div className="mb-4 p-4 border rounded-lg bg-background">
              <h4 className="font-medium mb-3">Pilih Router Baru</h4>
              <div className="flex items-center gap-3">
                <select
                  value={formData.router || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, router: e.target.value }))}
                  className="px-3 py-2 border rounded-md bg-background"
                  disabled={submittingBulk}
                >
                  <option value="">Pilih Router</option>
                  {routers.map((router) => (
                    <option key={router.id} value={router.id}>
                      {router.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => handleBulkChangeRouter(formData.router || '')}
                  disabled={submittingBulk || !formData.router}
                >
                  {submittingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Terapkan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkAction(null)}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* Status Change Modal */}
          {bulkAction === 'changeStatus' && (
            <div className="mb-4 p-4 border rounded-lg bg-background">
              <h4 className="font-medium mb-3">Ubah Status Pelanggan</h4>
              <div className="flex items-center gap-3">
                <select
                  value={formData.status || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-2 border rounded-md bg-background"
                  disabled={submittingBulk}
                >
                  <option value="">Pilih Status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                  <option value="suspended">Ditangguhkan</option>
                </select>
                <Button
                  size="sm"
                  onClick={() => handleBulkChangeStatus(formData.status || '')}
                  disabled={submittingBulk || !formData.status}
                >
                  {submittingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Terapkan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkAction(null)}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* Region Change Modal */}
          {bulkAction === 'changeRegion' && (
            <div className="mb-4 p-4 border rounded-lg bg-background">
              <h4 className="font-medium mb-3">Pilih Wilayah Baru</h4>
              <div className="flex items-center gap-3">
                <select
                  value={formData.region || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, region: e.target.value }))}
                  className="px-3 py-2 border rounded-md bg-background"
                  disabled={submittingBulk}
                >
                  <option value="">Pilih Wilayah</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => handleBulkChangeRegion(formData.region || '')}
                  disabled={submittingBulk || !formData.region}
                >
                  {submittingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Terapkan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkAction(null)}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          {/* Cycle Change Modal */}
          {bulkAction === 'changeCycle' && (
            <div className="mb-4 p-4 border rounded-lg bg-background">
              <h4 className="font-medium mb-3">Pilih Siklus Tagihan Baru</h4>
              <div className="flex items-center gap-3">
                <select
                  value={formData.siklus || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, siklus: e.target.value }))}
                  className="px-3 py-2 border rounded-md bg-background"
                  disabled={submittingBulk}
                >
                  <option value="">Pilih Siklus</option>
                  <option value="profile">Profile</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
                <Button
                  size="sm"
                  onClick={() => handleBulkChangeCycle(formData.siklus || '')}
                  disabled={submittingBulk || !formData.siklus}
                >
                  {submittingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Terapkan
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkAction(null)}
                >
                  Batal
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-center p-3 font-semibold text-foreground whitespace-nowrap w-12">
                    <input
                      type="checkbox"
                      checked={selectedCustomers.size === customers.length && customers.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="text-center p-3 font-semibold text-foreground whitespace-nowrap w-12">
                    Koneksi
                  </th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors w-28"
                    onClick={() => handleSort('customer_id')}
                  >
                    <div className="flex items-center gap-1">
                      ID Pelanggan
                      {sortField === 'customer_id' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-40">Nama Pelanggan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">NIK</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-36">Nomor Telepon</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-64">Alamat</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-40">Paket</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-28">Tagihan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-28">Siklus</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">Router</th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors w-48"
                    onClick={() => handleSort('region')}
                  >
                    <div className="flex items-center gap-1">
                      Wilayah
                      {sortField === 'region' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-40">PPPoE Username</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">Tanggal Daftar</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">Tanggal Aktif</th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors w-32"
                    onClick={() => handleSort('isolir_date')}
                  >
                    <div className="flex items-center gap-1">
                      Tanggal Isolir
                      {sortField === 'isolir_date' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.length > 0 ? (
                  customers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer hover:shadow-sm"
                      onClick={async () => {
                        console.log(`=== CLICK ON ${customer.customer_id} (${customer.pppoe_username}) ===`)
                        console.log('Before fetch:', {
                          connection_status: customer.connection_status,
                          connection_status_online: customer.connection_status?.online
                        })

                        // Fetch fresh connection status when opening detail
                        const updatedCustomer = await fetchCustomerConnectionStatus(customer)

                        console.log('After fetch:', {
                          connection_status: updatedCustomer.connection_status,
                          connection_status_online: updatedCustomer.connection_status?.online
                        })

                        // Also update the customer in the table list
                        setCustomers(prev => {
                          const updated = prev.map(c =>
                            c.id === customer.id ? { ...updatedCustomer } : c
                          )

                          console.log('Updated customers list after click:',
                            updated.filter(c => c.id === customer.id).map(c => ({
                              customer_id: c.customer_id,
                              connection_status_online: c.connection_status?.online
                            }))
                          )

                          // Force re-render by creating new array
                          return [...updated]
                        })

                        setSelectedCustomer(updatedCustomer)
                        setShowDetailModal(true)
                      }}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedCustomers.has(customer.id)}
                          onChange={(e) => handleSelectCustomer(customer.id, e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3 text-center">
                        {fetchingStatus === customer.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
                        ) : (
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center mx-auto transition-all duration-300 ${
                              getConnectionStatus(customer).status === 'online' ? 'bg-green-100' :
                              getConnectionStatus(customer).status === 'suspended' ? 'bg-yellow-100' :
                              'bg-red-100'
                            }`}
                            title={`${getConnectionStatus(customer).text} - Last checked: ${lastStatusRefresh?.toLocaleTimeString('id-ID') || 'Just now'}`}
                          >
                            <div className={`w-3 h-3 rounded-full ${
                              getConnectionStatus(customer).status === 'online' ? 'bg-green-500' :
                              getConnectionStatus(customer).status === 'suspended' ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}></div>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {/* Customer ID - Clean without badge */}
                        <div className="font-mono text-sm font-medium text-foreground">
                          {customer.customer_id || '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{customer.name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.nik || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-blue-600 hover:bg-blue-50 px-2 py-1 transition-colors">
                          {customer.phone}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="max-w-md">
                          <p className="text-sm text-foreground whitespace-normal overflow-hidden"
                             style={{
                               display: '-webkit-box',
                               WebkitLineClamp: 2,
                               WebkitBoxOrient: 'vertical'
                             }}
                             title={customer.address}>
                            {customer.address || '-'}
                          </p>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-foreground" title={customer.package_name}>
                          {customer.package_name || '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm font-medium text-foreground">
                          {getBillingTypeText(customer.billing_type)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-foreground">
                          {getBillingCycleText(customer.siklus)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-foreground">
                          {getRouterText(customer.router, routers)}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-foreground" title={customer.region_name || customer.area || '-'}>
                          {customer.region_name || customer.area || '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm font-mono text-foreground">
                          {customer.pppoe_username || '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">{formatDate(customer.created_at)}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">{formatDate(customer.active_date || customer.install_date || '-')}</span>
                      </td>
                      <td className="p-3">
                        <span className={`text-sm ${isCustomerIsolir(customer) ? 'text-error font-medium' : 'text-foreground'}`}>
                          {formatDate(getIsolirDate(customer) || '-')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={15} className="p-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center space-y-2">
                        <Users className="h-12 w-12" />
                        <p>Tidak ada pelanggan ditemukan</p>
                        <p className="text-sm">Coba ubah kriteria pencarian atau filter</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination Controls */}
      {totalItems > pageSize && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Menampilkan {Math.min((currentPage - 1) * pageSize + 1, totalItems)} - {Math.min(currentPage * pageSize, totalItems)} dari {totalItems} data
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Pertama
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Sebelumnya
                </Button>

                {/* Page Numbers */}
                <div className="flex items-center space-x-1">
                  {getPageNumbers().map((page) => (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      disabled={page === '...'}
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === getTotalPages()}
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(getTotalPages())}
                  disabled={currentPage === getTotalPages()}
                >
                  Terakhir
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Detail Modal */}
      {showDetailModal && selectedCustomer && (
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Pelanggan</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Informasi Dasar */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Dasar</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">ID Pelanggan</p>
                    <p className="font-medium text-foreground font-mono mt-1">{selectedCustomer.customer_id || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nama Lengkap</p>
                    <p className="font-medium text-foreground">{selectedCustomer.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">NIK</p>
                    <p className="font-medium text-foreground">{selectedCustomer.nik || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nomor Telepon</p>
                    <p className="font-medium text-foreground text-blue-600">{selectedCustomer.phone}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-muted-foreground">Alamat</p>
                    <p className="font-medium text-foreground">{selectedCustomer.address || '-'}</p>
                  </div>

                  {/* Peta Lokasi */}
                  {selectedCustomer.address && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground mb-2">Lokasi pada Peta</p>
                      <CustomerMap customer={selectedCustomer} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedCustomer.status)}`}>
                      {getStatusText(selectedCustomer.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Wilayah</p>
                    <p className="font-medium text-foreground">{selectedCustomer.region_name || selectedCustomer.area || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Informasi Layanan */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Layanan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Paket</p>
                    <p className="font-medium text-foreground">{selectedCustomer.package_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Router</p>
                    <p className="font-medium text-foreground">{getRouterText(selectedCustomer.router, routers)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Username PPPoE</p>
                    <p className="font-medium text-foreground font-mono text-sm">{selectedCustomer.pppoe_username || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Password PPPoE</p>
                    <p className="font-medium text-foreground font-mono text-sm">{selectedCustomer.pppoe_password || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Status Koneksi */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Status Koneksi</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status Saat Ini</p>
                    <div className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium border ${getConnectionStatus(selectedCustomer).color}`}>
                      <span className="mr-2">{getConnectionStatus(selectedCustomer).icon}</span>
                      {getConnectionStatus(selectedCustomer).text}
                    </div>
                  </div>
                  {selectedCustomer.connection_status?.ip_address && (
                    <div>
                      <p className="text-sm text-muted-foreground">IP Address</p>
                      <p className="font-medium text-foreground font-mono">{selectedCustomer.connection_status.ip_address}</p>
                    </div>
                  )}
                  {selectedCustomer.connection_status?.nas_ip && (
                    <div>
                      <p className="text-sm text-muted-foreground">NAS Server</p>
                      <p className="font-medium text-foreground font-mono">{selectedCustomer.connection_status.nas_ip}</p>
                    </div>
                  )}
                  {selectedCustomer.connection_status?.session_start && (
                    <div>
                      <p className="text-sm text-muted-foreground">Session Start</p>
                      <p className="font-medium text-foreground">
                        {new Date(selectedCustomer.connection_status.session_start).toLocaleString('id-ID')}
                      </p>
                    </div>
                  )}
                  {selectedCustomer.connection_status?.last_seen && (
                    <div>
                      <p className="text-sm text-muted-foreground">Terakhir Lihat</p>
                      <p className="font-medium text-foreground">
                        {new Date(selectedCustomer.connection_status.last_seen).toLocaleString('id-ID')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Informasi Tagihan */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Tagihan</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Jenis Tagihan</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedCustomer.billing_type === 'prepaid' ? 'bg-blue-100 text-blue-800' :
                      selectedCustomer.billing_type === 'postpaid' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {getBillingTypeText(selectedCustomer.billing_type)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Siklus Tagihan</p>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {getBillingCycleText(selectedCustomer.siklus)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Harga Paket</p>
                    <p className="font-medium text-foreground">{selectedCustomer.package_price ? formatCurrency(selectedCustomer.package_price) : '-'}</p>
                  </div>
                </div>
              </div>

              {/* Informasi Tanggal */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Tanggal</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Tanggal Daftar</p>
                    <p className="font-medium text-foreground">{formatDate(selectedCustomer.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tanggal Aktif</p>
                    <p className="font-medium text-foreground">{formatDate(selectedCustomer.active_date || selectedCustomer.install_date || '-')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tanggal Isolir</p>
                    <p className={`font-medium ${isCustomerIsolir(selectedCustomer) || selectedCustomer.status === 'suspended' || selectedCustomer.status === 'inactive' ? 'text-red-600' : 'text-foreground'}`}>
                      {formatDate(getIsolirDate(selectedCustomer) || '-')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex justify-between">
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={() => selectedCustomer && handleDeleteCustomer(selectedCustomer.id)}
                  disabled={submitting}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => selectedCustomer && handleEditCustomer(selectedCustomer)}
                  disabled={submitting}
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
                <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                  Tutup
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Customer Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}</DialogTitle>
            </DialogHeader>

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Nama Lengkap *</Label>
                  <Input
                    id="create-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-phone">Nomor Telepon *</Label>
                  <Input
                    id="create-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="081234567890"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-nik">NIK</Label>
                  <Input
                    id="create-nik"
                    value={formData.nik}
                    onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
                    placeholder="Nomor KTP (16 digit)"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-region">Wilayah</Label>
                  <select
                    id="create-region"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Pilih wilayah...</option>
                    {Array.isArray(regions) && regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.name}
                        {region.district && ` - ${region.district}`}
                        {region.regency && `, ${region.regency}`}
                        {region.province && `, ${region.province}`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500">
                    Kelola wilayah melalui tombol "Kelola Wilayah" di atas
                  </p>
                </div>

                {/* ODP Selection */}
                <div className="space-y-2">
                  <Label htmlFor="create-odp">ODP (Optical Distribution Point)</Label>
                  <select
                    id="create-odp"
                    value={formData.odp_id || ''}
                    onChange={(e) => {
                      const selectedODP = odps.find(odp => odp.id.toString() === e.target.value)
                      setFormData({
                        ...formData,
                        odp_id: e.target.value,
                        odp_name: selectedODP?.name || '',
                        odp_address: selectedODP?.address || ''
                      })
                    }}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={fetchingODPs}
                  >
                    <option value="">Pilih ODP...</option>
                    {Array.isArray(odps) && odps.map((odp) => (
                      <option key={odp.id} value={odp.id}>
                        {odp.name} - {odp.address}
                      </option>
                    ))}
                  </select>
                  {fetchingODPs && (
                    <p className="text-xs text-gray-500">Memuat data ODP...</p>
                  )}
                  {!fetchingODPs && odps.length === 0 && (
                    <p className="text-xs text-gray-500">
                      Tidak ada ODP tersedia. <a href="/admin/odp" target="_blank" className="text-blue-600 hover:underline">Tambah ODP terlebih dahulu</a>
                    </p>
                  )}
                </div>

                {formData.odp_id && (
                  <div className="space-y-2">
                    <Label htmlFor="create-odp-port">Port ODP</Label>
                    <Input
                      id="create-odp-port"
                      type="text"
                      value={formData.odp_port || ''}
                      onChange={(e) => setFormData({ ...formData, odp_port: e.target.value })}
                      placeholder="Masukkan nomor port ODP (contoh: 1, 2, 3...)"
                      className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500">
                      Nomor port pada panel ODP tempat pelanggan terhubung
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-address">Alamat Lengkap</Label>
                <Textarea
                  id="create-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Masukkan alamat lengkap"
                  rows={2}
                />
              </div>

              {/* Coordinate Map */}
              <div className="space-y-2">
                <Label>Koordinat Lokasi Pelanggan</Label>
                <p className="text-xs text-gray-600 mb-2">
                  Gunakan GPS untuk mendapatkan lokasi otomatis atau adjust manual pada map. Tekniksi bisa capture koordinat langsung dari lokasi pelanggan.
                </p>
                <CoordinateMap
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                  address={formData.address}
                  onCoordinatesChange={(lat, lng) => setFormData({ ...formData, latitude: lat, longitude: lng })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-package">Paket Layanan</Label>
                  <select
                    id="create-package"
                    value={formData.package_id}
                    onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Pilih paket...</option>
                    {Array.isArray(packages) && packages.filter(pkg => pkg.isActive).map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} - {pkg.speed} - {formatCurrency(pkg.price)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-router">Router</Label>
                  <select
                    id="create-router"
                    value={formData.router}
                    onChange={(e) => setFormData({ ...formData, router: e.target.value })}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All Router (Bebas)</option>
                    {Array.isArray(routers) && routers.map((router) => (
                      <option key={router.id} value={router.shortname}>
                        {router.shortname} ({router.nasname}) - {router.snmp_status || router.status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-pppoe-user">PPPoE Username</Label>
                  <Input
                    id="create-pppoe-user"
                    value={formData.pppoe_username}
                    onChange={(e) => setFormData({ ...formData, pppoe_username: e.target.value })}
                    placeholder="username123"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-pppoe-pass">PPPoE Password</Label>
                  <Input
                    id="create-pppoe-pass"
                    type="password"
                    value={formData.pppoe_password}
                    onChange={(e) => setFormData({ ...formData, pppoe_password: e.target.value })}
                    placeholder="1234567"
                  />
                </div>
              </div>

              {/* Billing Section - Dipindah ke bawah */}
              <div className="border-t pt-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Informasi Tagihan & Siklus</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="create-billing-type">Jenis Tagihan</Label>
                      <select
                        id="create-billing-type"
                        value={formData.billing_type}
                        onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Pilih jenis tagihan</option>
                        <option value="prepaid">Prabayar</option>
                        <option value="postpaid">Pascabayar</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-siklus">Siklus Billing</Label>
                      <select
                        id="create-siklus"
                        value={formData.siklus}
                        onChange={(e) => setFormData({ ...formData, siklus: e.target.value })}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Pilih siklus billing</option>
                        <option value="profile">Profile</option>
                        <option value="tetap">Tetap</option>
                        <option value="bulan">Bulanan</option>
                      </select>
                    </div>
                  </div>

                  {/* Info Tagihan */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Info Tagihan</Label>
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                      {formData.billing_type === 'prepaid' ? (
                        <div className="text-sm">
                          <p className="font-medium text-blue-600 dark:text-blue-400 mb-2">💰 Prabayar</p>
                          <div className="space-y-1">
                            <p className="text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Biaya Awal:</span> Paket layanan + biaya instalasi
                            </p>
                            <p className="text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Aktivasi:</span> 30 menit trial setelah pembayaran
                            </p>
                            <p className="text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Perpanjangan:</span> Sesuai paket yang dipilih
                            </p>
                          </div>
                        </div>
                      ) : formData.billing_type === 'postpaid' ? (
                        <div className="text-sm">
                          <p className="font-medium text-green-600 dark:text-green-400 mb-2">💳 Pascabayar</p>
                          <div className="space-y-1">
                            <p className="text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Biaya Awal:</span> Hanya biaya instalasi
                            </p>
                            <p className="text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Aktivasi:</span> Langsung aktif setelah instalasi
                            </p>
                            <p className="text-gray-600 dark:text-gray-300">
                              <span className="font-medium">Tagihan:</span> Sesuai siklus yang dipilih
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 dark:text-gray-400 p-2 text-center">
                          <p>💡 Pilih jenis tagihan untuk melihat informasi lengkap</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Batal
              </Button>
              <Button
                disabled={submitting}
                onClick={handleCreateCustomer}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Simpan
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Region Management Modal */}
      <RegionModal
        isOpen={showRegionModal}
        onClose={() => setShowRegionModal(false)}
      />
    </div>
  )
}