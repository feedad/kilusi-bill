'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  MessageSquare,
  User,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Send,
  Paperclip,
  Download,
  HeadsetIcon,
  RefreshCw,
  Star,
  Reply,
  Plus,
  Phone,
  Mail,
  Info,
  Tag
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { api } from '@/lib/api'

interface Ticket {
  id: number
  ticket_number: string
  subject: string
  description: string
  category: 'technical' | 'billing' | 'general' | 'complaint'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed'
  assigned_agent?: string
  resolution_time?: number
  customer_rating?: number
  created_at: string
  updated_at: string
  last_message?: string
  last_message_at?: string
}

interface TicketMessage {
  id: number
  ticket_id: number
  sender_type: 'customer' | 'agent'
  sender_name: string
  message: string
  attachments?: Array<{
    name: string
    url: string
    size: number
  }>
  created_at: string
}

export default function CustomerTicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { customer } = useCustomerAuth()
  const ticketId = params.id as string
  const shouldReply = searchParams.get('reply') === 'true'

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [rating, setRating] = useState(0)
  const [showRatingForm, setShowRatingForm] = useState(false)

  useEffect(() => {
    fetchTicketDetails()
  }, [ticketId, refreshKey])

  const fetchTicketDetails = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/support/tickets/${ticketId}`)

      // Verify this ticket belongs to the current customer
      if (customer && response.data.data.ticket.customer_id) {
        // If ticket has customer_id, check if it matches
        if (response.data.data.ticket.customer_id != customer.id) {
          toast.error('❌ Anda tidak memiliki akses ke tiket ini')
          router.push('/customer/support')
          return
        }
      } else if (customer && response.data.data.ticket.customer_name) {
        // If ticket doesn't have customer_id but has customer_name, check name match
        if (response.data.data.ticket.customer_name !== customer.name) {
          toast.error('❌ Anda tidak memiliki akses ke tiket ini')
          router.push('/customer/support')
          return
        }
      }

      setTicket(response.data.data.ticket)
      setMessages(response.data.data.messages || [])
    } catch (error: any) {
      console.error('Error fetching ticket details:', error)
      console.error('Error response:', error.response?.data)
      console.error('Error status:', error.response?.status)
      toast.error(`❌ Gagal memuat detail tiket: ${error.response?.data?.message || error.message || 'Unknown error'}`)
      // router.push('/customer/support') // Comment out for now to see the error page
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-blue-100 text-blue-800"><MessageSquare className="w-3 h-3 mr-1" />Terbuka</Badge>
      case 'in_progress':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Diproses</Badge>
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800"><AlertTriangle className="w-3 h-3 mr-1" />Menunggu</Badge>
      case 'resolved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Selesai</Badge>
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="w-3 h-3 mr-1" />Ditutup</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-100 text-red-800">Urgent</Badge>
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800">Tinggi</Badge>
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Sedang</Badge>
      case 'low':
        return <Badge className="bg-green-100 text-green-800">Rendah</Badge>
      default:
        return <Badge variant="outline">{priority}</Badge>
    }
  }

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'technical':
        return <Badge variant="outline" className="text-blue-600"><AlertTriangle className="w-3 h-3 mr-1" />Teknis</Badge>
      case 'billing':
        return <Badge variant="outline" className="text-green-600"><Tag className="w-3 h-3 mr-1" />Tagihan</Badge>
      case 'general':
        return <Badge variant="outline" className="text-purple-600"><MessageSquare className="w-3 h-3 mr-1" />Umum</Badge>
      case 'complaint':
        return <Badge variant="outline" className="text-red-600"><XCircle className="w-3 h-3 mr-1" />Keluhan</Badge>
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
      return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
    } else if (diffDays === 1) {
      return 'Kemarin, ' + date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
      })
    } else {
      return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}j ${mins}m`
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) {
      toast.error('❌ Pesan tidak boleh kosong')
      return
    }

    if (!ticket || ticket.status === 'closed') {
      toast.error('❌ Tidak dapat mengirim pesan ke tiket yang sudah ditutup')
      return
    }

    try {
      setSendingMessage(true)
      await api.post(`/support/tickets/${ticketId}/messages`, {
        message: newMessage,
        sender_type: 'customer',
        sender_name: customer?.name || 'Customer'
      })

      toast.success('✅ Pesan berhasil dikirim')
      setNewMessage('')
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error sending message:', error)
      console.error('Error response:', error.response?.data)
      toast.error(`❌ Gagal mengirim pesan: ${error.response?.data?.message || error.message || 'Unknown error'}`)
    } finally {
      setSendingMessage(false)
    }
  }

  const submitRating = async () => {
    if (rating === 0) {
      toast.error('❌ Silakan pilih rating terlebih dahulu')
      return
    }

    try {
      await api.put(`/support/tickets/${ticketId}`, {
        customer_rating: rating,
        status: 'closed'
      })

      toast.success('✅ Terima kasih atas rating Anda!')
      setShowRatingForm(false)
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error submitting rating:', error)
      toast.error('❌ Gagal mengirim rating')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat detail tiket...</p>
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Tiket tidak ditemukan</p>
          <Button onClick={() => router.push('/customer/support')}>
            Kembali ke Pusat Bantuan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => router.push('/customer/support')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tiket #{ticket.ticket_number}</h1>
              <p className="text-gray-600">{ticket.subject}</p>
            </div>
          </div>
          <Button
            onClick={() => setRefreshKey(prev => prev + 1)}
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Status */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(ticket.status)}
                    {getPriorityBadge(ticket.priority)}
                    {getCategoryBadge(ticket.category)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(ticket.created_at)}
                  </div>
                </div>

                {ticket.assigned_agent && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <HeadsetIcon className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-blue-800">
                        Ditangani oleh: <strong>{ticket.assigned_agent}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Messages */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MessageSquare className="h-5 w-5 mr-2" />
                  Percakapan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-lg rounded-lg p-3 ${
                          message.sender_type === 'customer'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{message.sender_name}</span>
                          <span className="text-xs opacity-75">
                            {formatDate(message.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{message.message}</p>
                      </div>
                    </div>
                  ))}

                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Belum ada pesan</p>
                    </div>
                  )}
                </div>

                {/* Message Input */}
                {ticket.status !== 'closed' ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Ketik pesan Anda..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="w-full"
                      rows={3}
                      disabled={sendingMessage}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                      className="w-full"
                    >
                      {sendingMessage ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Mengirim...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Kirim Pesan
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Tiket ini sudah ditutup. Anda tidak dapat mengirim pesan lagi.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Rating Section */}
            {ticket.status === 'resolved' && !ticket.customer_rating && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="flex items-center text-green-800">
                    <Star className="h-5 w-5 mr-2" />
                    Beri Rating
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-green-700 mb-4">
                    Tiket Anda telah selesai. Bagaimana pengalaman Anda dengan layanan support kami?
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className="text-2xl transition-colors"
                      >
                        {star <= rating ? '⭐' : '☆'}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={submitRating}
                    disabled={rating === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Kirim Rating
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Thank You Section */}
            {ticket.customer_rating && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <CheckCircle className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-blue-900 mb-2">Terima Kasih!</h3>
                    <p className="text-blue-700">
                      Terima kasih atas rating Anda. Masukan Anda sangat berharga untuk meningkatkan layanan kami.
                    </p>
                    <div className="mt-2">
                      <span className="text-2xl">⭐</span>
                      <span className="text-lg ml-2 font-semibold">{ticket.customer_rating}/5</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Ticket Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Info className="h-5 w-5 mr-2" />
                  Informasi Tiket
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Subjek</label>
                    <p className="font-medium">{ticket.subject}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Deskripsi</label>
                    <p className="text-sm text-gray-700 line-clamp-3">{ticket.description}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Dibuat</label>
                    <p className="text-sm">{formatDate(ticket.created_at)}</p>
                  </div>
                  {ticket.resolution_time && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Waktu Resolusi</label>
                      <p className="text-sm text-green-600">{formatDuration(ticket.resolution_time)}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

  
            {/* Status Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Status Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Tiket Dibuat</p>
                      <p className="text-xs text-gray-500">{formatDate(ticket.created_at)}</p>
                    </div>
                  </div>

                  {ticket.status !== 'open' && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-yellow-600 rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Sedang Diproses</p>
                        <p className="text-xs text-gray-500">Status berubah menjadi diproses</p>
                      </div>
                    </div>
                  )}

                  {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Selesai</p>
                        <p className="text-xs text-gray-500">Tiket telah diselesaikan</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}