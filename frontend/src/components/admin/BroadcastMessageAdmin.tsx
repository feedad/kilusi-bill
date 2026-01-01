'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'react-hot-toast'
import { adminApi, handleApiError } from '@/lib/api-clients'
import {
  Bell,
  Send,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Megaphone,
  Users,
  MapPin,
  Trash2,
  Edit,
  Eye,
  WifiOff,
  Settings
} from 'lucide-react'

interface BroadcastMessage {
  id: number
  title: string
  message: string
  type: 'informasi' | 'gangguan' | 'maintenance' | 'selesai'
  target_areas: string[]
  target_all: boolean
  is_active: boolean
  send_push_notification: boolean
  created_at: string
  updated_at: string
  expires_at?: string
  created_by: string
}

interface Region {
  id: number
  name: string
  customer_count: number
}

export function BroadcastMessageAdmin() {
  const [messages, setMessages] = useState<BroadcastMessage[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingMessage, setEditingMessage] = useState<BroadcastMessage | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'informasi' as const,
    target_areas: [] as string[],
    target_all: true,
    is_active: true,
    send_push_notification: true,
    expires_at: ''
  })

  useEffect(() => {
    fetchMessages()
    fetchRegions()
  }, [refreshKey])

  const fetchMessages = async () => {
    try {
      const response = await adminApi.get('/api/v1/broadcast/messages')
      if (response.data.success) {
        setMessages(response.data.data.messages)
      }
    } catch (error: any) {
      console.error('Error fetching broadcast messages:', error)
      toast.error('❌ Gagal memuat data pesan broadcast')
    } finally {
      setLoading(false)
    }
  }

  const fetchRegions = async () => {
    try {
      const response = await adminApi.get('/api/v1/regions')
      if (response.data.success) {
        const regionsData = response.data.data || []
        console.log('✅ Fetched regions:', regionsData)
        setRegions(regionsData)
      }
    } catch (error: any) {
      console.error('Error fetching regions:', error)
      // Try alternative endpoint
      try {
        const response = await adminApi.get('/api/v1/admin/regions')
        if (response.data.success) {
          const regionsData = response.data.data || []
          console.log('✅ Fetched regions from alternative endpoint:', regionsData)
          setRegions(regionsData)
        }
      } catch (error2: any) {
        console.error('Error fetching regions from alternative endpoint:', error2)
        // Fallback to static regions if API fails
        const fallbackRegions = [
          { id: 1, name: 'Jakarta', customer_count: 0 },
          { id: 2, name: 'Surabaya', customer_count: 0 },
          { id: 3, name: 'Bandung', customer_count: 0 },
          { id: 4, name: 'Medan', customer_count: 0 },
          { id: 5, name: 'Semarang', customer_count: 0 }
        ]
        console.log('⚠️ Using fallback regions:', fallbackRegions)
        setRegions(fallbackRegions)
      }
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      type: 'informasi',
      target_areas: [],
      target_all: true,
      is_active: true,
      send_push_notification: true,
      expires_at: ''
    })
    setEditingMessage(null)
    setShowCreateForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim() || !formData.message.trim()) {
      toast.error('❌ Judul dan pesan harus diisi')
      return
    }

    try {
      const payload = {
        ...formData,
        target_areas: formData.target_all ? [] : formData.target_areas
      }

      let response
      if (editingMessage) {
        response = await adminApi.put(`/api/v1/broadcast/messages/${editingMessage.id}`, payload)
        toast.success('✅ Pesan broadcast berhasil diperbarui')
      } else {
        response = await adminApi.post('/api/v1/broadcast/messages', payload)
        toast.success('✅ Pesan broadcast berhasil dikirim')
      }

      setRefreshKey(prev => prev + 1)
      resetForm()
    } catch (error: any) {
      console.error('Error saving broadcast message:', error)
      toast.error('❌ ' + handleApiError(error, 'Gagal menyimpan pesan broadcast'))
    }
  }

  const handleEdit = (message: BroadcastMessage) => {
    setEditingMessage(message)
    setFormData({
      title: message.title,
      message: message.message,
      type: message.type,
      target_areas: message.target_areas || [],
      target_all: message.target_all,
      is_active: message.is_active,
      send_push_notification: message.send_push_notification,
      expires_at: message.expires_at ? new Date(message.expires_at).toISOString().slice(0, 16) : ''
    })
    setShowCreateForm(true)
  }

  const handleDelete = async (messageId: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pesan ini?')) {
      return
    }

    try {
      await adminApi.delete(`/api/v1/broadcast/messages/${messageId}`)
      toast.success('✅ Pesan broadcast berhasil dihapus')
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error deleting broadcast message:', error)
      toast.error('❌ Gagal menghapus pesan broadcast')
    }
  }

  const handleToggleActive = async (messageId: number, isActive: boolean) => {
    try {
      await adminApi.put(`/api/v1/broadcast/messages/${messageId}`, {
        is_active: !isActive
      })
      toast.success(`✅ Pesan berhasil ${!isActive ? 'diaktifkan' : 'dinonaktifkan'}`)
      setRefreshKey(prev => prev + 1)
    } catch (error: any) {
      console.error('Error toggling message status:', error)
      toast.error('❌ Gagal mengubah status pesan')
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'informasi': return <Info className="h-4 w-4" />
      case 'gangguan': return <WifiOff className="h-4 w-4" />
      case 'selesai': return <CheckCircle className="h-4 w-4" />
      case 'maintenance': return <Settings className="h-4 w-4" />
      default: return <Info className="h-4 w-4" />
    }
  }

  const getTypeBadge = (type: string) => {
    const colors = {
      informasi: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      gangguan: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      selesai: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    }
    const labels = {
      informasi: 'Informasi',
      gangguan: 'Gangguan',
      selesai: 'Selesai',
      maintenance: 'Maintenance'
    }
    return (
      <Badge className={colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>
        {getTypeIcon(type)}
        <span className="ml-1">{labels[type as keyof typeof labels]}</span>
      </Badge>
    )
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">Pesan Broadcast</h2>
        </div>
        <Button
          onClick={() => setShowCreateForm(true)}
          disabled={showCreateForm}
        >
          <Send className="h-4 w-4 mr-2" />
          Kirim Pesan Baru
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {editingMessage ? 'Edit Pesan Broadcast' : 'Kirim Pesan Broadcast Baru'}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={resetForm}>
                <XCircle className="h-4 w-4 mr-1" />
                Batal
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Judul Pesan</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Masukkan judul pesan"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Kategori</label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="informasi">
                        <div className="flex items-center">
                          <Info className="h-4 w-4 mr-2" />
                          Informasi
                        </div>
                      </SelectItem>
                      <SelectItem value="gangguan">
                        <div className="flex items-center">
                          <XCircle className="h-4 w-4 mr-2" />
                          Gangguan
                        </div>
                      </SelectItem>
                      <SelectItem value="selesai">
                        <div className="flex items-center">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Selesai
                        </div>
                      </SelectItem>
                      <SelectItem value="maintenance">
                        <div className="flex items-center">
                          <Bell className="h-4 w-4 mr-2" />
                          Maintenance
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Isi Pesan</label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Masukkan isi pesan yang akan dikirim ke pelanggan"
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Target Pengiriman</label>
                  <Select
                    value={formData.target_all ? 'all' : 'specific'}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, target_all: value === 'all', target_areas: [] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center">
                          <Users className="h-4 w-4 mr-2" />
                          Semua Pelanggan
                        </div>
                      </SelectItem>
                      <SelectItem value="specific">
                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 mr-2" />
                          Area Tertentu
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!formData.target_all && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Pilih Area</label>
                    <Select
                      value={formData.target_areas[0] || ''}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, target_areas: [value] }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih area" />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((region) => (
                          <SelectItem key={region.id} value={region.name}>
                            {region.name} ({region.customer_count} pelanggan)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Kadaluarsa (Opsional)</label>
                  <Input
                    type="datetime-local"
                    value={formData.expires_at}
                    onChange={(e) => setFormData(prev => ({ ...prev, expires_at: e.target.value }))}
                  />
                </div>

                <div className="flex items-center space-x-4 pt-6">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Aktif</span>
                  </label>

                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={formData.send_push_notification}
                      onChange={(e) => setFormData(prev => ({ ...prev, send_push_notification: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">Push Notification</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Batal
                </Button>
                <Button type="submit">
                  <Send className="h-4 w-4 mr-2" />
                  {editingMessage ? 'Perbarui Pesan' : 'Kirim Pesan'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Messages List */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Belum ada pesan broadcast</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Klik &quot;Kirim Pesan Baru&quot; untuk membuat pesan broadcast pertama
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          messages.map((message) => (
            <Card key={message.id} className={`transition-all duration-200 ${!message.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{message.title}</h3>
                      {getTypeBadge(message.type)}
                      {!message.is_active && (
                        <Badge variant="outline" className="text-gray-500">
                          Tidak Aktif
                        </Badge>
                      )}
                    </div>

                    <p className="text-muted-foreground mb-3 leading-relaxed">
                      {message.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {message.target_all ? 'Semua Pelanggan' : `${message.target_areas?.join(', ') || 'Area Tertentu'}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Bell className="h-3 w-3" />
                        {message.send_push_notification ? 'Push Notification' : 'Hanya In-App'}
                      </span>
                      <span>Dibuat: {formatDate(message.created_at)}</span>
                      {message.expires_at && (
                        <span>Kadaluarsa: {formatDate(message.expires_at)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(message.id, message.is_active)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(message)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(message.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}