'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
  HeadsetIcon,
  Loader2,
  Phone,
  Mail
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
  assigned_to?: number
  assigned_to_user?: number
  technician_name?: string
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

  // Create ticket modal states
  const [showCreateTicketModal, setShowCreateTicketModal] = useState(false)
  const [creatingTicket, setCreatingTicket] = useState(false)
  const [newTicket, setNewTicket] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    subject: '',
    description: '',
    category: 'general' as 'technical' | 'billing' | 'general' | 'complaint',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    initial_message: ''
  })

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

  const createTicket = async () => {
    if (!newTicket.subject || !newTicket.description) {
      toast.error('❌ Subject dan deskripsi wajib diisi')
      return
    }

    setCreatingTicket(true)
    try {
      const payload: any = {
        subject: newTicket.subject,
        description: newTicket.description,
        category: newTicket.category,
        priority: newTicket.priority,
        initial_message: newTicket.initial_message || newTicket.description
      }

      if (newTicket.customer_name) payload.customer_name = newTicket.customer_name
      if (newTicket.customer_phone) payload.customer_phone = newTicket.customer_phone
      if (newTicket.customer_email) payload.customer_email = newTicket.customer_email
      if (newTicket.assigned_to) payload.assigned_to_user = parseInt(newTicket.assigned_to)

      const response = await adminApi.post('/api/v1/support/tickets', payload)
      if (response.data.success) {
        toast.success('✅ Tiket berhasil dibuat')
        setShowCreateTicketModal(false)
        setNewTicket({
          customer_name: '',
          customer_phone: '',
          customer_email: '',
          subject: '',
          description: '',
          category: 'general',
          priority: 'medium',
          initial_message: ''
        })
        setRefreshKey(prev => prev + 1)
      }
    } catch (error: any) {
      console.error('Error creating ticket:', error)
      toast.error('❌ ' + handleApiError(error, 'Gagal membuat tiket'))
    } finally {
      setCreatingTicket(false)
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
      month: '2-digit',
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
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCreateTicketModal(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Buat Tiket Manual
          </Button>
          <Button
            onClick={() => setRefreshKey(prev => prev + 1)}
            variant="outline"
          >
            Refresh
          </Button>
        </div>
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
                        {ticket.assigned_to_user && (
                          <Badge variant="outline" className="text-purple-600 dark:text-purple-400">
                            👤 {ticket.technician_name || 'Teknisi'}
                          </Badge>
                        )}
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

      {/* Create Ticket Modal */}
      <Dialog open={showCreateTicketModal} onOpenChange={setShowCreateTicketModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buat Tiket Manual</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Nama Pelanggan</Label>
                <Input
                  id="customerName"
                  placeholder="Nama pelanggan"
                  value={newTicket.customer_name}
                  onChange={(e) => setNewTicket({ ...newTicket, customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerPhone">
                  <Phone className="h-3 w-3 inline mr-1" />
                  No. Telepon
                </Label>
                <Input
                  id="customerPhone"
                  placeholder="08xxxxxxxxxx"
                  value={newTicket.customer_phone}
                  onChange={(e) => setNewTicket({ ...newTicket, customer_phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerEmail">
                <Mail className="h-3 w-3 inline mr-1" />
                Email (Opsional)
              </Label>
              <Input
                id="customerEmail"
                type="email"
                placeholder="email@example.com"
                value={newTicket.customer_email}
                onChange={(e) => setNewTicket({ ...newTicket, customer_email: e.target.value })}
              />
            </div>

            <div className="border-t pt-4"></div>

            {/* Ticket Details */}
            <div className="space-y-2">
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                placeholder="Masalah yang dilaporkan"
                value={newTicket.subject}
                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Kategori</Label>
                <Select value={newTicket.category} onValueChange={(value: any) => setNewTicket({ ...newTicket, category: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Umum</SelectItem>
                    <SelectItem value="technical">Teknis</SelectItem>
                    <SelectItem value="billing">Tagihan</SelectItem>
                    <SelectItem value="complaint">Keluhan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioritas</Label>
                <Select value={newTicket.priority} onValueChange={(value: any) => setNewTicket({ ...newTicket, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Rendah</SelectItem>
                    <SelectItem value="medium">Sedang</SelectItem>
                    <SelectItem value="high">Tinggi</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Deskripsi *</Label>
              <Textarea
                id="description"
                placeholder="Jelaskan detail masalah..."
                value={newTicket.description}
                onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="initialMessage">Pesan Awal</Label>
              <Textarea
                id="initialMessage"
                placeholder="Pesan yang akan dikirim ke pelanggan (opsional)"
                value={newTicket.initial_message}
                onChange={(e) => setNewTicket({ ...newTicket, initial_message: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateTicketModal(false)
                setNewTicket({
                  customer_name: '',
                  customer_phone: '',
                  customer_email: '',
                  subject: '',
                  description: '',
                  category: 'general',
                  priority: 'medium',
                  initial_message: ''
                })
              }}
              disabled={creatingTicket}
            >
              Batal
            </Button>
            <Button
              onClick={createTicket}
              disabled={creatingTicket || !newTicket.subject || !newTicket.description}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creatingTicket ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Membuat...
                </>
              ) : (
                <>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Buat Tiket
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}