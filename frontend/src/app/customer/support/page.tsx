'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Plus,
  Search,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Reply,
  Calendar,
  User,
  Tag,
  Paperclip,
  HeadsetIcon
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { customerAPI } from '@/lib/customer-api'
import NewTicketModal from '@/components/customer-support/NewTicketModal'

interface SupportTicket {
  id: string
  ticket_number: string
  subject: string
  description: string
  category: 'technical' | 'billing' | 'general' | 'complaint'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
  last_message?: string
  last_message_at?: string
  attachments?: Array<{
    name: string
    url: string
    size: number
  }>
  assigned_agent?: string
  resolution_time?: number
  customer_rating?: number
}

export default function CustomerSupportPage() {
  const router = useRouter()
  const { customer, isAuthenticated, handleApiError } = useCustomerAuth()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewTicketModal, setShowNewTicketModal] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      fetchTickets()
    }
  }, [isAuthenticated])

  const fetchTickets = async () => {
    try {
      setLoading(true)

      // Only proceed if authenticated
      if (!isAuthenticated) {
        console.log('User not authenticated, skipping ticket fetch')
        return
      }

      // Use standardized customer API with customer ID for better filtering
      const response = await customerAPI.getSupportTickets(customer?.id?.toString())

      if (!response.success) {
        // Check if this is an authentication error and let context handle it
        const isAuthError = handleApiError(new Error(response.message || 'Authentication failed'))
        if (isAuthError) return // Auth error will be handled by context
        throw new Error(response.message || 'Failed to fetch support tickets')
      }

      const allTickets = response.data || []

      // Filter tickets for this customer
      const customerTickets = allTickets.filter(ticket => {
        if (customer?.id && ticket.customer_id == customer.id) {
          return true // Ticket has matching customer_id
        }
        if (customer?.name && ticket.customer_name === customer.name) {
          return true // Ticket has matching customer_name
        }
        return false
      })

      // Transform tickets to match the interface
      const transformedTickets: SupportTicket[] = customerTickets.map((ticket: any) => ({
        id: ticket.id.toString(),
        ticket_number: ticket.ticket_number,
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        last_message: ticket.last_message,
        last_message_at: ticket.last_message_at,
        attachments: [],
        assigned_agent: ticket.assigned_agent,
        resolution_time: ticket.resolution_time,
        customer_rating: ticket.customer_rating
      }))

      setTickets(transformedTickets)
    } catch (error: any) {
      console.error('Error fetching support data:', error)
      toast.error('❌ Gagal memuat data support')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"><MessageSquare className="w-3 h-3 mr-1" />Terbuka</Badge>
      case 'in_progress':
        return <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"><Clock className="w-3 h-3 mr-1" />Diproses</Badge>
      case 'pending':
        return <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"><AlertTriangle className="w-3 h-3 mr-1" />Menunggu</Badge>
      case 'resolved':
        return <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"><CheckCircle className="w-3 h-3 mr-1" />Selesai</Badge>
      case 'closed':
        return <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"><XCircle className="w-3 h-3 mr-1" />Ditutup</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">Urgent</Badge>
      case 'high':
        return <Badge className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">Tinggi</Badge>
      case 'medium':
        return <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">Sedang</Badge>
      case 'low':
        return <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">Rendah</Badge>
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
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return 'Hari ini'
    } else if (diffDays === 1) {
      return 'Kemarin'
    } else if (diffDays < 7) {
      return `${diffDays} hari lalu`
    } else {
      return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }
  }

  const formatLastMessageTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

    if (diffMinutes < 1) return 'Baru saja'
    if (diffMinutes < 60) return `${diffMinutes} menit lalu`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours} jam lalu`

    return formatDate(dateString)
  }

  const filteredTickets = tickets.filter(ticket => {
    const matchesFilter = filter === 'all' || ticket.status === filter
    const matchesSearch = searchQuery === '' ||
      ticket.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat data support...</p>
        </div>
      </div>
    )
  }

  // Add authentication check at the beginning
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memverifikasi autentikasi...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pusat Bantuan</h1>
            <p className="text-gray-600 dark:text-gray-400">Kelola tiket bantuan dan pantau statusnya</p>
          </div>
          <Button
            onClick={() => setShowNewTicketModal(true)}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Buat Tiket Baru
          </Button>
        </div>

        {/* Tickets List */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle className="text-gray-900 dark:text-white">Tiket Saya</CardTitle>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Cari tiket..."
                    className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:border-blue-500 placeholder-gray-500 dark:placeholder-gray-400"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:border-blue-500"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">Semua Status</option>
                  <option value="open">Terbuka</option>
                  <option value="in_progress">Diproses</option>
                  <option value="resolved">Selesai</option>
                  <option value="closed">Ditutup</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredTickets.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">Belum ada tiket yang ditemukan</p>
                <Button onClick={() => setShowNewTicketModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Buat Tiket Baru
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTickets.map((ticket) => (
                  <div
                    key={`ticket-${ticket.id}-${ticket.ticket_number}`}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                    onClick={() => router.push(`/customer/support/tickets/${ticket.id}`)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{ticket.subject}</h3>
                          {getPriorityBadge(ticket.priority)}
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
                          {ticket.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-700 dark:text-gray-300">#{ticket.ticket_number}</span>
                          <span>{formatDate(ticket.created_at)}</span>
                          {getCategoryBadge(ticket.category)}
                          {ticket.attachments && ticket.attachments.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Paperclip className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                              {ticket.attachments.length} lampiran
                            </span>
                          )}
                          {ticket.assigned_agent && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                              {ticket.assigned_agent}
                            </span>
                          )}
                        </div>

                        {ticket.last_message && (
                          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium text-gray-900 dark:text-white">Pesan terakhir:</span> {ticket.last_message}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formatLastMessageTime(ticket.last_message_at!)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(ticket.status)}

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/customer/support/tickets/${ticket.id}`)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {ticket.status === 'open' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/customer/support/tickets/${ticket.id}?reply=true`)
                              }}
                            >
                              <Reply className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Ticket Modal */}
      <NewTicketModal
        open={showNewTicketModal}
        onOpenChange={setShowNewTicketModal}
        onSuccess={() => {
          toast.success('✅ Tiket berhasil dibuat!', { duration: 3000 })
          fetchTickets() // Refresh tickets list
        }}
      />
    </div>
  )
}