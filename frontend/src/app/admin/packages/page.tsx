'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Package,
  Search,
  Plus,
  Download,
  Filter,
  Edit,
  Trash2,
  Users,
  Activity,
  Wifi,
  DollarSign,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { api, endpoints } from '@/lib/api'

interface ServicePackage {
  id: string
  name: string
  description: string
  price: number
  speed: string
  duration: string
  isActive: boolean
  customerCount: number
  totalRevenue: number
  features: string[]
  createdAt: string
}

interface PackageStats {
  totalPackages: number
  activePackages: number
  totalCustomers: number
  totalRevenue: number
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [stats, setStats] = useState<PackageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    fetchPackages()
  }, [searchQuery, filterStatus])

  const fetchPackages = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching packages via API')

      const params = new URLSearchParams({
        limit: '50',
        search: searchQuery,
        status: filterStatus === 'all' ? '' : filterStatus,
      })

      const response = await api.get(`${endpoints.packages.list}?${params}`)

      if (response.data.success) {
        setPackages(response.data.data.packages || [])

        // Calculate stats from package data
        const packageList = response.data.data.packages || []
        setStats({
          totalPackages: packageList.length,
          activePackages: packageList.filter(p => p.isActive).length,
          totalCustomers: packageList.reduce((sum, p) => sum + p.customerCount, 0),
          totalRevenue: packageList.reduce((sum, p) => sum + p.totalRevenue, 0),
        })
      }
    } catch (err: any) {
      console.error('Error fetching packages:', err)
      setError(err.message || 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (isActive: boolean) => {
    return isActive ? 'text-success bg-success/10' : 'text-error bg-error/10'
  }

  const getStatusText = (isActive: boolean) => {
    return isActive ? 'Aktif' : 'Tidak Aktif'
  }

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Paket Layanan</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-8 bg-muted rounded w-1/2"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Paket Layanan</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading packages</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button onClick={fetchPackages}>Try Again</Button>
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
        <h1 className="text-2xl font-semibold text-foreground">Paket Layanan</h1>
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
            Tambah Paket
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Paket</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">{stats.totalPackages}</div>
              <p className="text-xs text-muted-foreground">Semua paket</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Paket Aktif</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-success">
                {stats.activePackages}
              </div>
              <p className="text-xs text-muted-foreground">Sedang aktif</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Pelanggan</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">
                {stats.totalCustomers.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Semua paket</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-foreground">Total Pendapatan</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(stats.totalRevenue)}
              </div>
              <p className="text-xs text-muted-foreground">Semua waktu</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari paket layanan..."
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
              </select>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Packages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {packages.map((pkg) => (
          <Card key={pkg.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-foreground">{pkg.name}</CardTitle>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(pkg.isActive)}`}>
                  {getStatusText(pkg.isActive)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{pkg.description}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Price and Speed */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(pkg.price)}</p>
                  <p className="text-xs text-muted-foreground">{pkg.duration}</p>
                </div>
                <div className="flex items-center text-sm text-foreground">
                  <Wifi className="h-4 w-4 mr-1 text-muted-foreground" />
                  {pkg.speed}
                </div>
              </div>

              {/* Customer Count */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pelanggan Aktif</span>
                <span className="font-medium text-foreground">{pkg.customerCount}</span>
              </div>

              {/* Revenue */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Pendapatan</span>
                <span className="font-medium text-foreground">{formatCurrency(pkg.totalRevenue)}</span>
              </div>

              {/* Features */}
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Fitur:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {pkg.features.map((feature, index) => (
                    <li key={index} className="flex items-center">
                      <div className="h-1 w-1 bg-success rounded-full mr-2" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-error hover:text-error"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {packages.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Tidak ada paket ditemukan</h3>
              <p className="text-muted-foreground">Coba ubah filter atau kata kunci pencarian Anda.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}