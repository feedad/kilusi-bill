'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, MessageSquare, CheckCircle, XCircle, Clock, Send, Eye } from 'lucide-react'
import { CONFIG } from '@/lib/config'
import { adminApi } from '@/lib/api-clients'
import MessageDetailModal from '../MessageDetailModal'

interface Message {
  id: string
  phone_number: string
  notification_type: string
  message: string
  status: 'success' | 'failed' | 'pending'
  created_at: string
  customer_name?: string
  customer_id?: number
}

interface OmnichatDashboardProps {
  onNavigate?: (tab: string) => void
  customerStats?: {
    total: number
    active: number
    inactive: number
    suspended: number
  }
  allMessagesCount?: number
}

export default function OmnichatDashboard({ onNavigate, customerStats, allMessagesCount = 0 }: OmnichatDashboardProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  })

  // Modal states
  const [selectedMessage, setSelectedMessage] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchMessages = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append('limit', pagination.limit.toString())
      params.append('offset', ((pagination.page - 1) * pagination.limit).toString())

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs?${params}`)
      const data = await response.json()

      if (data.success) {
        // Fetch customer names for each message
        const messagesWithNames = await Promise.all(
          (data.data || []).map(async (msg: Message) => {
            try {
              // Try to find customer by phone number (treat 404 as success to avoid console errors)
              const customerResponse = await adminApi.get(`/api/v1/customers/phone/${msg.phone_number}`, {
                validateStatus: (status) => status < 500 // Treat 404 as valid response
              })
              if (customerResponse.data.success && customerResponse.data.data) {
                return {
                  ...msg,
                  customer_name: customerResponse.data.data.name,
                  customer_id: customerResponse.data.data.id
                }
              }
            } catch (error) {
              // Customer not found, keep original message
            }
            return msg
          })
        )

        setMessages(messagesWithNames)
        setPagination(prev => ({
          ...prev,
          total: data.pagination?.total || 0,
          totalPages: Math.ceil((data.pagination?.total || 0) / pagination.limit)
        }))
      }
    } catch (error) {
      console.error('Error fetching messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async (msg: Message) => {
    if (!confirm(`Kirim ulang pesan ke ${msg.phone_number}?`)) {
      return
    }

    try {
      setResending(msg.id)

      const response = await adminApi.post('/api/v1/omnichat/send', {
        phone: msg.phone_number,
        message: msg.message
      })

      if (response.data.success) {
        alert('Pesan berhasil dikirim ulang!')
        // Refresh messages
        fetchMessages()
      } else {
        alert(`Gagal mengirim: ${response.data.message || 'Unknown error'}`)
      }
    } catch (error: any) {
      console.error('Error resending message:', error)
      alert(`Error: ${error.response?.data?.message || error.message}`)
    } finally {
      setResending(null)
    }
  }

  useEffect(() => {
    fetchMessages()
  }, [pagination.page])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="text-xs">✓ Sukses</Badge>
      case 'failed':
        return <Badge variant="destructive" className="text-xs">✗ Gagal</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">⏳ Pending</Badge>
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  // Handle click on message row to show detail modal
  const handleMessageClick = async (msg: Message) => {
    console.log('🔍 Clicked message:', msg)
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs/${msg.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      const data = await response.json()
      console.log('📥 Fetched detail:', data)

      if (data.success && data.data) {
        setSelectedMessage({
          id: data.data.id,
          message_id: data.data.message_id,
          phone_number: data.data.phone_number,
          customer_name: data.data.customer_name || msg.customer_name,
          message_type: data.data.message_type || 'text',
          message_content: data.data.message_content || data.data.message || '[No content]',
          status: data.data.status,
          sent_at: data.data.sent_at || data.data.created_at,
          delivered_at: data.data.delivered_at,
          read_at: data.data.read_at,
          error_message: data.data.error_message
        })
      } else {
        // Fallback to message data from list
        setSelectedMessage({
          id: msg.id,
          message_id: null,
          phone_number: msg.phone_number,
          customer_name: msg.customer_name,
          message_type: 'text',
          message_content: msg.message || '[No content]',
          status: msg.status,
          sent_at: msg.created_at
        })
      }

      console.log('✅ Opening modal...')
      setIsModalOpen(true)
    } catch (error) {
      console.error('❌ Error fetching message detail:', error)
      // Show modal with available data anyway
      setSelectedMessage({
        id: msg.id,
        message_id: null,
        phone_number: msg.phone_number,
        customer_name: msg.customer_name,
        message_type: 'text',
        message_content: msg.message || '[No content]',
        status: msg.status,
        sent_at: msg.created_at
      })
      setIsModalOpen(true)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Riwayat Pesan
              </CardTitle>
              <CardDescription>
                Daftar pesan WhatsApp yang terkirim via Omnichat
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMessages}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-4 text-gray-400" />
              <p className="text-gray-500">Loading messages...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Belum Ada Pesan</h3>
              <p className="text-gray-500">
                Belum ada pesan WhatsApp yang terkirim.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => handleMessageClick(msg)}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {getStatusIcon(msg.status)}
                  </div>

                  {/* Message Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-medium">{msg.phone_number}</span>
                      {msg.customer_name && (
                        <>
                          <span className="text-xs text-gray-400">→</span>
                          <span className="text-sm text-green-700 font-medium">{msg.customer_name}</span>
                        </>
                      )}
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500">{msg.notification_type}</span>
                    </div>
                    {msg.message && (
                      <p className="text-sm text-gray-600 truncate">{msg.message}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Eye className="w-4 h-4 text-gray-400" />
                    {getStatusBadge(msg.status)}
                    {msg.status === 'failed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResend(msg)}
                        disabled={resending === msg.id}
                        className="h-8 px-3"
                      >
                        <Send className={`w-3 h-3 mr-1 ${resending === msg.id ? 'animate-pulse' : ''}`} />
                        {resending === msg.id ? 'Sending...' : 'Resend'}
                      </Button>
                    )}
                    <span className="text-xs text-gray-500">
                      {new Date(msg.created_at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Menampilkan {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} dari {pagination.total} pesan
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page === pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Message Detail Modal */}
      {selectedMessage && (
        <MessageDetailModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedMessage(null)
          }}
          message={selectedMessage}
          onResend={async (messageId: string, newPhoneNumber?: string) => {
            try {
              const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs/${messageId}/resend`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(newPhoneNumber ? { phone_number: newPhoneNumber } : {})
              })
              const data = await response.json()

              if (!data.success) {
                throw new Error(data.message || 'Gagal mengirim pesan')
              }

              // Refresh messages after resend
              fetchMessages()
              return data
            } catch (error: any) {
              throw error
            }
          }}
        />
      )}
    </div>
  )
}
