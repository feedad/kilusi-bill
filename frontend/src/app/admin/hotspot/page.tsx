'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Ticket, TrendingUp, CheckCircle, XCircle, AlertCircle, Plus, RefreshCw, Clock, UserX, Trash2, Users, Zap, Edit, Trash, Settings
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { adminApi } from '@/lib/api-clients'

interface Voucher {
  id: number
  code: string
  customer_name: string
  customer_phone: string
  amount: number
  duration_hours: number
  speed_limit: string
  status: 'pending' | 'active' | 'used' | 'expired'
  payment_status: 'unpaid' | 'paid' | 'failed'
  created_at: string
  paid_at?: string
  activated_at?: string
  expires_at?: string
  username?: string
}

interface HotspotPackage {
  id: number
  name: string
  name_display: string
  description: string
  price: number
  duration_hours: number
  speed_limit: string
  mikrotik_profile: string
  is_active: boolean
}

interface ActiveUser {
  username: string
  mikrotik_ip: string
  hotspot_name: string
  login_time: string
  session_duration_formatted: string
  download_mb: number
  upload_mb: number
  total_mb: number
  voucher_code?: string
  customer_name?: string
  customer_phone?: string
  is_expired: boolean
}

interface SalesStats {
  sales_trend: Array<{
    date_label: string
    total_sold: number
    paid_sold: number
    revenue: number
  }>
  period_stats: {
    total_sold: number
    paid_sold: number
    revenue: number
    pending_payment: number
  }
  peak_hour?: {
    hour: string
    sales_count: number
  }
}

