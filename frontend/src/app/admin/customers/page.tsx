'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Users,
  Search,
  Plus,
  Download,
  Filter,
  Eye,
  Edit,
  Trash2,
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  Activity,
  DollarSign,
  X,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'

interface Customer {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  package_name?: string
  status: 'active' | 'inactive' | 'suspended'
  package_id?: string
  created_at: string
  updated_at: string
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
  const [stats, setStats] = useState<CustomerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchCustomers()
  }, [currentPage, searchQuery, filterStatus])

  const fetchCustomers = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching customers via API')

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '50',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })

      const response = await api.get(`${endpoints.customers.list}?${params}`)

      if (response.data.success) {
        setCustomers(response.data.data.customers || [])
        setTotalPages(response.data.data.pagination?.totalPages || 1)

        // Calculate stats from customer data
        const customerList = response.data.data.customers || []
        setStats({
          totalCustomers: customerList.length,
          activeCustomers: customerList.filter(c => c.status === 'active').length,
          inactiveCustomers: customerList.filter(c => c.status === 'inactive').length,
          suspendedCustomers: customerList.filter(c => c.status === 'suspended').length,
          totalRevenue: 0,
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

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         customer.phone.includes(searchQuery) ||
                         (customer.email && customer.email.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesFilter = filterStatus === 'all' || customer.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
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
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 animate-pulse">
                  <div className="h-12 w-12 bg-muted rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
          <Button className="flex items-center space-x-2">
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
            <CardTitle className="text-sm font-medium text-foreground">Tagihan Menunggak</CardTitle>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold text-error">
              {stats?.suspendedCustomers || 0}
            </div>
            <p className="text-xs text-muted-foreground">Perlu ditagih</p>
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
                  placeholder="Cari pelanggan..."
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
          <CardTitle>Daftar Pelanggan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-foreground">Nama</th>
                  <th className="text-left p-4 font-medium text-foreground">Telepon</th>
                  <th className="text-left p-4 font-medium text-foreground">Paket</th>
                  <th className="text-left p-4 font-medium text-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-foreground">Tanggal Registrasi</th>
                  <th className="text-left p-4 font-medium text-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-foreground">{customer.name}</p>
                          <p className="text-sm text-muted-foreground">{customer.email || '-'}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center text-sm">
                          <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                          {customer.phone}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-foreground">{customer.package_name || '-'}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(customer.status)}`}>
                          {getStatusText(customer.status)}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-foreground">
                        {formatDate(customer.created_at)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedCustomer(customer)
                              setShowDetailModal(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-error hover:text-error"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center space-y-2">
                        <Users className="h-12 w-12 text-muted-foreground" />
                        <p>No customers found</p>
                        <p className="text-sm">Try adjusting your search or filter criteria</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Detail Pelanggan</h2>
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
                  <p className="text-sm text-muted-foreground">Nama Lengkap</p>
                  <p className="font-medium text-foreground">{selectedCustomer.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telepon</p>
                  <p className="font-medium text-foreground">{selectedCustomer.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground">{selectedCustomer.email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Alamat</p>
                  <p className="font-medium text-foreground">{selectedCustomer.address || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paket Layanan</p>
                  <p className="font-medium text-foreground">{selectedCustomer.package_name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedCustomer.status)}`}>
                    {getStatusText(selectedCustomer.status)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tanggal Registrasi</p>
                  <p className="font-medium text-foreground">{formatDate(selectedCustomer.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Terakhir Diupdate</p>
                  <p className="font-medium text-foreground">{formatDate(selectedCustomer.updated_at)}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-foreground mb-4">Informasi Tambahan</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-info">{selectedCustomer.id}</p>
                    <p className="text-sm text-muted-foreground">ID Pelanggan</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-warning">{selectedCustomer.package_id || '-'}</p>
                    <p className="text-sm text-muted-foreground">ID Paket</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}