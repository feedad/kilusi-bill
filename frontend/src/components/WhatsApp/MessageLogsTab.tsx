'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { History, Search, Filter, Calendar, Download, RefreshCw, ChevronLeft, ChevronRight, MessageSquare, CheckCircle, XCircle, Clock, Eye } from 'lucide-react'
import { CONFIG } from '@/lib/config'
import MessageDetailModal from './MessageDetailModal'

interface MessageLog {
  id: number
  message_id: string | null
  phone_number: string
  customer_name: string | null
  message_type: string
  notification_type: string | null
  status: string
  created_at: string
  message_content?: string
  message?: string  // API list returns 'message' field
}

interface Statistics {
  total_messages: number
  sent: number
  delivered: number
  read: number
  failed: number
  invoice_created: number
  payment_received: number
  payment_reminder: number
  template_messages: number
  text_messages: number
}

export default function MessageLogsTab() {
  const [logs, setLogs] = useState<MessageLog[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  // Modal states
  const [selectedMessage, setSelectedMessage] = useState<MessageLog | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Filters
  const [phoneFilter, setPhoneFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      if (phoneFilter) params.append('phone_number', phoneFilter)
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter)
      if (typeFilter && typeFilter !== 'all') params.append('notification_type', typeFilter)
      if (dateFrom) params.append('date_from', dateFrom)
      if (dateTo) params.append('date_to', dateTo)

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs?${params}`)
      const data = await response.json()

      if (data.success) {
        setLogs(data.data)
        setTotal(data.pagination?.total || 0)
      }
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStatistics = async () => {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs/statistics`)
      const data = await response.json()

      if (data.success) {
        setStats(data.data)
      }
    } catch (error) {
      console.error('Error fetching statistics:', error)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, phoneFilter, statusFilter, typeFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchStatistics()
  }, [])

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      sent: 'default',
      delivered: 'secondary',
      read: 'default',
      failed: 'destructive',
      pending: 'outline'
    }

    const icons: Record<string, any> = {
      sent: CheckCircle,
      delivered: CheckCircle,
      read: CheckCircle,
      failed: XCircle,
      pending: Clock
    }

    const Icon = icons[status] || Clock

    return (
      <Badge variant={variants[status] || 'outline'} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    )
  }

  const formatPhoneNumber = (phone: string, masked: boolean = true) => {
    if (!phone) return '-'
    const cleaned = phone.replace(/\D/g, '')

    if (masked && cleaned.length > 8) {
      // Mask middle digits: 6283823588412 -> 6283xxx88412
      if (cleaned.startsWith('0')) {
        return '0' + cleaned.substring(1, 4) + 'xxx' + cleaned.substring(7)
      }
      return cleaned.substring(0, 4) + 'xxx' + cleaned.substring(7)
    }

    // Format: 6283823588412 -> 62 8382 3588 412
    if (cleaned.startsWith('0')) {
      return '0' + cleaned.substring(1, 4) + ' ' + cleaned.substring(4, 8) + ' ' + cleaned.substring(8)
    }
    if (cleaned.startsWith('62') && cleaned.length === 12) {
      return '+62 ' + cleaned.substring(2, 6) + ' ' + cleaned.substring(6, 10) + ' ' + cleaned.substring(10)
    }
    return phone
  }

  // Fetch message detail for modal
  const fetchMessageDetail = async (messageId: string, internalId?: string) => {
    try {
      // Use internal ID if available, otherwise try message ID endpoint
      const url = internalId
        ? `${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs/${internalId}`
        : `${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs/message/${messageId}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        return data.data
      }
      return null
    } catch (error) {
      console.error('Error fetching message detail:', error)
      return null
    }
  }

  // Handle click on message row
  const handleMessageClick = async (log: MessageLog) => {
    console.log('🔍 Clicked message log:', log)
    setLoading(true)

    try {
      // Fetch detail using internal ID (log.id) which returns full data
      const detail = await fetchMessageDetail(log.id.toString(), log.id.toString())
      console.log('📥 Fetched detail:', detail)

      if (detail) {
        setSelectedMessage({
          ...log,
          message_content: detail.message_content || log.message_content || log.message || '[No content]',
          sent_at: detail.sent_at || log.created_at,
          delivered_at: detail.delivered_at,
          read_at: detail.read_at,
          error_message: detail.error_message
        })
      } else {
        setSelectedMessage({
          ...log,
          message_content: log.message_content || log.message || '[No content]',
          sent_at: log.created_at
        })
      }

      console.log('✅ selectedMessage set, opening modal...')
      setLoading(false)
      setIsModalOpen(true)
    } catch (error) {
      console.error('❌ Error in handleMessageClick:', error)
      setLoading(false)
    }
  }

  // Handle resend message
  const handleResend = async (messageId: string, newPhoneNumber?: string) => {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat-logs/logs/${messageId}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPhoneNumber ? { phone_number: newPhoneNumber } : {})
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Gagal mengirim pesan')
      }

      // Refresh logs after resend
      await fetchLogs()
      await fetchStatistics()

      return data
    } catch (error: any) {
      throw error
    }
  }

  return (
    <div className="space-y-4">
      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total Pesan</CardDescription>
              <CardTitle className="text-2xl">{stats.total_messages}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Terkirim</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.sent}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Dibaca</CardDescription>
              <CardTitle className="text-2xl text-blue-600">{stats.read}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Gagal</CardDescription>
              <CardTitle className="text-2xl text-red-600">{stats.failed}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nomor Telepon</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="08xxxxxxxxxx"
                  value={phoneFilter}
                  onChange={(e) => setPhoneFilter(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="sent">Terkirim</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="read">Dibaca</SelectItem>
                  <SelectItem value="failed">Gagal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Tipe Notifikasi</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Semua tipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua tipe</SelectItem>
                  <SelectItem value="invoice_created">Invoice Baru</SelectItem>
                  <SelectItem value="payment_received">Pembayaran Diterima</SelectItem>
                  <SelectItem value="payment_reminder">Pengingat Pembayaran</SelectItem>
                  <SelectItem value="service_suspended">Layanan Ditangguhkan</SelectItem>
                  <SelectItem value="service_restored">Layanan Aktif Kembali</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Dari Tanggal</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sampai Tanggal</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={fetchLogs} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={() => {
                setPhoneFilter('')
                setStatusFilter('all')
                setTypeFilter('all')
                setDateFrom('')
                setDateTo('')
              }}
              variant="ghost"
              size="sm"
            >
              Reset Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Message Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Riwayat Pesan
              </CardTitle>
              <CardDescription>
                Menampilkan {(page - 1) * limit + 1}-{Math.min(page * limit, total)} dari {total} pesan
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Memuat data...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Tidak ada pesan ditemukan</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  onClick={() => handleMessageClick(log)}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{log.customer_name || 'Unknown'}</span>
                      <span className="text-muted-foreground text-sm">{formatPhoneNumber(log.phone_number)}</span>
                      {getStatusBadge(log.status)}
                    </div>
                    <p className="text-sm text-muted-foreground truncate max-w-xl">
                      {log.message_content || log.message || `[${log.message_type}] ${log.notification_type || ''}`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {log.notification_type && (
                        <Badge variant="outline" className="text-xs">
                          {log.notification_type}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {page} dari {Math.ceil(total / limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Detail Modal */}
      {selectedMessage && (
        <MessageDetailModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedMessage(null)
          }}
          message={selectedMessage}
          onResend={handleResend}
        />
      )}
    </div>
  )
}
