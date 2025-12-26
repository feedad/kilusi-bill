'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  MessageSquare,
  Search,
  Filter,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Calendar,
  User,
  Tag,
  TrendingUp,
  Users,
  HeadsetIcon
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { adminApi, handleApiError } from '@/lib/api-clients'
import Link from 'next/link'

interface SupportTicket {
  id: number
  ticket_number: string
  customer_name: string
  customer_phone: string
  subject: string
  description: string
  category: 'technical' | 'billing' | 'general' | 'complaint'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed'
  assigned_agent?: string
  created_at: string
  updated_at: string
  last_message?: string
  last_message_at?: string
}

interface SupportStats {
  total_tickets: number
  open_tickets: number
  in_progress_tickets: number
  resolved_tickets: number
  closed_tickets: number
  avg_resolution_time: number
}

interface CategoryData {
  category: string
  count: number
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<SupportStats | null>(null)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetchTickets()
    fetchStats()
  }, [statusFilter, categoryFilter, refreshKey])

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (categoryFilter !== 'all') params.append('category', categoryFilter)

      const response = await adminApi.get(`/api/v1/support/tickets?${params}`)
      setTickets(response.data.data)
    } catch (error: any) {
      console.error('Error fetching tickets:', error)
      toast.error('❌ ' + handleApiError(error, 'Gagal memuat data tiket'))
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await adminApi.get('/api/v1/support/stats')
      setStats(response.data.data.stats)
      setCategories(response.data.data.categories)
    } catch (error: any) {
      console.error('Error fetching stats:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"><MessageSquare className="w-3 h-3 mr-1" />Terbuka</Badge>
      case 'in_progress':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"><Clock className="w-3 h-3 mr-1" />Diproses</Badge>
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"><AlertTriangle className="w-3 h-3 mr-1" />Menunggu</Badge>
      case 'resolved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle className="w-3 h-3 mr-1" />Selesai</Badge>
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"><XCircle className="w-3 h-3 mr-1" />Ditutup</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Urgent</Badge>
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">Tinggi</Badge>
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">Sedang</Badge>
      case 'low':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Rendah</Badge>
      default:
        return <Badge variant="outline">{priority}</Badge>
    }
  }

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'technical':
        return <Badge variant="outline" className="text-blue-600 dark:text-blue-400"><AlertTriangle className="w-3 h-3 mr-1" />Teknis</Badge>
      case 'billing':
        return <Badge variant="outline" className="text-green-600 dark:text-green-400"><Tag className="w-3 h-3 mr-1" />Tagihan</Badge>
      case 'general':
        return <Badge variant="outline" className="text-purple-600 dark:text-purple-400"><MessageSquare className="w-3 h-3 mr-1" />Umum</Badge>
      case 'complaint':
        return <Badge variant="outline" className="text-red-600 dark:text-red-400"><XCircle className="w-3 h-3 mr-1" />Keluhan</Badge>
      default:
        return <Badge variant="outline">{category}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = searchQuery === '' ||
      ticket.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const updateTicketStatus = async (ticketId: number, newStatus: string) => {
    try {
      await adminApi.put(`/api/v1/support/tickets/${ticketId}`, { status: newStatus })
      toast.success('✅ Status tiket berhasil diperbarui')
      setRefreshKey(prev => prev + 1) // Force refresh
    } catch (error: any) {
      console.error('Error updating ticket status:', error)
      toast.error('❌ ' + handleApiError(error, 'Gagal memperbarui status tiket'))
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat data support...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Support Tiket</h1>
          <p className="text-gray-600">Kelola semua tiket bantuan pelanggan</p>
        </div>
        <Button
          onClick={() => setRefreshKey(prev => prev + 1)}
          variant="outline"
        >
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tiket</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_tickets}</div>
              <p className="text-xs text-muted-foreground">Semua tiket</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Terbuka</CardTitle>
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.open_tickets}</div>
              <p className="text-xs text-muted-foreground">Menunggu respon</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Diproses</CardTitle>
              <TrendingUp className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.in_progress_tickets}</div>
              <p className="text-xs text-muted-foreground">Sedang dikerjakan</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Selesai</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.resolved_tickets}</div>
              <p className="text-xs text-muted-foreground">Berhasil diselesaikan</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rata-rata Resolusi</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.avg_resolution_time ? Math.round(stats.avg_resolution_time / 60) : 0}j
              </div>
              <p className="text-xs text-muted-foreground">Waktu penyelesaian</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((category) => (
            <Card key={category.category} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                    <Tag className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div>
                    <div className="font-medium capitalize">{category.category}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{category.count} tiket</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Daftar Tiket</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Cari tiket..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="open">Terbuka</SelectItem>
                  <SelectItem value="in_progress">Diproses</SelectItem>
                  <SelectItem value="resolved">Selesai</SelectItem>
                  <SelectItem value="closed">Ditutup</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  <SelectItem value="technical">Teknis</SelectItem>
                  <SelectItem value="billing">Tagihan</SelectItem>
                  <SelectItem value="general">Umum</SelectItem>
                  <SelectItem value="complaint">Keluhan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTickets.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Tidak ada tiket yang ditemukan</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => (
                <div key={ticket.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-foreground truncate">{ticket.subject}</h3>
                        {getPriorityBadge(ticket.priority)}
                        {getStatusBadge(ticket.status)}
                      </div>

                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {ticket.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="font-medium">#{ticket.ticket_number}</span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {ticket.customer_name || 'Unknown'}
                        </span>
                        <span>{formatDate(ticket.created_at)}</span>
                        {getCategoryBadge(ticket.category)}
                      </div>

                      {ticket.last_message && (
                        <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md">
                          <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                            {ticket.last_message}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {ticket.last_message_at && formatDate(ticket.last_message_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Link href={`/admin/support/tickets/${ticket.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>

                      {ticket.status === 'open' && (
                        <Select onValueChange={(value) => updateTicketStatus(ticket.id, value)}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in_progress">Proses</SelectItem>
                            <SelectItem value="resolved">Selesai</SelectItem>
                          </SelectContent>
                        </Select>
                      )}

                      {ticket.status === 'in_progress' && (
                        <Select onValueChange={(value) => updateTicketStatus(ticket.id, value)}>
                          <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Buka</SelectItem>
                            <SelectItem value="resolved">Selesai</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}