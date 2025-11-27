'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  Phone,
  Mail,
  MapPin,
  Tag,
  HeadsetIcon,
  RefreshCw,
  Eye
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { api } from '@/lib/api'

interface Ticket {
  id: number
  ticket_number: string
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  customer_address: string
  customer_code: string
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
  package_id?: string
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

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    fetchTicketDetails()
  }, [ticketId, refreshKey])

  const fetchTicketDetails = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/support/tickets/${ticketId}`)
      setTicket(response.data.data.ticket)
      setMessages(response.data.data.messages || [])
    } catch (error: any) {
      console.error('Error fetching ticket details:', error)
      toast.error('❌ Gagal memuat detail tiket')
      router.push('/admin/support')
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
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}j ${mins}m`
  }

  const updateTicketStatus = async (newStatus: string) => {
    console.log('🔄 updateTicketStatus called with:', newStatus)
    try {
      const response = await api.put(`/support/tickets/${ticketId}`, { status: newStatus })
      console.log('✅ Status update successful:', response.data)
      toast.success('✅ Status tiket berhasil diperbarui')
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error updating ticket status:', error)
      console.error('Error response:', error.response?.data)
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error'
      toast.error(`❌ Gagal memperbarui status tiket: ${errorMessage}`)
    }
  }

  const assignAgent = async (agentName: string) => {
    console.log('👤 assignAgent called with:', agentName)
    try {
      await api.put(`/support/tickets/${ticketId}`, { assigned_agent: agentName })
      console.log('✅ Agent assignment successful')
      toast.success('✅ Tiket berhasil ditugaskan')
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error assigning agent:', error)
      console.error('Error response:', error.response?.data)
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error'
      toast.error(`❌ Gagal menugaskan tiket: ${errorMessage}`)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim()) {
      toast.error('❌ Pesan tidak boleh kosong')
      return
    }

    try {
      setSendingMessage(true)
      await api.post(`/support/tickets/${ticketId}/messages`, {
        message: newMessage,
        sender_type: 'agent',
        sender_name: 'Admin Support'
      })

      toast.success('✅ Pesan berhasil dikirim')
      setNewMessage('')
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error sending message:', error)
      console.error('Error response:', error.response?.data)
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error'
      toast.error(`❌ Gagal mengirim pesan: ${errorMessage}`)
    } finally {
      setSendingMessage(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Memuat detail tiket...</p>
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Tiket tidak ditemukan</p>
          <Button onClick={() => router.push('/admin/support')}>
            Kembali ke Daftar Tiket
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => router.push('/admin/support')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Detail Tiket #{ticket.ticket_number}</h1>
            <p className="text-gray-600">Kelola dan respon tiket pelanggan</p>
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
          {/* Ticket Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Informasi Tiket</span>
                <div className="flex items-center gap-2">
                  {getPriorityBadge(ticket.priority)}
                  {getStatusBadge(ticket.status)}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-2">{ticket.subject}</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {getCategoryBadge(ticket.category)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>Dibuat: {formatDate(ticket.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <RefreshCw className="h-4 w-4" />
                    <span>Update: {formatDate(ticket.updated_at)}</span>
                  </div>
                </div>
              </div>
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
                    className={`flex ${message.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-lg rounded-lg p-3 ${
                        message.sender_type === 'agent'
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
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ketik respon Anda..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                  rows={3}
                  disabled={ticket.status === 'closed'}
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sendingMessage || ticket.status === 'closed'}
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Informasi Pelanggan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Nama</label>
                  <p className="font-medium">{ticket.customer_name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Kode Pelanggan</label>
                  <p className="font-medium">{ticket.customer_code || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">No. Telepon</label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{ticket.customer_phone || '-'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Email</label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{ticket.customer_email || '-'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Alamat</label>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{ticket.customer_address || '-'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ticket Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <HeadsetIcon className="h-5 w-5 mr-2" />
                Manajemen Tiket
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Update */}
              <div className="relative">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={ticket.status}
                  onValueChange={updateTicketStatus}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Terbuka</SelectItem>
                    <SelectItem value="in_progress">Diproses</SelectItem>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="resolved">Selesai</SelectItem>
                    <SelectItem value="closed">Ditutup</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Agent Assignment */}
              <div className="relative">
                <label className="text-sm font-medium">Penugasan</label>
                <Select
                  value={ticket.assigned_agent || ''}
                  onValueChange={assignAgent}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pilih agen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Support Agent 1">Support Agent 1</SelectItem>
                    <SelectItem value="Support Agent 2">Support Agent 2</SelectItem>
                    <SelectItem value="Technical Team">Technical Team</SelectItem>
                    <SelectItem value="Billing Team">Billing Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ticket.assigned_agent && (
                <div className="text-sm">
                  <span className="font-medium">Ditugaskan ke: </span>
                  <span className="text-blue-600">{ticket.assigned_agent}</span>
                </div>
              )}

              {ticket.resolution_time && (
                <div className="text-sm">
                  <span className="font-medium">Waktu Resolusi: </span>
                  <span className="text-green-600">{formatDuration(ticket.resolution_time)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          </div>
      </div>
    </div>
  )
}