export default function HotspotAdminPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [packages, setPackages] = useState<HotspotPackage[]>([])
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null)

  const [stats, setStats] = useState({
    total_vouchers: 0,
    active_vouchers: 0,
    used_vouchers: 0,
    expired_vouchers: 0,
    total_revenue: 0
  })

  const [loading, setLoading] = useState(true)
  const [voucherFilter, setVoucherFilter] = useState<'all' | 'active' | 'used' | 'expired'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [salesPeriod, setSalesPeriod] = useState('7days')

  // Pagination state
  const [voucherPage, setVoucherPage] = useState(1)
  const [voucherPerPage] = useState(20)
  const [activeUsersPage, setActiveUsersPage] = useState(1)
  const [activeUsersPerPage] = useState(10)
  const [salesVoucherPage, setSalesVoucherPage] = useState(1)
  const [salesVoucherPerPage] = useState(20)

  // Package form state
  const [showPackageDialog, setShowPackageDialog] = useState(false)
  const [editingPackage, setEditingPackage] = useState<HotspotPackage | null>(null)
  const [packageForm, setPackageForm] = useState({
    name: '',
    name_display: '',
    description: '',
    price: '',
    duration_hours: '',
    speed_limit: '',
    mikrotik_profile: 'default',
    is_active: true
  })
  const [savingPackage, setSavingPackage] = useState(false)

  // Voucher format state
  const [formatSettings, setFormatSettings] = useState({
    username_prefix: 'HS',
    username_length: 12,
    username_use_numbers: true,
    username_use_uppercase: true,
    username_use_lowercase: false,
    password_same_as_username: true,
    password_length: 8,
    password_use_numbers: true,
    password_use_uppercase: true,
    password_use_lowercase: false,
    code_template: '{PREFIX}{RANDOM}',
    description: ''
  })
  const [previewCodes, setPreviewCodes] = useState<Array<{code: string, username: string, password: string}>>([])
  const [showFormatDialog, setShowFormatDialog] = useState(false)
  const [savingFormat, setSavingFormat] = useState(false)
  const [generatingPreview, setGeneratingPreview] = useState(false)

  // Debug: Log state changes and button click
  useEffect(() => {
    console.log('showFormatDialog state:', showFormatDialog)
  }, [showFormatDialog])

  // Fetch format settings when dialog opens
  useEffect(() => {
    if (showFormatDialog) {
      fetchFormatSettings()
    }
  }, [showFormatDialog])

  const handleFormatButtonClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('Format button clicked directly!')
    setShowFormatDialog(true)
  }

  useEffect(() => {
    fetchData()
  }, [voucherFilter, salesPeriod])

  // Reset pagination when filters change
  useEffect(() => {
    setVoucherPage(1)
    setSalesVoucherPage(1)
  }, [voucherFilter, searchTerm])

  const fetchData = async () => {
    try {
      // Fetch vouchers
      const voucherResponse = await adminApi.get('/api/v1/hotspot/admin/hotspot/vouchers')
      if (voucherResponse.data.success) {
        let filteredVouchers = voucherResponse.data.data

        if (voucherFilter !== 'all') {
          filteredVouchers = filteredVouchers.filter((v: Voucher) => v.status === voucherFilter)
        }

        if (searchTerm) {
          filteredVouchers = filteredVouchers.filter((v: Voucher) =>
            v.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            v.customer_phone.includes(searchTerm)
          )
        }

        setVouchers(filteredVouchers)
      }

      // Fetch packages
      const packageResponse = await adminApi.get('/api/v1/hotspot/admin/hotspot/packages')
      if (packageResponse.data.success) {
        setPackages(packageResponse.data.data)
      }

      // Fetch stats
      const statsResponse = await adminApi.get('/api/v1/hotspot/admin/hotspot/stats')
      if (statsResponse.data.success) {
        setStats(statsResponse.data.data)
      }

      // Fetch sales stats
      const salesResponse = await adminApi.get(`/api/v1/hotspot/admin/hotspot/stats/sales?period=${salesPeriod}`)
      if (salesResponse.data.success) {
        setSalesStats(salesResponse.data.data)
      }

      // Fetch active users
      fetchActiveUsers()
    } catch (error: any) {
      console.error('Error fetching data:', error)
      if (error.response?.status === 401) {
        toast.error('Authentication required. Please log in.')
      } else {
        toast.error('Gagal memuat data')
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchActiveUsers = async () => {
    try {
      const response = await adminApi.get('/api/v1/hotspot/admin/hotspot/active-users')
      if (response.data.success) {
        setActiveUsers(response.data.data.active_users)
      }
    } catch (error) {
      console.error('Error fetching active users:', error)
    }
  }

  const kickUser = async (username: string) => {
    if (!confirm(`Kick user ${username} dari hotspot?`)) return

    try {
      const response = await adminApi.post(`/api/v1/hotspot/admin/hotspot/active-users/${username}/kick`, {
        reason: 'Kicked by admin'
      })

      if (response.data.success) {
        toast.success(`User ${username} berhasil dikick`)
        fetchActiveUsers()
        fetchData()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal kick user')
    }
  }

  const cleanupExpired = async () => {
    const expiredCount = vouchers.filter(v => v.status === 'expired').length
    if (expiredCount === 0) {
      toast.info('Tidak ada voucher expired')
      return
    }

    if (!confirm(`Hapus ${expiredCount} voucher expired dari RADIUS?`)) return

    try {
      const response = await adminApi.post('/api/v1/hotspot/admin/hotspot/cleanup-expired', {
        delete_from_radius: true
      })

      if (response.data.success) {
        toast.success(`✅ ${response.data.data.expired_count} voucher dibersihkan, ${response.data.data.deleted_from_radius} dihapus dari RADIUS`)
        fetchData()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal cleanup')
    }
  }

  const deleteVoucher = async (code: string) => {
    if (!confirm(`Hapus voucher ${code} secara permanen?`)) return

    try {
      const response = await adminApi.delete(`/api/v1/hotspot/admin/hotspot/vouchers/${code}/hard`)

      if (response.data.success) {
        toast.success('Voucher dihapus')
        fetchData()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menghapus voucher')
    }
  }

  const openPackageDialog = (pkg?: HotspotPackage) => {
    if (pkg) {
      setEditingPackage(pkg)
      setPackageForm({
        name: pkg.name,
        name_display: pkg.name_display,
        description: pkg.description || '',
        price: pkg.price.toString(),
        duration_hours: pkg.duration_hours.toString(),
        speed_limit: pkg.speed_limit || '',
        mikrotik_profile: pkg.mikrotik_profile || 'default',
        is_active: pkg.is_active
      })
    } else {
      setEditingPackage(null)
      setPackageForm({
        name: '',
        name_display: '',
        description: '',
        price: '',
        duration_hours: '',
        speed_limit: '',
        mikrotik_profile: 'default',
        is_active: true
      })
    }
    setShowPackageDialog(true)
  }

  const savePackage = async () => {
    if (!packageForm.name || !packageForm.name_display || !packageForm.price || !packageForm.duration_hours) {
      toast.error('Nama internal, nama tampil, harga, dan durasi wajib diisi')
      return
    }

    setSavingPackage(true)
    try {
      const data = {
        name: packageForm.name,
        name_display: packageForm.name_display,
        description: packageForm.description,
        price: parseInt(packageForm.price),
        duration_hours: parseInt(packageForm.duration_hours),
        speed_limit: packageForm.speed_limit,
        mikrotik_profile: packageForm.mikrotik_profile,
        is_active: packageForm.is_active
      }

      let response
      if (editingPackage) {
        response = await adminApi.put(`/api/v1/hotspot/admin/hotspot/packages/${editingPackage.id}`, data)
      } else {
        response = await adminApi.post('/api/v1/hotspot/admin/hotspot/packages', data)
      }

      if (response.data.success) {
        toast.success(editingPackage ? 'Paket berhasil diperbarui' : 'Paket berhasil dibuat')
        setShowPackageDialog(false)
        fetchData()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menyimpan paket')
    } finally {
      setSavingPackage(false)
    }
  }

  const deletePackage = async (id: number) => {
    if (!confirm('Hapus paket ini?')) return

    try {
      const response = await adminApi.delete(`/api/v1/hotspot/admin/hotspot/packages/${id}`)
      if (response.data.success) {
        toast.success('Paket berhasil dihapus')
        fetchData()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menghapus paket')
    }
  }

  const fetchFormatSettings = async () => {
    try {
      const response = await adminApi.get('/api/v1/hotspot/admin/hotspot/voucher-format')
      if (response.data.success) {
        setFormatSettings(response.data.data)
      }
    } catch (error: any) {
      toast.error('Gagal memuat format voucher')
    }
  }

  const saveFormatSettings = async () => {
    // Validation
    if (!formatSettings.username_prefix || formatSettings.username_prefix.length > 20) {
      toast.error('Prefix username harus diisi (maks 20 karakter)')
      return
    }

    if (formatSettings.username_length < 4 || formatSettings.username_length > 50) {
      toast.error('Panjang username harus 4-50 karakter')
      return
    }

    if (!formatSettings.username_use_numbers && !formatSettings.username_use_uppercase && !formatSettings.username_use_lowercase) {
      toast.error('Pilih minimal satu tipe karakter untuk username')
      return
    }

    if (!formatSettings.password_same_as_username) {
      if (formatSettings.password_length < 4 || formatSettings.password_length > 50) {
        toast.error('Panjang password harus 4-50 karakter')
        return
      }
      if (!formatSettings.password_use_numbers && !formatSettings.password_use_uppercase && !formatSettings.password_use_lowercase) {
        toast.error('Pilih minimal satu tipe karakter untuk password')
        return
      }
    }

    setSavingFormat(true)
    try {
      const response = await adminApi.put('/api/v1/hotspot/admin/hotspot/voucher-format', formatSettings)
      if (response.data.success) {
        toast.success('Format voucher berhasil disimpan')
        // Update local state with saved data from server
        setFormatSettings(response.data.data)
        setShowFormatDialog(false)
        // Clear preview codes since they're now outdated
        setPreviewCodes([])
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Gagal menyimpan format voucher')
    } finally {
      setSavingFormat(false)
    }
  }

  // Generate random string based on settings (client-side)
  const generateRandomString = (length: number, useNumbers: boolean, useUppercase: boolean, useLowercase: boolean) => {
    let chars = ''
    if (useNumbers) chars += '0123456789'
    if (useUppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    if (useLowercase) chars += 'abcdefghijklmnopqrstuvwxyz'

    if (chars.length === 0) chars = '0123456789' // Default fallback

    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // Generate preview based on current form state (client-side, no save required)
  const generatePreview = () => {
    setGeneratingPreview(true)

    try {
      const previews = []
      for (let i = 0; i < 5; i++) {
        // Calculate random part length (NO DASH)
        const prefixLength = formatSettings.username_prefix.length
        const randomLength = formatSettings.username_length - prefixLength
        const finalRandomLength = Math.max(randomLength, 4)

        // Generate username
        const randomPart = generateRandomString(
          finalRandomLength,
          formatSettings.username_use_numbers,
          formatSettings.username_use_uppercase,
          formatSettings.username_use_lowercase
        )

        const username = formatSettings.username_prefix + randomPart

        // Generate password
        let password
        if (formatSettings.password_same_as_username) {
          password = username
        } else {
          password = generateRandomString(
            formatSettings.password_length,
            formatSettings.password_use_numbers,
            formatSettings.password_use_uppercase,
            formatSettings.password_use_lowercase
          )
        }

        const code = username
        previews.push({ code, username, password })
      }

      setPreviewCodes(previews)
    } catch (error: any) {
      console.error('Preview generation error:', error)
      toast.error('Gagal generate preview')
    } finally {
      setGeneratingPreview(false)
    }
  }

  const openFormatDialog = useCallback(async () => {
    // Open dialog immediately
    setShowFormatDialog(true)
    // Then fetch settings
    try {
      const response = await adminApi.get('/api/v1/hotspot/admin/hotspot/voucher-format')
      if (response.data.success) {
        setFormatSettings(response.data.data)
      }
    } catch (error: any) {
      console.error('Error fetching format settings:', error)
    }
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Aktif</Badge>
      case 'used':
        return <Badge className="bg-blue-100 text-blue-800"><Clock className="h-3 w-3 mr-1" />Terpakai</Badge>
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="h-3 w-3 mr-1" />Expired</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertCircle className="h-3 w-3 mr-1" />Pending</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatBytes = (mb: number) => {
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    if (mb < 1024 * 1024) return `${(mb / 1024).toFixed(1)} GB`
    return `${(mb / (1024 * 1024)).toFixed(1)} TB`
  }

  // Pagination component
  const Pagination = ({ currentPage, totalPages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (page: number) => void }) => {
    if (totalPages <= 1) return null

    const pages = []
    const maxVisiblePages = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1)
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
        >
          Awal
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &larr;
        </Button>
        {startPage > 1 && <span className="px-2">...</span>}
        {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((page) => (
          <Button
            key={page}
            size="sm"
            variant={currentPage === page ? 'default' : 'outline'}
            onClick={() => onPageChange(page)}
          >
            {page}
          </Button>
        ))}
        {endPage < totalPages && <span className="px-2">...</span>}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          &rarr;
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
        >
          Akhir
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hotspot Management</h1>
          <p className="text-gray-600">Kelola voucher, user aktif, dan statistik penjualan</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Voucher</p>
                <p className="text-2xl font-bold">{stats.total_vouchers}</p>
              </div>
              <Ticket className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Aktif</p>
                <p className="text-2xl font-bold text-green-600">{stats.active_vouchers}</p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">User Online</p>
                <p className="text-2xl font-bold text-blue-600">{activeUsers.length}</p>
              </div>
              <Users className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Terpakai</p>
                <p className="text-2xl font-bold text-blue-600">{stats.used_vouchers}</p>
              </div>
              <Clock className="h-10 w-10 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pendapatan</p>
                <p className="text-lg font-bold text-emerald-600">
                  Rp {stats.total_revenue.toLocaleString('id-ID')}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="vouchers" className="w-full">
        <TabsList>
          <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
          <TabsTrigger value="active-users">User Online</TabsTrigger>
          <TabsTrigger value="sales">Penjualan</TabsTrigger>
          <TabsTrigger value="packages">Packages</TabsTrigger>
        </TabsList>

        {/* Vouchers Tab */}
        <TabsContent value="vouchers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle>Daftar Voucher</CardTitle>
                <div className="flex gap-2 flex-wrap w-full md:w-auto">
                  <Button
                    onClick={handleFormatButtonClick}
                    variant="outline"
                    size="sm"
                    type="button"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Format
                  </Button>
                  <Button onClick={cleanupExpired} variant="outline" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Cleanup
                  </Button>
                  <Input
                    placeholder="Cari voucher..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      fetchData()
                    }}
                    className="w-full md:w-40 flex-1"
                  />
                  <Select value={voucherFilter} onValueChange={(value: any) => {
                    setVoucherFilter(value)
                    fetchData()
                  }}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua</SelectItem>
                      <SelectItem value="active">Aktif</SelectItem>
                      <SelectItem value="used">Terpakai</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Memuat data...</div>
              ) : vouchers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Ticket className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>Tidak ada voucher</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Kode</th>
                          <th className="text-left p-2">Customer</th>
                          <th className="text-left p-2">Paket</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Dibuat/Dibayar</th>
                          <th className="text-right p-2">Harga</th>
                          <th className="text-center p-2">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vouchers
                          .slice((voucherPage - 1) * voucherPerPage, voucherPage * voucherPerPage)
                          .map((voucher) => (
                          <tr key={voucher.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-mono text-sm">{voucher.code}</td>
                            <td className="p-2">
                              <div>
                                <p className="font-medium">{voucher.customer_name}</p>
                                <p className="text-xs text-gray-500">{voucher.customer_phone}</p>
                              </div>
                            </td>
                            <td className="p-2">
                              <div>
                                <p className="text-sm">{voucher.duration_hours} jam</p>
                                <p className="text-xs text-gray-500">{voucher.speed_limit}</p>
                              </div>
                            </td>
                            <td className="p-2">{getStatusBadge(voucher.status)}</td>
                            <td className="p-2 text-sm">
                              <div>{formatDate(voucher.created_at)}</div>
                              {voucher.paid_at && (
                                <div className="text-xs text-green-600">{formatDate(voucher.paid_at)}</div>
                              )}
                            </td>
                            <td className="p-2 text-right font-medium">
                              Rp {voucher.amount.toLocaleString('id-ID')}
                            </td>
                            <td className="p-2 text-center">
                              {voucher.status === 'active' && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteVoucher(voucher.code)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                              {voucher.status === 'expired' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteVoucher(voucher.code)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={voucherPage}
                    totalPages={Math.ceil(vouchers.length / voucherPerPage)}
                    onPageChange={(page) => setVoucherPage(page)}
                  />
                  <p className="text-xs text-center text-gray-500 mt-2">
                    Menampilkan {(voucherPage - 1) * voucherPerPage + 1} - {Math.min(voucherPage * voucherPerPage, vouchers.length)} dari {vouchers.length} voucher
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Users Tab */}
        <TabsContent value="active-users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>User Online ({activeUsers.length})</CardTitle>
                <Button onClick={fetchActiveUsers} size="sm" variant="outline">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {activeUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>Tidak ada user online</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Username</th>
                          <th className="text-left p-2">Customer</th>
                          <th className="text-left p-2">Login Time</th>
                          <th className="text-left p-2">Durasi</th>
                          <th className="text-left p-2">Data</th>
                          <th className="text-center p-2">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeUsers
                          .slice((activeUsersPage - 1) * activeUsersPerPage, activeUsersPage * activeUsersPerPage)
                          .map((user) => (
                          <tr key={user.username} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-mono text-sm">
                              {user.username}
                              {user.is_expired && (
                                <Badge className="ml-2 bg-red-100 text-red-800">Expired</Badge>
                              )}
                            </td>
                            <td className="p-2">
                              <div>
                                <p className="text-sm">{user.customer_name || '-'}</p>
                                <p className="text-xs text-gray-500">{user.customer_phone || '-'}</p>
                              </div>
                            </td>
                            <td className="p-2 text-sm">{formatDate(user.login_time)}</td>
                            <td className="p-2 text-sm">{user.session_duration_formatted}</td>
                            <td className="p-2 text-sm">
                              <div>
                                <p>↓ {formatBytes(user.download_mb)}</p>
                                <p>↑ {formatBytes(user.upload_mb)}</p>
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => kickUser(user.username)}
                              >
                                <UserX className="h-3 w-3 mr-1" />
                                Kick
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={activeUsersPage}
                    totalPages={Math.ceil(activeUsers.length / activeUsersPerPage)}
                    onPageChange={(page) => setActiveUsersPage(page)}
                  />
                  <p className="text-xs text-center text-gray-500 mt-2">
                    Menampilkan {(activeUsersPage - 1) * activeUsersPerPage + 1} - {Math.min(activeUsersPage * activeUsersPerPage, activeUsers.length)} dari {activeUsers.length} user online
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Statistik Penjualan</CardTitle>
                <Select value={salesPeriod} onValueChange={setSalesPeriod}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Hari Ini</SelectItem>
                    <SelectItem value="7days">7 Hari</SelectItem>
                    <SelectItem value="30days">30 Hari</SelectItem>
                    <SelectItem value="90days">90 Hari</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {salesStats && (
                <>
                  {/* Period Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
                      <CardContent className="pt-4">
                        <p className="text-sm text-blue-100">Total Terjual</p>
                        <p className="text-2xl font-bold">{salesStats.period_stats.total_sold}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
                      <CardContent className="pt-4">
                        <p className="text-sm text-green-100">Terbayar</p>
                        <p className="text-2xl font-bold">{salesStats.period_stats.paid_sold}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0">
                      <CardContent className="pt-4">
                        <p className="text-sm text-amber-100">Pending</p>
                        <p className="text-2xl font-bold">{salesStats.period_stats.pending_payment}</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0">
                      <CardContent className="pt-4">
                        <p className="text-sm text-emerald-100">Pendapatan</p>
                        <p className="text-xl font-bold">
                          Rp {salesStats.period_stats.revenue.toLocaleString('id-ID')}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Sales Trend Chart */}
                  <Card>
                    <CardContent className="pt-6">
                      <h3 className="font-semibold mb-4">Trend Penjualan</h3>
                      {salesStats.sales_trend.length > 0 ? (
                        <div className="h-64 flex items-end gap-2 border-l border-b border-gray-200 dark:border-gray-700 pl-2 pb-2">
                          {(() => {
                            // Find maximum value for scaling
                            const maxSold = Math.max(...salesStats.sales_trend.map(item => item.paid_sold), 1)
                            return salesStats.sales_trend.map((item) => {
                              const heightPercent = Math.max((item.paid_sold / maxSold) * 100, 5)
                              return (
                                <div key={item.date_label} className="flex-1 flex flex-col items-center group">
                                  <div className="w-full flex flex-col items-center justify-end h-full">
                                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {item.paid_sold}
                                    </span>
                                    <div
                                      className="w-full max-w-[60px] bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t hover:from-indigo-700 hover:to-indigo-500 transition-all cursor-pointer shadow-sm"
                                      style={{ height: `${heightPercent}%`, minHeight: '20px' }}
                                      title={`Terjual: ${item.paid_sold}, Revenue: Rp ${item.revenue.toLocaleString('id-ID')}`}
                                    />
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate w-full text-center group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                    {item.date_label}
                                  </p>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>Belum ada data penjualan</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Peak Hour */}
                  {salesStats.peak_hour && (
                    <Card className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-0">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-purple-100">Jam Penjualan Terbanyak</p>
                            <p className="text-lg font-bold">{salesStats.peak_hour.hour}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold">{salesStats.peak_hour.sales_count}</p>
                            <p className="text-xs text-purple-100">voucher</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Voucher Sales List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>List Voucher Terjual</CardTitle>
                <Input
                  placeholder="Cari voucher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </CardHeader>
            <CardContent>
              {vouchers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Ticket className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>Belum ada voucher terjual</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-3">Kode Voucher</th>
                          <th className="text-left p-3">Customer</th>
                          <th className="text-left p-3">Paket</th>
                          <th className="text-left p-3">Harga</th>
                          <th className="text-left p-3">Status</th>
                          <th className="text-left p-3">Pembayaran</th>
                          <th className="text-left p-3">Tanggal</th>
                          <th className="text-center p-3">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vouchers
                          .slice((salesVoucherPage - 1) * salesVoucherPerPage, salesVoucherPage * salesVoucherPerPage)
                          .map((voucher) => (
                          <tr key={voucher.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="p-3">
                              <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                {voucher.code}
                              </code>
                            </td>
                            <td className="p-3">
                              <div>
                                <p className="text-sm font-medium">{voucher.customer_name || '-'}</p>
                                <p className="text-xs text-gray-500">{voucher.customer_phone || '-'}</p>
                              </div>
                            </td>
                            <td className="p-3 text-sm">
                              <div>
                                <p className="font-medium">{voucher.duration_hours} jam</p>
                                <p className="text-xs text-gray-500">{voucher.speed_limit || '-'}</p>
                              </div>
                            </td>
                            <td className="p-3 text-sm font-medium">
                              Rp {Math.floor(voucher.amount).toLocaleString('id-ID')}
                            </td>
                            <td className="p-3">
                              {getStatusBadge(voucher.status)}
                            </td>
                            <td className="p-3">
                              <Badge className={
                                voucher.payment_status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                voucher.payment_status === 'unpaid' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              }>
                                {voucher.payment_status === 'paid' ? 'Lunas' :
                                 voucher.payment_status === 'unpaid' ? 'Pending' :
                                 voucher.payment_status}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm">
                              {formatDate(voucher.created_at)}
                            </td>
                            <td className="p-3 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteVoucher(voucher.code)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    currentPage={salesVoucherPage}
                    totalPages={Math.ceil(vouchers.length / salesVoucherPerPage)}
                    onPageChange={(page) => setSalesVoucherPage(page)}
                  />
                  <p className="text-xs text-center text-gray-500 mt-2">
                    Menampilkan {(salesVoucherPage - 1) * salesVoucherPerPage + 1} - {Math.min(salesVoucherPage * salesVoucherPerPage, vouchers.length)} dari {vouchers.length} voucher terjual
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Paket Hotspot</CardTitle>
                <Button onClick={() => openPackageDialog()} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Tambah Paket
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {packages.map((pkg) => (
                  <Card key={pkg.id} className={`flex flex-col bg-white dark:bg-gray-800 border shadow-sm hover:shadow-md transition-shadow ${!pkg.is_active ? 'opacity-50' : ''}`}>
                    <CardHeader className="pb-3 flex-shrink-0">
                      <CardTitle className="text-base text-center">{pkg.name_display}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col space-y-3">
                      <div className="space-y-2">
                        <div className="text-lg font-bold text-blue-600 leading-tight text-center">
                          Rp {Math.floor(pkg.price).toLocaleString('id-ID')}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 text-center line-clamp-2 min-h-[2.5rem]">{pkg.description || '-'}</p>
                        <div className="flex items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="h-4 w-4 mr-1 flex-shrink-0" />
                          {pkg.duration_hours} jam
                        </div>
                        <div className="flex items-center justify-center text-sm text-gray-600 dark:text-gray-400">
                          <Zap className="h-4 w-4 mr-1 flex-shrink-0" />
                          {pkg.speed_limit || '-'}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 text-center truncate">Profile: {pkg.mikrotik_profile}</p>
                      </div>
                      <div className="flex gap-2 pt-2 border-t">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => openPackageDialog(pkg)}>
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => deletePackage(pkg.id)}
                        >
                          <Trash className="h-3 w-3 mr-1" />
                          Hapus
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Package Dialog */}
          <Dialog open={showPackageDialog} onOpenChange={setShowPackageDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingPackage ? 'Edit Paket Hotspot' : 'Tambah Paket Hotspot'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="package-name">Nama Internal</Label>
                  <Input
                    id="package-name"
                    value={packageForm.name}
                    onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                    placeholder="Contoh: 1JAM, 3JAM"
                    disabled={savingPackage}
                  />
                </div>

                <div>
                  <Label htmlFor="package-name-display">Nama Tampil</Label>
                  <Input
                    id="package-name-display"
                    value={packageForm.name_display}
                    onChange={(e) => setPackageForm({ ...packageForm, name_display: e.target.value })}
                    placeholder="Contoh: 1 Jam, 3 Jam"
                    disabled={savingPackage}
                  />
                </div>

                <div>
                  <Label htmlFor="package-description">Deskripsi</Label>
                  <Textarea
                    id="package-description"
                    value={packageForm.description}
                    onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
                    placeholder="Deskripsi paket"
                    rows={2}
                    disabled={savingPackage}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="package-price">Harga (Rp)</Label>
                    <Input
                      id="package-price"
                      type="number"
                      value={packageForm.price}
                      onChange={(e) => setPackageForm({ ...packageForm, price: e.target.value })}
                      placeholder="3000"
                      disabled={savingPackage}
                    />
                  </div>

                  <div>
                    <Label htmlFor="package-duration">Durasi (Jam)</Label>
                    <Input
                      id="package-duration"
                      type="number"
                      value={packageForm.duration_hours}
                      onChange={(e) => setPackageForm({ ...packageForm, duration_hours: e.target.value })}
                      placeholder="1"
                      disabled={savingPackage}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="package-speed">Speed Limit</Label>
                  <Input
                    id="package-speed"
                    value={packageForm.speed_limit}
                    onChange={(e) => setPackageForm({ ...packageForm, speed_limit: e.target.value })}
                    placeholder="5M/5M"
                    disabled={savingPackage}
                  />
                  <p className="text-xs text-gray-500 mt-1">Format: upload/download, misal: 10M/10M</p>
                </div>

                <div>
                  <Label htmlFor="package-profile">Mikrotik Profile</Label>
                  <Input
                    id="package-profile"
                    value={packageForm.mikrotik_profile}
                    onChange={(e) => setPackageForm({ ...packageForm, mikrotik_profile: e.target.value })}
                    placeholder="default"
                    disabled={savingPackage}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="package-active"
                    checked={packageForm.is_active}
                    onChange={(e) => setPackageForm({ ...packageForm, is_active: e.target.checked })}
                    disabled={savingPackage}
                  />
                  <Label htmlFor="package-active">Aktif</Label>
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setShowPackageDialog(false)}
                  variant="outline"
                  disabled={savingPackage}
                >
                  Batal
                </Button>
                <Button
                  onClick={savePackage}
                  disabled={savingPackage}
                >
                  {savingPackage ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Voucher Format Dialog - Outside Tabs */}
        <Dialog open={showFormatDialog} onOpenChange={setShowFormatDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Konfigurasi Format Voucher</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 max-h-[60vh] overflow-y-auto">
              {/* Username Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Format Username</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="format-username-prefix">Prefix Username</Label>
                    <Input
                      id="format-username-prefix"
                      value={formatSettings.username_prefix}
                      onChange={(e) => setFormatSettings({...formatSettings, username_prefix: e.target.value})}
                      placeholder="HS"
                      maxLength={20}
                    />
                    <p className="text-xs text-gray-500 mt-1">Contoh: HS-, VOUCHER-, dll</p>
                  </div>

                  <div>
                    <Label htmlFor="format-username-length">Panjang Total Username (karakter)</Label>
                    <Input
                      id="format-username-length"
                      type="number"
                      min={4}
                      max={50}
                      value={formatSettings.username_length}
                      onChange={(e) => setFormatSettings({...formatSettings, username_length: parseInt(e.target.value) || 12})}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Termasuk prefix. Minimal random: 4 karakter.
                      Contoh: {formatSettings.username_prefix}{formatSettings.username_prefix.length + 4 <= formatSettings.username_length ? 'X'.repeat(formatSettings.username_length - formatSettings.username_prefix.length) : 'X'.repeat(4)}
                      ({formatSettings.username_prefix.length + 4 <= formatSettings.username_length ? formatSettings.username_length : formatSettings.username_prefix.length + 4} karakter)
                    </p>
                  </div>
                </div>

                <div>
                  <Label>Karakter yang digunakan untuk username:</Label>
                  <div className="flex gap-4 mt-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formatSettings.username_use_numbers}
                        onChange={(e) => setFormatSettings({...formatSettings, username_use_numbers: e.target.checked})}
                      />
                      <span>Angka (0-9)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formatSettings.username_use_uppercase}
                        onChange={(e) => setFormatSettings({...formatSettings, username_use_uppercase: e.target.checked})}
                      />
                      <span>Huruf Kapital (A-Z)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formatSettings.username_use_lowercase}
                        onChange={(e) => setFormatSettings({...formatSettings, username_use_lowercase: e.target.checked})}
                      />
                      <span>Huruf Kecil (a-z)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Password Settings */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Format Password</h3>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formatSettings.password_same_as_username}
                      onChange={(e) => setFormatSettings({...formatSettings, password_same_as_username: e.target.checked})}
                    />
                    <span>Password sama dengan Username</span>
                  </label>
                </div>

                {!formatSettings.password_same_as_username && (
                  <div className="space-y-4 ml-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <Label htmlFor="format-password-length">Panjang Password (karakter)</Label>
                      <Input
                        id="format-password-length"
                        type="number"
                        min={4}
                        max={50}
                        value={formatSettings.password_length}
                        onChange={(e) => setFormatSettings({...formatSettings, password_length: parseInt(e.target.value) || 8})}
                      />
                    </div>

                    <div>
                      <Label>Karakter yang digunakan untuk password:</Label>
                      <div className="flex gap-4 mt-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formatSettings.password_use_numbers}
                            onChange={(e) => setFormatSettings({...formatSettings, password_use_numbers: e.target.checked})}
                          />
                          <span>Angka (0-9)</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formatSettings.password_use_uppercase}
                            onChange={(e) => setFormatSettings({...formatSettings, password_use_uppercase: e.target.checked})}
                          />
                          <span>Huruf Kapital (A-Z)</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formatSettings.password_use_lowercase}
                            onChange={(e) => setFormatSettings({...formatSettings, password_use_lowercase: e.target.checked})}
                          />
                          <span>Huruf Kecil (a-z)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Section */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Preview Voucher</h3>
                  <Button onClick={generatePreview} variant="outline" size="sm" disabled={generatingPreview}>
                    {generatingPreview ? 'Generating...' : 'Generate Preview'}
                  </Button>
                </div>

                {previewCodes.length > 0 ? (
                  <div className="space-y-2">
                    {previewCodes.map((code, index) => (
                      <div key={index} className="p-3 bg-muted dark:bg-muted/50 rounded-lg font-mono text-sm border border-border">
                        <div>Username: <span className="font-bold">{code.username}</span></div>
                        <div>Password: <span className="font-bold">{code.password}</span></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Klik "Generate Preview" untuk melihat contoh voucher</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 border-t pt-4">
                <Button
                  onClick={() => setShowFormatDialog(false)}
                  variant="outline"
                  disabled={savingFormat}
                >
                  Batal
                </Button>
                <Button onClick={saveFormatSettings} disabled={savingFormat}>
                  {savingFormat ? 'Menyimpan...' : 'Simpan Format'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  )
}
