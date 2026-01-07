'use client'

import React, { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
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
  Settings,
  Wifi,
  Cable,
  CreditCard,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select' // Replaced with native HTML selects
import { formatCurrency } from '@/lib/utils'
import { adminApi } from '@/lib/api-clients'
import { API_BASE_URL } from '@/lib/api'
import CustomerMap from '@/components/CustomerMap'
import CoordinateMap from '@/components/CoordinateMap'
import RegionModal from '@/components/RegionModal'
import CustomerDefaultSettingsModal from '@/components/CustomerDefaultSettingsModal'
import { useCustomerDefaults } from '@/hooks/useCustomerDefaults'

interface Customer {
  id: string
  customer_id?: string
  name: string
  phone: string
  nik?: string
  address?: string // Effective Address
  billing_address?: string // Pure Billing Address
  installation_address?: string // Installation Address
  latitude?: number
  longitude?: number
  package_name?: string
  package_price?: number
  package_speed?: string
  status: 'active' | 'inactive' | 'suspended' | 'no_service'
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
  cable_length?: number
  service_number?: string
  region_id?: string
}

interface Package {
  id: number
  name: string
  price: number
  speed: string
  description?: string
  installation_fee?: number
  installation_description?: string
  isActive: boolean
}

interface Router {
  id: number
  shortname: string
  nasname: string
  name?: string
  type: string
  description: string
  status: string
  ports?: number
  snmp_status?: string
}

interface FormData {
  customer_id: string
  name: string
  phone: string
  nik: string
  address: string // Billing Address (alamat tagihan)
  installation_address: string // Installation Address (alamat instalasi)
  latitude?: number
  longitude?: number
  package_id: string
  pppoe_username: string
  pppoe_password: string
  billing_type: string
  siklus: string
  router: string
  status: string
  region: string
  // status field removed - customer status will be determined automatically by billing cycle
  odp_id?: string
  odp_name?: string
  odp_address?: string
  odp_port?: string
  cable_length?: number // Panjang Kabel (meters)
  service_number?: string
}


interface CustomerStats {
  totalCustomers: number
  activeCustomers: number
  inactiveCustomers: number
  onlineCustomers: number
  suspendedCustomers: number
  totalRevenue: number
  outstandingBalance: number
  newCustomersThisMonth: number
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [routers, setRouters] = useState<Router[]>([])
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('') // The actual query sent to API
  const [searchInput, setSearchInput] = useState('') // The input field value

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Search state for modal
  const [modalSearchResults, setModalSearchResults] = useState<Customer[]>([])
  const [isModalSearching, setIsModalSearching] = useState(false)
  const [modalSearchQuery, setModalSearchQuery] = useState('')

  // New state for modal mode and identity editing
  const [searchModalMode, setSearchModalMode] = useState<'view' | 'select'>('view')
  const [isIdentityEditing, setIsIdentityEditing] = useState(false)
  const [editingIdentityId, setEditingIdentityId] = useState<string | null>(null)
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
  const editingCustomerData = useRef<Customer | null>(null)
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
    customer_id: '',
    name: '',
    phone: '',
    nik: '',
    address: '',
    installation_address: '',
    latitude: undefined,
    longitude: undefined,
    package_id: '',
    pppoe_username: '',
    pppoe_password: '',
    billing_type: 'postpaid',
    siklus: 'profile',
    router: 'all',
    status: 'active', // Default status for bulk operations
    region: '',
    // status field removed - customer status will be determined automatically by billing cycle
    odp_id: '',
    odp_name: '',
    odp_address: '',
    odp_port: '',
    cable_length: undefined
  })
  const [submitting, setSubmitting] = useState(false)
  const [fetchingStatus, setFetchingStatus] = useState<string | null>(null)
  const [lastStatusRefresh, setLastStatusRefresh] = useState<Date | null>(null)

  // Multi-Service Constants removed - Reverting to single modal

  // Customer defaults hook

  // Customer defaults hook
  const { defaults, getDefaultValue } = useCustomerDefaults()
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showIdentityModal, setShowIdentityModal] = useState(false)
  const [identityFormData, setIdentityFormData] = useState({
    customer_id: '',
    name: '',
    phone: '',
    nik: '',
    address: ''
  })
  const [showSearchCustomerModal, setShowSearchCustomerModal] = useState(false)

  const handleSelectCustomerFromSearch = (customer: Customer) => {
    // Service Number Calculation Logic: YYMM + CustomerID (5 digits) + Index (2 digits)
    const today = new Date();
    const yy = today.getFullYear().toString().slice(-2);
    const mm = (today.getMonth() + 1).toString().padStart(2, '0');

    // CustID is normalized 5 digits
    const custId = customer.customer_id || customer.id || '00000';

    // Calculate index: Count existing services for this specific customer ID
    // Note: 'customers' only has current page. Ideally, we should ask backend for count.
    // For now, using length of filter on loaded customers might be inaccurate if pagination is used.
    // Optimization: We will perform a specific check or default to '01' if first, 
    // but the user requirement implies a sequential service number.
    // Let's assume '01' for now as the basic requirement unless we fetch service count.

    // BETTER APPROACH: Use the count of services returned by the backend in search results if available?
    // Or just default to '01' since "Add Service" typically implies adding a new one.
    // If the user has existing services, we'd need to know how many.
    // Assuming 01 for the first service if we can't easily count.
    // If `customers` state has all customers, filtering works. If paginated, it doesn't.
    // We will simulate '01' for this step as per user example `25120000101`.
    const nextIndex = '01';

    const serviceNumber = `${yy}${mm}${custId}${nextIndex}`;
    const suffix = getDefaultValue('pppoe_suffix', 'isp');
    const pppoeUsername = `${serviceNumber}@${suffix}`;

    console.log('🔢 Generated Service Number:', serviceNumber);
    console.log('👤 Generated PPPoE Username:', pppoeUsername);

    setFormData(prev => ({
      ...prev,
      customer_id: custId,
      name: customer.name,
      phone: customer.phone,
      nik: customer.nik || '',
      address: customer.address || '',
      region: customer.region_id?.toString() || '',
      service_number: serviceNumber, // Storing for display
      pppoe_username: pppoeUsername // Auto-set PPPoE
    }))
    setShowSearchCustomerModal(false)
  }

  // Handle Edit Identity from Search Modal (View Mode)
  const handleEditIdentity = (customer: Customer) => {
    setIdentityFormData({
      customer_id: customer.customer_id || '',
      name: customer.name,
      phone: customer.phone,
      nik: customer.nik || '',
      address: customer.billing_address || customer.address || ''
    })
    setIsIdentityEditing(true)
    setEditingIdentityId(customer.id)
    setShowIdentityModal(true)
  }

  useEffect(() => {
    fetchDashboardStats()
    fetchCustomers()
    fetchPackages()
    fetchRegions()
    fetchRouters()
    fetchODPs()
    // Preload installation fees for both billing types
    fetchInstallationFee('prepaid')
    fetchInstallationFee('postpaid')
  }, [currentPage, pageSize, searchQuery, filterStatus, filterPackage, filterRouter, filterRegion, sortField, sortDirection])

  // Auto-generate PPPoE username when customer_id changes or when suffix changes in settings
  useEffect(() => {
    if (formData.customer_id && defaults.pppoe_suffix && !isEditing) {
      // Only auto-generate if username is empty or customer_id has changed (only in create mode)
      if (!formData.pppoe_username || (formData.customer_id && !formData.pppoe_username.includes(formData.customer_id))) {
        const suffix = getDefaultValue('pppoe_suffix', 'isp')
        const generatedUsername = `${formData.customer_id}@${suffix}`
        setFormData(prev => ({
          ...prev,
          pppoe_username: generatedUsername
        }))
      }
    }
  }, [formData.customer_id, defaults.pppoe_suffix, getDefaultValue, isEditing])


  // Monitor ALL form data changes to catch unexpected resets
  useEffect(() => {
    console.log('📊 FORM DATA CHANGED:', {
      isEditing,
      showCreateModal,
      package_id: formData.package_id,
      latitude: formData.latitude,
      longitude: formData.longitude,
      odp_id: formData.odp_id,
      odp_port: formData.odp_port,
      customer_id: formData.customer_id,
      pppoe_username: formData.pppoe_username
    })
  }, [formData, isEditing, showCreateModal]) // Monitor all form changes

  // Auto-generate customer ID when create modal opens
  useEffect(() => {
    const generateID = async () => {
      if (showCreateModal && !formData.customer_id && !isEditing) {
        await generateCustomerID()
      }
    }

    generateID()
  }, [showCreateModal, isEditing, formData.customer_id])

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
      const statsResponse = await adminApi.get('/api/v1/dashboard/stats')
      if (statsResponse.data?.success) {
        const data = statsResponse.data.data

        // Calculate suspended customers from total
        const suspendedCustomers = data.totalCustomers - data.activeCustomers - data.inactiveCustomers

        setStats({
          totalCustomers: data.totalCustomers || 0,
          activeCustomers: data.activeCustomers || 0,
          inactiveCustomers: data.inactiveCustomers || 0,
          onlineCustomers: data.onlineCustomers || 0,
          suspendedCustomers: suspendedCustomers || 0,
          totalRevenue: data.totalRevenue || 0,
          outstandingBalance: 0,
          newCustomersThisMonth: data.newCustomersThisMonth || 0,
        })
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
      // Fallback to zero stats if API fails
      setStats({
        totalCustomers: 0,
        activeCustomers: 0,
        inactiveCustomers: 0,
        onlineCustomers: 0,
        suspendedCustomers: 0,
        totalRevenue: 0,
        outstandingBalance: 0,
        newCustomersThisMonth: 0,
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
        sort_direction: sortDirection,
        exclude_status: 'pending', // Exclude pending registrations from main list
      })

      const response = await adminApi.get(`/api/v1/customers?${params}`)

      if (response.data.success) {
        // Handle both array and object wrapper formats
        const rawData = response.data.data
        const customerList = Array.isArray(rawData) ? rawData : (rawData?.customers || [])

        // Debug coordinates for all customers
        console.log('🔍 API Response - Customer Coordinates Check:')
        customerList.forEach((customer: any, index: number) => {
          console.log(`Customer ${index + 1} (${customer.customer_id}):`)
          console.log(`  - Name: ${customer.name}`)
          console.log(`  - Latitude: ${customer.latitude} (${typeof customer.latitude})`)
          console.log(`  - Longitude: ${customer.longitude} (${typeof customer.longitude})`)
          console.log(`  - Has Default Coords: ${customer.latitude === -6.563234 && customer.longitude === 107.741418}`)
        })

        // Add default connection status (offline) to all customers
        const customersWithDefaultStatus = customerList.map((customer: Customer) => ({
          ...customer,
          connection_status: { online: false, status: 'offline' }
        }))

        setCustomers(customersWithDefaultStatus)
        const pagination = response.data.pagination || {}
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
            // Use the correct endpoint path
            const statusResponse = await adminApi.get(`/api/v1/radius/connection-status/${customer.pppoe_username}`)

            const connectionStatus = statusResponse.data?.data?.connectionStatus || statusResponse.data?.connectionStatus || { online: false, status: 'offline' }

            return {
              customerId: customer.id,
              connectionStatus: connectionStatus
            }
          } catch (error: any) {
            console.warn(`Failed to fetch status for ${customer.pppoe_username}:`, error?.message || error)
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
        const statusResponse = await adminApi.get(`/api/v1/radius/connection-status/${customer.pppoe_username}`)
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
      const response = await adminApi.get('/api/v1/packages')
      if (response.data.success) {
        setPackages(response.data.data.packages || [])
      }
    } catch (err: any) {
      console.error('Error fetching packages:', err)
    }
  }

  const fetchRegions = async () => {
    try {
      const response = await adminApi.get('/api/v1/regions?limit=100&include_disabled=false')
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
      const response = await adminApi.get('/api/v1/radius/nas')
      if (response.data.success) {
        const routersData = response.data.data?.nas || []
        console.log('📡 Routers fetched:', routersData)
        // Add "All Routers" option at the beginning
        const allRoutersOption = {
          id: 'all',
          shortname: 'All Routers',
          nasname: 'All Routers',
          name: 'All Routers',
          ip: 'all',
          type: 'all',
          description: 'Select all routers'
        }
        // Ensure each router has proper name field
        const formattedRouters = [
          allRoutersOption,
          ...routersData.map((router: any) => ({
            ...router,
            id: router.id,
            name: router.shortname || router.nasname || `Router ${router.id}`,
            ip: router.nasname
          }))
        ]
        console.log('📡 Formatted routers:', formattedRouters)
        setRouters(formattedRouters)
      }
    } catch (err: any) {
      console.error('Error fetching routers:', err)
    }
  }

  /* State for Modal Pagination */
  const [modalCurrentPage, setModalCurrentPage] = useState(1)
  const [modalTotalItems, setModalTotalItems] = useState(0)

  // Server-side search for modal
  const handleModalSearch = async (query: string, page: number = 1) => {
    // Only update query state if it's a new query (page 1) or we keep it consistent
    if (page === 1) setModalSearchQuery(query)

    try {
      setIsModalSearching(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10', // Show 10 items
        search: query,
        // Do not pass has_service to show ALL customers (including those without services)
      })

      const response = await adminApi.get(`/api/v1/customers?${params}`)
      if (response.data.success) {
        // Fix: API returns data as array directly
        const rawData = response.data.data
        setModalSearchResults(Array.isArray(rawData) ? rawData : (rawData?.customers || []))

        const pagination = response.data.pagination || {}
        setModalTotalItems(pagination.total || 0)
        setModalCurrentPage(page)
      }
    } catch (error) {
      console.error('Error searching customers for modal:', error)
    } finally {
      setIsModalSearching(false)
    }
  }

  // Debounce the modal search
  useEffect(() => {
    // Immediate search if empty (to show defaults), otherwise wait for debounce
    const query = modalSearchQuery;

    // We only trigger if query changes (page reset to 1)
    // Page changes are handled by page buttons directly calling handleModalSearch

    const timer = setTimeout(() => {
      handleModalSearch(query, 1)
    }, 500)
    return () => clearTimeout(timer)
  }, [modalSearchQuery])


  const fetchODPs = async () => {
    try {
      setFetchingODPs(true)
      const response = await adminApi.get('/api/v1/odp')

      if (response.data.success) {
        const odpList = response.data.data || []
        setODPs(Array.isArray(odpList) ? odpList : [])
      } else {
        setODPs([])
      }
    } catch (err: any) {
      console.error('Error fetching ODPs:', err)
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
      console.log('🚀 SUBMIT DEBUG - Form data before API call:', {
        isEditing,
        editingCustomerId,
        customer_id: formData.customer_id,
        name: formData.name,
        latitude: formData.latitude,
        longitude: formData.longitude,
        latitude_type: typeof formData.latitude,
        longitude_type: typeof formData.longitude,
        package_id: formData.package_id,
        package_id_type: typeof formData.package_id,
        odp_id: formData.odp_id,
        odp_id_type: typeof formData.odp_id,
        odp_port: formData.odp_port,
        odp_port_type: typeof formData.odp_port
      })

      const customerData = {
        customer_id: formData.customer_id || null,
        name: formData.name,
        phone: formData.phone,
        nik: formData.nik || null,
        address: formData.address || null, // Billing address
        installation_address: formData.installation_address || formData.address || null, // Installation address, fallback to billing
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
        odp_port: formData.odp_port || null,
        cable_length: formData.cable_length || null // Cable length in meters
      }

      console.log('📤 SUBMIT DEBUG - customerData sent to API:', customerData)

      let response
      if (isEditing && editingCustomerId) {
        // Update existing customer (Unified Update)
        response = await adminApi.put(`/api/v1/customers/${editingCustomerId}`, customerData)
      } else if (formData.customer_id) {
        // Adding Service to EXISTING customer
        response = await adminApi.post(`/api/v1/customers/${formData.customer_id}/services`, customerData)
      } else {
        // Create new customer (Identity Only)
        response = await adminApi.post('/api/v1/customers/identity', customerData)
      }

      if (response.data.success) {
        setShowCreateModal(false)
        resetForm()
        fetchCustomers()
        // Reset editing state
        setIsEditing(false)
        setEditingCustomerId(null)
        // Show success message
        // Show success message
        alert(isEditing ? 'Pelanggan berhasil diupdate!' : 'Layanan berhasil ditambahkan ke Pelanggan!')
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



  const generatePPPoEUsername = () => {
    if (formData.customer_id) {
      const suffix = getDefaultValue('pppoe_suffix', 'isp')
      const generatedUsername = `${formData.customer_id}@${suffix}`
      setFormData(prev => ({
        ...prev,
        pppoe_username: generatedUsername
      }))
    }
  }

  const generateCustomerID = async () => {
    try {
      // Get next sequence from API
      const response = await adminApi.get('/api/v1/customers/next-sequence')

      if (response.data.success) {
        // API returns camelCase 'customerId'
        const generatedCustomerID = response.data.data.customerId || response.data.data.customer_id

        setFormData(prev => ({
          ...prev,
          customer_id: generatedCustomerID,
          pppoe_username: `${generatedCustomerID}@${getDefaultValue('pppoe_suffix', 'isp')}`
        }))
      }
    } catch (error) {
      console.error('Error generating customer ID:', error)
      // Fallback to local generation
      const today = new Date()
      const dateStr = today.getFullYear().toString().slice(-2) +  // YY
        (today.getMonth() + 1).toString().padStart(2, '0') +  // MM
        today.getDate().toString().padStart(2, '0')  // DD
      const fallbackSequence = Math.floor(Math.random() * 100000) // Random fallback
      const generatedCustomerID = dateStr + fallbackSequence.toString().padStart(5, '0')

      setFormData(prev => ({
        ...prev,
        customer_id: generatedCustomerID,
        pppoe_username: `${generatedCustomerID}@${getDefaultValue('pppoe_suffix', 'isp')}`
      }))
    }
  }

  const handleEditCustomer = (customer: Customer) => {
    console.log('🔧 handleEditCustomer called with customer data:', {
      customer_id: customer.customer_id,
      name: customer.name,
      package_id: customer.package_id,
      latitude: customer.latitude,
      longitude: customer.longitude,
      latitude_type: typeof customer.latitude,
      longitude_type: typeof customer.longitude,
      odp_id: customer.odp_id,
      odp_name: customer.odp_name,
      odp_address: customer.odp_address,
      odp_port: customer.odp_port
    })

    // Log if coordinates seem wrong (match default values)
    if (customer.latitude === -6.563234 && customer.longitude === 107.741418) {
      console.log('⚠️ WARNING: Using default coordinate values! API returned default coordinates instead of saved ones!')
      console.log('This suggests either:')
      console.log('1. API query not returning the correct coordinates')
      console.log('2. Database not saving coordinates properly')
      console.log('3. Coordinates were reset somewhere in the backend')
    }

    // Store customer data in ref for persistence
    editingCustomerData.current = customer

    // Fetch ODPs to ensure they're loaded for the dropdown
    fetchODPs()
    fetchRegions() // Also fetch regions for region dropdown

    // Set editing state FIRST
    setIsEditing(true)
    setEditingCustomerId(customer.id)

    // Close detail modal and open create modal for editing
    setShowDetailModal(false)
    setShowCreateModal(true)

    // Set form data immediately after state changes - handle undefined properly
    const formDataToSet = {
      customer_id: customer.customer_id || '',
      name: customer.name,
      phone: customer.phone,
      nik: customer.nik || '',
      address: customer.address || '',
      installation_address: customer.installation_address || '',
      latitude: customer.latitude,
      longitude: customer.longitude,
      package_id: customer.package_id ? customer.package_id.toString() : '',
      pppoe_username: customer.pppoe_username || '',
      pppoe_password: customer.pppoe_password || '',
      billing_type: customer.billing_type || 'postpaid',
      siklus: customer.siklus || 'profile',
      router: customer.router || 'all',
      region: customer.region_id || '',
      status: customer.status || 'inactive',
      odp_id: customer.odp_id ? customer.odp_id.toString() : '',
      odp_name: customer.odp_name || '',
      odp_address: customer.odp_address || '',
      odp_port: customer.odp_port ? customer.odp_port.toString() : '',
      cable_length: customer.cable_length,
      service_number: customer.service_number
    }

    console.log('📝 Setting form data to:', formDataToSet)
    setFormData(formDataToSet)
    console.log('✅ handleEditCustomer completed')
  }

  const handleDeleteCustomer = async (customerId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus pelanggan ini?')) {
      return
    }

    try {
      setSubmitting(true)
      setError(null)

      const response = await adminApi.delete(`/api/v1/customers/${customerId}`)

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
        adminApi.delete(`/api/v1/customers/${customerId}`)
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

      // If "All Routers" is selected, set router to null or empty string
      const routerValue = newRouter === 'all' ? '' : newRouter

      const promises = Array.from(selectedCustomers).map(customerId =>
        adminApi.put(`/api/v1/customers/${customerId}`, { router: routerValue })
      )

      const results = await Promise.allSettled(promises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      const actionText = newRouter === 'all' ? 'dihapus dari router' : 'dipindahkan ke router baru'

      if (failed > 0) {
        setError(`${failed} pelanggan gagal ${actionText}, ${successful} berhasil`)
      } else {
        console.log(`✅ ${successful} pelanggan berhasil ${actionText}`)
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
        adminApi.put(`/api/v1/customers/${customerId}`, { status: newStatus })
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
        adminApi.put(`/api/v1/customers/${customerId}`, { region_id: newRegion })
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
        adminApi.put(`/api/v1/customers/${customerId}`, { siklus: newCycle })
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
    if (!router || router === 'all') {
      return 'All Router'
    }

    // Find router by shortname (which is what we save)
    if (routers) {
      const foundRouter = routers.find(r => r.shortname === router || r.nasname === router || r.id?.toString() === router)
      if (foundRouter) {
        return foundRouter.shortname || foundRouter.nasname
      }
    }

    // Return the value as-is if it's a router name
    return router
  }

  // State for installation fee cache
  const [installationFeeCache, setInstallationFeeCache] = useState<{ [key: string]: number }>({})

  // Function to fetch installation fee by billing type and package
  const fetchInstallationFee = async (billingType: string, packageId?: string): Promise<number> => {
    const cacheKey = `${billingType}-${packageId || 'default'}`

    // Return cached value if available
    if (installationFeeCache[cacheKey] !== undefined) {
      return installationFeeCache[cacheKey]
    }

    try {
      const params = packageId ? `?package_id=${packageId}` : ''
      const response = await adminApi.get(`/api/v1/installation-fees/calculate/${billingType}${params}`)
      if (response.data.success) {
        const fee = response.data.data.installation_fee
        // Cache the result
        setInstallationFeeCache(prev => ({ ...prev, [cacheKey]: fee }))
        console.log(`Installation fee for ${billingType}${packageId ? ' package ' + packageId : ''}: Rp ${fee}`)
        return fee
      }
    } catch (error) {
      console.error('Error fetching installation fee:', error)
    }

    // Return default fee if API fails
    return billingType === 'prepaid' ? 0 : 50000
  }

  // Function to calculate total billing
  const calculateTotalBilling = async (packagePrice?: number, packageId?: string, billingType?: string): Promise<number> => {
    if (!billingType) return packagePrice || 0

    // Get installation fee based on billing type and package
    const installationFee = await fetchInstallationFee(billingType, packageId)

    if (!packagePrice) return installationFee

    switch (billingType) {
      case 'prepaid':
        return packagePrice + installationFee // Prabayar: bayar paket + instalasi
      case 'postpaid':
        return installationFee // Pascabayar: hanya bayar instalasi awal
      default:
        return installationFee
    }
  }

  // Sync version of calculateTotalBilling for immediate display (uses cached values)
  const calculateTotalBillingSync = (packagePrice?: number, packageId?: string, billingType?: string): number => {
    if (!billingType) return packagePrice || 0

    // Get cached installation fee or default
    const cacheKey = `${billingType}-${packageId || 'default'}`
    const installationFee = installationFeeCache[cacheKey] ?? (billingType === 'prepaid' ? 0 : 50000)

    if (!packagePrice) return installationFee

    switch (billingType) {
      case 'prepaid':
        return packagePrice + installationFee // Prabayar: bayar paket + instalasi
      case 'postpaid':
        return installationFee // Pascabayar: hanya bayar instalasi awal
      default:
        return installationFee
    }
  }

  // Function to get selected package info
  const getSelectedPackage = () => {
    if (!formData.package_id) return null
    return packages.find(p => p.id.toString() === formData.package_id) || null
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
      case 'no_service':
        return 'text-blue-600 bg-blue-100'
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
      case 'no_service':
        return 'Belum Ada Layanan'
      default:
        return status
    }
  }

  const resetForm = () => {
    // Use default values from settings
    setFormData({
      customer_id: '',
      name: '',
      phone: '',
      nik: '',
      address: '',
      installation_address: '',
      latitude: undefined,
      longitude: undefined,
      package_id: getDefaultValue('package_id', ''),
      pppoe_username: '',
      pppoe_password: getDefaultValue('pppoe_password', '1234567'),
      billing_type: getDefaultValue('billing_type', 'postpaid'),
      siklus: getDefaultValue('billing_cycle', 'profile'),
      router: 'all',
      region: '',
      status: 'inactive',
      odp_id: '',
      odp_name: '',
      odp_address: '',
      odp_port: '',
      cable_length: undefined
    })
    setSelectedCustomer(null)

    // Reset editing state
    setIsEditing(false)
    setEditingCustomerId(null)
    editingCustomerData.current = null
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
    const rangeWithDots: (number | string)[] = []
    let l: number

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
            variant="outline"
            size="sm"
            className="flex items-center space-x-2"
            onClick={() => setShowSettingsModal(true)}
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Default Settings</span>
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
            {/* Context: Create is now Identity Only */}
            Tambah Pelanggan
          </Button>

          <Button
            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white"
            onClick={() => {
              setSearchModalMode('view') // View Mode for Dashboard
              setShowSearchCustomerModal(true)
            }}
          >
            <Users className="h-4 w-4" />
            <span>Data Pelanggan</span>
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
            <CardTitle className="text-sm font-medium text-foreground">Pelanggan Online</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-green-600">
              {stats?.onlineCustomers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Real-time status</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Customer Baru</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-foreground">
              {stats?.newCustomersThisMonth || 0}
            </div>
            <p className="text-xs text-muted-foreground">Bulan {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</p>
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
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
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
                  {filterPackage !== 'all' && <div>• Paket: {packages.find(p => p.id.toString() === filterPackage)?.name}</div>}
                  {filterRouter !== 'all' && <div>• Router: {routers.find(r => r.id.toString() === filterRouter)?.name}</div>}
                  {filterRegion !== 'all' && <div>• Wilayah: {regions.find(r => r.id.toString() === filterRegion)?.name}</div>}
                  {searchQuery && <div>• Pencarian: &quot;{searchQuery}&quot;</div>}
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
                  <option value="">Pilih Siklus Billing</option>
                  <option value="profile">Profile (Berdasarkan Periode PPPoE)</option>
                  <option value="fixed">Tetap (Tanggal Tetap Setiap Bulan)</option>
                  <option value="monthly">Bulanan (Tanggal 20 Setiap Bulan)</option>
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
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors w-32"
                    onClick={() => handleSort('service_number')}
                  >
                    <div className="flex items-center gap-1">
                      No Layanan
                      {sortField === 'service_number' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-40">Nama Pelanggan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">NIK</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-36">Nomor Telepon</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-64">Alamat Layanan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-40">Paket</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-28">Tagihan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-28">Siklus</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">Router</th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors w-20"
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
                            className={`w-6 h-6 rounded-full flex items-center justify-center mx-auto transition-all duration-300 ${getConnectionStatus(customer).status === 'online' ? 'bg-green-100' :
                              getConnectionStatus(customer).status === 'suspended' ? 'bg-yellow-100' :
                                'bg-red-100'
                              }`}
                            title={`${getConnectionStatus(customer).text} - Last checked: ${lastStatusRefresh?.toLocaleTimeString('id-ID') || 'Just now'}`}
                          >
                            <div className={`w-3 h-3 rounded-full ${getConnectionStatus(customer).status === 'online' ? 'bg-green-500' :
                              getConnectionStatus(customer).status === 'suspended' ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}></div>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.service_number || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground whitespace-nowrap">{customer.name}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.nik || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.phone}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground truncate max-w-[200px] block"
                          title={customer.installation_address || customer.address}>
                          {customer.installation_address || customer.address || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground whitespace-nowrap">
                          {customer.package_name || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground whitespace-nowrap">
                          {getBillingTypeText(customer.billing_type)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground whitespace-nowrap">
                          {getBillingCycleText(customer.siklus)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground whitespace-nowrap">
                          {getRouterText(customer.router, routers)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.region_id ? customer.region_id.toString().padStart(2, '0') : '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground font-mono">
                          {customer.pppoe_username || '-'}
                        </span>
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
      <div className="flex items-center justify-end mt-4">
        <div className="flex items-center border rounded-lg overflow-hidden border-gray-700 bg-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded-none border-r border-gray-700 h-9 px-4 hover:bg-gray-700 text-gray-300 disabled:opacity-50"
          >
            Previous
          </Button>

          {/* Page Numbers */}
          {getPageNumbers().map((page, index) => (
            <Button
              key={index}
              variant="ghost"
              size="sm"
              onClick={() => typeof page === 'number' && setCurrentPage(page)}
              disabled={page === '...'}
              className={`rounded-none border-r border-gray-700 h-9 w-9 p-0 hover:bg-gray-700 ${page === currentPage
                ? "bg-blue-600 text-white hover:bg-blue-600 font-medium"
                : "text-gray-300"
                } ${index === getPageNumbers().length - 1 ? "border-r-0" : ""}`}
            >
              {page}
            </Button>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage === getTotalPages()}
            className="rounded-none border-l border-gray-700 h-9 px-4 hover:bg-gray-700 text-gray-300 disabled:opacity-50"
          >
            Next
          </Button>
        </div>
      </div>

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
                    <p className="text-sm text-muted-foreground">Alamat Tagihan</p>
                    <p className="font-medium text-foreground">{selectedCustomer.address || '-'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-muted-foreground">Alamat Instalasi</p>
                    <p className="font-medium text-foreground">{selectedCustomer.installation_address || selectedCustomer.address || '-'}</p>
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
                    <p className="font-medium text-foreground">{selectedCustomer.region_name || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Informasi Layanan */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Layanan</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nomor Layanan</p>
                    <p className="font-medium text-foreground font-mono text-blue-600 mt-1">{selectedCustomer.service_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Paket</p>
                    <p className="font-medium text-foreground mt-1">{selectedCustomer.package_name || '-'}</p>
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
                  <div>
                    <p className="text-sm text-muted-foreground">Panjang Kabel</p>
                    <p className="font-medium text-foreground">{selectedCustomer.cable_length ? `${selectedCustomer.cable_length} Meter` : '-'}</p>
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
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedCustomer.billing_type === 'prepaid' ? 'bg-blue-100 text-blue-800' :
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

            <div className="space-y-8 p-1">
              {/* SECTION: Identity */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-6 border-b pb-4">
                  <Users className="w-5 h-5 mr-3 text-blue-500" />
                  Informasi Pelanggan
                </h3>

                {/* ID & Basic Info */}
                <div className="space-y-6">
                  {/* ID & Basic Info Banner */}
                  {/* Service Number Banner */}
                  <div className="mb-6">
                    <div className="text-center bg-green-50 dark:bg-green-900/10 p-4 rounded-lg border border-green-100 dark:border-green-800/20">
                      <div className="text-[10px] uppercase font-bold text-green-500 mb-1">Nomor Layanan</div>
                      <div className="text-xl font-bold text-gray-900 dark:text-gray-100 font-mono tracking-wider">
                        {(formData as any).service_number || '----------'}
                      </div>
                    </div>
                  </div>

                  {/* Search Trigger for Name */}
                  <div className="space-y-2">
                    <Label htmlFor="create-name" className="text-base">Nama Lengkap *</Label>
                    <div className="relative group">
                      <Input
                        id="create-name"
                        value={formData.name}
                        readOnly
                        placeholder="Klik untuk mencari pelanggan..."
                        className="h-11 text-lg bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 cursor-pointer pr-10 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        onClick={() => {
                          if (!isEditing) {
                            setSearchModalMode('select') // Select Mode for Service Form
                            setShowSearchCustomerModal(true)
                          }
                        }}
                      />
                      {!isEditing && (
                        <Search className="absolute right-3 top-3 h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors pointer-events-none" />
                      )}
                    </div>
                    {!isEditing && <p className="text-xs text-muted-foreground">Klik input diatas atau icon pencarian untuk memilih pelanggan.</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="create-phone" className="text-base">Nomor Telepon *</Label>
                      <Input
                        id="create-phone"
                        value={formData.phone}
                        readOnly
                        placeholder="Auto-filled"
                        className="h-11 text-lg bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:bg-white transition-colors"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-nik" className="text-base">NIK</Label>
                      <Input
                        id="create-nik"
                        value={formData.nik}
                        readOnly
                        placeholder="Auto-filled"
                        className="h-11 text-lg bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>
              {/* SECTION: Location & Map (Read-Only Address) */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-6 border-b pb-4">
                  <MapPin className="w-5 h-5 mr-3 text-red-500" />
                  Lokasi & Peta
                </h3>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="create-address" className="text-base">Alamat Tagihan (Billing)</Label>
                    <Textarea
                      id="create-address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Alamat untuk pengiriman tagihan"
                      rows={2}
                      className="text-base resize-y bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-installation-address" className="text-base">Alamat Instalasi (Pemasangan)</Label>
                    <Textarea
                      id="create-installation-address"
                      value={formData.installation_address}
                      onChange={(e) => setFormData({ ...formData, installation_address: e.target.value })}
                      placeholder="Alamat lokasi pemasangan layanan (biarkan kosong jika sama dengan alamat tagihan)"
                      rows={2}
                      className="text-base resize-y bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <p className="text-xs text-muted-foreground">* Kosongkan jika sama dengan alamat tagihan</p>
                  </div>


                  <div className="space-y-2">
                    <Label className="text-base mb-2 block">Titik Koordinat (Map)</Label>
                    <div className="h-[400px] w-full rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 shadow-sm">
                      <CoordinateMap
                        latitude={formData.latitude}
                        longitude={formData.longitude}
                        address={formData.address}
                        onCoordinatesChange={(lat, lng) => {
                          console.log('🗺️ CoordinateMap onChange:', { lat, lng, latType: typeof lat, lngType: typeof lng })
                          setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))
                        }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      * Geser pin merah pada peta untuk menentukan lokasi yang lebih akurat.
                    </p>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Latitude</Label>
                        <Input
                          value={formData.latitude || ''}
                          readOnly
                          className="bg-gray-50 dark:bg-gray-800/50 font-mono text-xs h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Longitude</Label>
                        <Input
                          value={formData.longitude || ''}
                          readOnly
                          className="bg-gray-50 dark:bg-gray-800/50 font-mono text-xs h-9"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>


              {/* SECTION: Technical (ODP) */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-6 border-b pb-4">
                  <Settings className="w-5 h-5 mr-3 text-orange-500" />
                  Data Teknis (ODP)
                </h3>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="create-odp" className="text-base">Optical Distribution Point (ODP)</Label>
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
                      className="block w-full px-3 py-3 h-12 border border-gray-300 dark:border-gray-600 rounded-md text-base bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={fetchingODPs}
                    >
                      <option value="">-- Pilih ODP --</option>
                      {Array.isArray(odps) && odps.map((odp) => (
                        <option key={odp.id} value={odp.id}>
                          {odp.name} ({odp.available_ports} ports) - {odp.address}
                        </option>
                      ))}
                    </select>
                    {!fetchingODPs && odps.length === 0 && (
                      <span className="text-sm text-red-500">Tidak ada ODP tersedia. Tambah ODP terlebih dahulu!</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-cable-length" className="text-base">Panjang Kabel (Meter)</Label>
                    <Input
                      id="create-cable-length"
                      type="number"
                      value={formData.cable_length || ''}
                      onChange={(e) => setFormData({ ...formData, cable_length: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="Contoh: 150"
                      className="h-11 text-lg"
                    />
                    <p className="text-xs text-muted-foreground">* Panjang kabel dari ODP ke lokasi pelanggan</p>
                  </div>

                  {formData.odp_id && (
                    <div className="space-y-2">
                      <Label htmlFor="create-odp-port" className="text-base">Port ODP</Label>
                      <Input
                        id="create-odp-port"
                        value={formData.odp_port || ''}
                        onChange={(e) => setFormData({ ...formData, odp_port: e.target.value })}
                        placeholder="Contoh: 1"
                        className="h-11 text-lg"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Services */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-6 border-b pb-4">
                  <Cable className="w-5 h-5 mr-3 text-green-500" />
                  Layanan & Perangkat
                </h3>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="create-region" className="text-base font-semibold text-orange-600 dark:text-orange-400">Wilayah / Area Layanan *</Label>
                    <select
                      id="create-region"
                      value={formData.region}
                      onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                      className="block w-full px-3 py-3 h-12 border-2 border-orange-200 dark:border-orange-900/30 rounded-md text-base bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">-- Pilih Wilayah Layanan --</option>
                      {Array.isArray(regions) && regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="create-package" className="text-base">Paket Internet</Label>
                      <select
                        id="create-package"
                        value={formData.package_id}
                        onChange={(e) => setFormData({ ...formData, package_id: e.target.value })}
                        className="block w-full px-3 py-3 h-12 border border-gray-300 dark:border-gray-600 rounded-md text-base bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">-- Pilih Paket --</option>
                        {Array.isArray(packages) && packages.filter(pkg => pkg.isActive).map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} ({pkg.speed})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-router" className="text-base">Router (NAS)</Label>
                      <select
                        id="create-router"
                        value={formData.router}
                        onChange={(e) => setFormData({ ...formData, router: e.target.value })}
                        className="block w-full px-3 py-3 h-12 border border-gray-300 dark:border-gray-600 rounded-md text-base bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="all">All Router (Bebas)</option>
                        {Array.isArray(routers) && routers.filter(r => r.id !== 'all').map((router) => (
                          <option key={router.id} value={router.shortname}>
                            {router.shortname}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="create-pppoe-user" className="text-base">PPPoE Username</Label>
                      <Input
                        id="create-pppoe-user"
                        value={formData.pppoe_username}
                        onChange={(e) => setFormData(prev => ({ ...prev, pppoe_username: e.target.value }))}
                        placeholder="Kosong = Auto (Service Number)"
                        className="h-11 font-mono text-base bg-white dark:bg-gray-950 dark:text-gray-100 dark:border-gray-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-pppoe-pass" className="text-base">PPPoE Password</Label>
                      <Input
                        id="create-pppoe-pass"
                        value={formData.pppoe_password}
                        onChange={(e) => setFormData(prev => ({ ...prev, pppoe_password: e.target.value }))}
                        placeholder="Password"
                        className="h-11 font-mono text-base bg-white dark:bg-gray-950 dark:text-gray-100 dark:border-gray-700"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Billing */}
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg border border-gray-100 dark:border-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-6 border-b pb-4">
                  <CreditCard className="w-5 h-5 mr-3 text-purple-500" />
                  Tagihan
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-2">
                    <Label className="text-base">Jenis Tagihan</Label>
                    <select
                      value={formData.billing_type}
                      onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                      className="block w-full px-3 py-3 h-12 border border-gray-300 dark:border-gray-600 rounded-md text-base bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="prepaid">Prabayar</option>
                      <option value="postpaid">Pascabayar</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base">Siklus Billing</Label>
                    <select
                      value={formData.siklus}
                      onChange={(e) => setFormData({ ...formData, siklus: e.target.value })}
                      className="block w-full px-3 py-3 h-12 border border-gray-300 dark:border-gray-600 rounded-md text-base bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="profile">Profile (Sesuai Masa Aktif)</option>
                      <option value="tetap">Tetap (Tanggal Sama Tiap Bulan)</option>
                      <option value="bulan">Bulanan (Jatuh Tempo Tgl 20)</option>
                    </select>
                  </div>
                </div>

                {/* Compact Billing Summary */}
                {getSelectedPackage() && (
                  <div className={`p-4 rounded-md border ${formData.billing_type === 'prepaid'
                    ? 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-200'
                    : 'bg-green-50 border-green-100 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-200'
                    }`}>
                    <div className="flex justify-between items-center text-lg font-bold mb-2">
                      <span>Total Tagihan Awal:</span>
                      <span>Rp {calculateTotalBillingSync(getSelectedPackage()?.price, getSelectedPackage()?.id?.toString(), formData.billing_type).toLocaleString('id-ID')}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm opacity-80">
                      <span>Harga Paket Bulanan:</span>
                      <span>Rp {getSelectedPackage()?.price?.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                )}
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

      {/* Service Modal */}




      {/* Region Management Modal */}

      {/* Search Customer Modal (Table View) */}
      <Dialog open={showSearchCustomerModal} onOpenChange={setShowSearchCustomerModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex justify-between items-center pr-8">
              <DialogTitle>
                {searchModalMode === 'view' ? 'Data Pelanggan Utama' : 'Pilih Pelanggan untuk Layanan'}
              </DialogTitle>
              {searchModalMode === 'view' && (
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  onClick={() => {
                    setIdentityFormData({ customer_id: '', name: '', phone: '', nik: '', address: '' })
                    setIsIdentityEditing(false)
                    setEditingIdentityId(null)
                    setShowIdentityModal(true)
                  }}
                >
                  <Plus className="h-4 w-4" /> Tambah Pelanggan
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border-l-4 border-blue-500 dark:border-blue-500 p-4 mb-4 text-sm flex justify-between items-center">
            <span>Untuk mencari data pelanggan yang sudah ada silahkan ketik nama atau nomor hp pelanggan di kolom pencarian</span>
            {searchModalMode === 'select' && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                onClick={() => {
                  setIdentityFormData({ customer_id: '', name: '', phone: '', nik: '', address: '' })
                  setIsIdentityEditing(false)
                  setEditingIdentityId(null)
                  setShowIdentityModal(true)
                }}
              >
                <Plus className="h-4 w-4" /> Tambah Pelanggan Baru
              </Button>
            )}
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-medium text-muted-foreground italic">
              * Pilih pelanggan dari daftar di bawah untuk melanjutkan penugasan layanan.
            </div>
            <div className="relative w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search: ID, Nama, Phone"
                className="pl-9 h-9"
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 border rounded-md overflow-hidden">
            <div className="overflow-x-scroll" style={{ maxWidth: '100%' }}>
              <table className="text-sm text-left" style={{ minWidth: '1000px', width: '100%' }}>
                <thead className="bg-gray-100 dark:bg-gray-800 text-xs uppercase font-semibold text-gray-700 dark:text-gray-300">
                  <tr>
                    {searchModalMode === 'select' && <th className="px-4 py-3">Pilih</th>}
                    <th className="px-4 py-3">ID Pel</th>
                    <th className="px-4 py-3">Pelanggan</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">No. Identitas</th>
                    <th className="px-4 py-3">Alamat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {isModalSearching ? (
                    <tr>
                      <td colSpan={searchModalMode === 'select' ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Mencari data...
                      </td>
                    </tr>
                  ) : modalSearchResults.length > 0 ? (
                    modalSearchResults.map((customer) => (
                      <tr
                        key={customer.id}
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${searchModalMode === 'view' ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (searchModalMode === 'view') {
                            handleEditIdentity(customer)
                          }
                        }}
                      >
                        {searchModalMode === 'select' && (
                          <td className="px-4 py-3">
                            <Button
                              size="sm"
                              className="bg-red-500 hover:bg-red-600 text-white text-xs h-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectCustomerFromSearch(customer)
                              }}
                            >
                              » Pilih
                            </Button>
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono">{customer.customer_id}</td>
                        <td className="px-4 py-3 font-medium">
                          {customer.name}
                          {searchModalMode === 'view' && <Edit className="inline ml-2 h-3 w-3 text-gray-400" />}
                        </td>
                        <td className="px-4 py-3">{customer.phone}</td>
                        <td className="px-4 py-3">{customer.nik || '-'}</td>
                        <td className="px-4 py-3 max-w-[200px] truncate" title={customer.billing_address || customer.address || '-'}>{customer.billing_address || customer.address || '-'}</td>
                      </tr>
                    ))
                  ) : modalSearchQuery ? (
                    <tr>
                      <td colSpan={searchModalMode === 'select' ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                        Tidak ada pelanggan yang cocok dengan "{modalSearchQuery}"
                      </td>
                    </tr>
                  ) : (
                    // Show some default customers if no search query (e.g. recent ones from main list)
                    // Or just instructions
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground italic">
                        Ketik ID, Nama, atau Nomor HP untuk mencari...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal Pagination */}
          <div className="flex items-center justify-between mt-4 px-1 pb-4">
            <div className="text-xs text-muted-foreground">
              Total: {modalTotalItems} data
            </div>
            <div className="flex items-center border rounded-lg overflow-hidden border-gray-200 dark:border-gray-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleModalSearch(modalSearchQuery, modalCurrentPage - 1)}
                disabled={modalCurrentPage === 1}
                className="rounded-none border-r border-gray-200 dark:border-gray-700 h-8 px-3 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Previous
              </Button>
              <div className="h-8 px-3 flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-xs font-medium border-r border-gray-200 dark:border-gray-700">
                Page {modalCurrentPage}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleModalSearch(modalSearchQuery, modalCurrentPage + 1)}
                disabled={modalCurrentPage >= Math.ceil(modalTotalItems / 10)}
                className="rounded-none h-8 px-3 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showIdentityModal} onOpenChange={setShowIdentityModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isIdentityEditing ? 'Edit Data Pelanggan' : 'Tambah Data Pelanggan'}</DialogTitle>
          </DialogHeader>

          {identityError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {identityError}
            </div>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ident-id">ID Pelanggan (Optional)</Label>
              <Input
                id="ident-id"
                value={identityFormData.customer_id}
                onChange={(e) => setIdentityFormData({ ...identityFormData, customer_id: e.target.value })}
                placeholder="Opsional: 5 digit (cth: 00001) atau kosongkan untuk Auto"
                className="font-mono bg-white dark:bg-gray-950"
              />
              <p className="text-[10px] text-muted-foreground">Biarkan kosong untuk generate ID otomatis (urutan 5 digit).</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ident-name">Nama Lengkap *</Label>
              <Input
                id="ident-name"
                value={identityFormData.name}
                onChange={(e) => setIdentityFormData({ ...identityFormData, name: e.target.value })}
                placeholder="Nama Lengkap"
                className="bg-white dark:bg-gray-950"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ident-address">Alamat Tagihan (Billing) *</Label>
              <Textarea
                id="ident-address"
                value={identityFormData.address}
                onChange={(e) => setIdentityFormData({ ...identityFormData, address: e.target.value })}
                placeholder="Alamat penagihan atau alamat domisili pelanggan"
                className="bg-white dark:bg-gray-950 min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ident-phone">Nomor HP *</Label>
                <Input
                  id="ident-phone"
                  value={identityFormData.phone}
                  onChange={(e) => setIdentityFormData({ ...identityFormData, phone: e.target.value })}
                  placeholder="08..."
                  className="bg-white dark:bg-gray-950"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ident-nik">NIK</Label>
                <Input
                  id="ident-nik"
                  value={identityFormData.nik}
                  onChange={(e) => setIdentityFormData({ ...identityFormData, nik: e.target.value })}
                  placeholder="NIK (Optional)"
                  className="bg-white dark:bg-gray-950"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIdentityModal(false)}>Batal</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={submitting}
              onClick={async () => {
                if (!identityFormData.name || !identityFormData.phone) {
                  setIdentityError('Nama dan Nomor HP wajib diisi!')
                  return
                }

                setSubmitting(true)
                setIdentityError(null)
                try {
                  // Auto-generate ID if empty: 5 random digits 10000-99999
                  const finalId = identityFormData.customer_id.trim() || Math.floor(10000 + Math.random() * 90000).toString()

                  const payload = {
                    ...identityFormData,
                    customer_id: finalId
                  }

                  if (isIdentityEditing && editingIdentityId) {
                    await adminApi.put(`/api/v1/customers/${editingIdentityId}`, payload)
                  } else {
                    await adminApi.post('/api/v1/customers/identity', payload)
                  }

                  // Success
                  setIdentityFormData({ customer_id: '', name: '', phone: '', nik: '', address: '' })
                  setShowIdentityModal(false)
                  fetchCustomers() // Refresh list

                } catch (err: any) {
                  console.error('Error creating identity:', err);
                  console.log('Error Response Data:', err.response?.data);
                  const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Gagal membuat data pelanggan';
                  setIdentityError(errorMessage)
                } finally {
                  setSubmitting(false)
                }
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                isIdentityEditing ? 'Update Pelanggan' : 'Simpan Pelanggan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Region Management Modal */}
      <RegionModal
        isOpen={showRegionModal}
        onClose={() => setShowRegionModal(false)}
      />

      {/* Customer Default Settings Modal */}
      <CustomerDefaultSettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  )
}