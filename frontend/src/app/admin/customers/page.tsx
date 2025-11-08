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
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select' // Replaced with native HTML selects
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'
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
  billing_cycle?: 'profile' | 'tetap' | 'bulan'
  router?: string
  region?: string
  billing_status?: 'paid' | 'pending' | 'overdue'
  created_at: string
  updated_at: string
  last_invoice_date?: string
  is_online?: boolean
  install_date?: string
  active_date?: string
  isolir_date?: string
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
  billing_cycle: string
  router: string
  region: string
  status: string
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
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null)
  const [showRegionModal, setShowRegionModal] = useState(false)
  const [regions, setRegions] = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalItems, setTotalItems] = useState(0)
  const [sortField, setSortField] = useState<'customer_id' | 'isolir_date' | 'region' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
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
    billing_cycle: 'tetap',
    router: 'all',
    region: '',
    status: 'active'
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchCustomers()
    fetchPackages()
    fetchRegions()
    fetchRouters()
  }, [currentPage, pageSize, searchQuery, filterStatus, sortField, sortDirection])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
        sort_field: sortField || '',
        sort_direction: sortDirection,
      })

      const response = await api.get(`${endpoints.customers.list}?${params}`)

      if (response.data.success) {
        setCustomers(response.data.data.customers || [])
        const pagination = response.data.data.pagination || {}
        setTotalItems(pagination.total || 0)

        const customerList = response.data.data.customers || []
        setStats({
          totalCustomers: customerList.length,
          activeCustomers: customerList.filter((c: Customer) => c.status === 'active').length,
          inactiveCustomers: customerList.filter((c: Customer) => c.status === 'inactive').length,
          suspendedCustomers: customerList.filter((c: Customer) => c.status === 'suspended').length,
          totalRevenue: customerList.reduce((sum: number, c: Customer) => sum + (c.package_price || 0), 0),
          outstandingBalance: 0,
        })
      }
    } catch (err: any) {
      console.error('Error fetching customers:', err)
      setError(err.message || 'Failed to load customers')
    } finally {
      setLoading(false)
    }
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
        setRouters(routersData)
      }
    } catch (err: any) {
      console.error('Error fetching routers:', err)
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
        billing_cycle: formData.billing_cycle || 'tetap',
        router: formData.router || 'all',
        region: formData.region || null,
        status: formData.status || 'active'
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
      billing_cycle: customer.billing_cycle || 'bulan',
      router: customer.router || 'all',
      region: customer.region || '',
      status: customer.status || 'active'
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
      case 'profile':
        return 'Profile'
      case 'tetap':
        return 'Tetap'
      case 'bulan':
        return 'Bulanan'
      default:
        return '-'
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
      billing_cycle: 'tetap',
      router: 'all',
      region: '',
      status: 'active'
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
                <option value="active">Aktif</option>
                <option value="inactive">Tidak Aktif</option>
                <option value="suspended">Ditangguh</option>
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Daftar Pelanggan</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tampilkan:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value))
                  setCurrentPage(1)
                }}
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
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-center p-3 font-semibold text-foreground whitespace-nowrap w-12"></th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('customer_id')}
                  >
                    <div className="flex items-center gap-1">
                      ID Pelanggan
                      {sortField === 'customer_id' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Nama Pelanggan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">NIK</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Nomor Telepon</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Alamat</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap w-32">Paket</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Tagihan</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Siklus</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Router</th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('region')}
                  >
                    <div className="flex items-center gap-1">
                      Wilayah
                      {sortField === 'region' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">PPPoE Username</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Tanggal Daftar</th>
                  <th className="text-left p-3 font-semibold text-foreground whitespace-nowrap">Tanggal Aktif</th>
                  <th
                    className="text-left p-3 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-muted/50 transition-colors"
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
                      onClick={() => {
                        setSelectedCustomer(customer)
                        setShowDetailModal(true)
                      }}
                    >
                      <td className="p-3 text-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          customer.status === 'active' ? 'bg-success/20 text-success' :
                          customer.status === 'suspended' || customer.status === 'inactive' ? 'bg-error/20 text-error' :
                          'bg-muted/20 text-muted-foreground'
                        } mx-auto`}>
                          <div className={`w-3 h-3 rounded-full ${
                            customer.status === 'active' ? 'bg-success' :
                            customer.status === 'suspended' || customer.status === 'inactive' ? 'bg-error' :
                            'bg-muted'
                          }`}></div>
                        </div>
                      </td>
                      <td className="p-3">
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
                        <div className="max-w-xs">
                          <p className="text-sm text-foreground truncate" title={customer.address}>
                            {customer.address || '-'}
                          </p>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={customer.package_name}>
                          {customer.package_name || '-'}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          customer.billing_type === 'prepaid' ? 'bg-blue-100 text-blue-800' :
                          customer.billing_type === 'postpaid' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getBillingTypeText(customer.billing_type)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {getBillingCycleText(customer.billing_cycle)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.router === 'all' ? 'All Router' : (customer.router || '-')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
                          {customer.region || '-'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-foreground">
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
                        <span className={`text-sm ${customer.isolir_date || customer.status === 'suspended' || customer.status === 'inactive' ? 'text-error font-medium' : 'text-foreground'}`}>
                          {formatDate(customer.isolir_date || '-')}
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
                    <p className="font-medium text-foreground font-mono">{selectedCustomer.customer_id || '-'}</p>
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
                    <p className="font-medium text-foreground">{selectedCustomer.region || '-'}</p>
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
                    <p className="font-medium text-foreground">{selectedCustomer.router === 'all' ? 'All Router' : (selectedCustomer.router || '-')}</p>
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
                      {getBillingCycleText(selectedCustomer.billing_cycle)}
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
                    <p className={`font-medium ${selectedCustomer.isolir_date || selectedCustomer.status === 'suspended' || selectedCustomer.status === 'inactive' ? 'text-red-600' : 'text-foreground'}`}>
                      {formatDate(selectedCustomer.isolir_date || '-')}
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
                      <option key={region.id} value={region.name}>
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
                  <Label htmlFor="create-billing-cycle">Siklus Billing</Label>
                  <select
                    id="create-billing-cycle"
                    value={formData.billing_cycle}
                    onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Pilih siklus billing</option>
                    <option value="profile">Profile</option>
                    <option value="tetap">Tetap</option>
                    <option value="bulan">Bulanan</option>
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

              <div className="space-y-2">
                <Label htmlFor="create-status">Status Pelanggan</Label>
                <select
                  id="create-status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Pilih status</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                  <option value="suspended">Ditangguh</option>
                </select>
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