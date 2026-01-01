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
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  Wrench,
  Zap,
  Server,
  Power,
  Network,
  Plus,
  Trash2,
  Edit,
  Users,
  Timer,
  Phone,
  FileText,
  Activity,
  MapPin
} from 'lucide-react'

interface ScheduledMaintenance {
  id: number
  title: string
  message: string
  type: string
  priority: string
  maintenance_type: string
  estimated_duration?: number
  affected_services?: string[]
  contact_person?: string
  backup_plan?: string
  is_scheduled: boolean
  scheduled_start_time: string
  scheduled_end_time?: string
  auto_activate: boolean
  auto_deactivate: boolean
  target_areas: string[]
  target_all: boolean
  is_active: boolean
  created_at: string
  created_by_name: string
  hours_until_start?: number
  hours_until_end?: number
}

interface Region {
  id: number
  name: string
  customer_count: number
}

export function MaintenanceScheduler() {
  const [scheduledMaintenance, setScheduledMaintenance] = useState<ScheduledMaintenance[]>([])
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<ScheduledMaintenance[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [editingMaintenance, setEditingMaintenance] = useState<ScheduledMaintenance | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'high' as const,
    maintenance_type: 'planned' as const,
    estimated_duration: '',
    affected_services: [] as string[],
    contact_person: '',
    backup_plan: '',
    scheduled_start_time: '',
    scheduled_end_time: '',
    target_areas: [] as string[],
    target_all: true,
    auto_activate: true,
    auto_deactivate: true,
    send_push_notification: true
  })

  useEffect(() => {
    fetchScheduledMaintenance()
    fetchUpcomingMaintenance()
    fetchRegions()
  }, [refreshKey])

  const fetchScheduledMaintenance = async () => {
    try {
      const response = await adminApi.get('/api/v1/broadcast/maintenance/scheduled')
      if (response.data.success) {
        setScheduledMaintenance(response.data.data.scheduled_maintenance)
      }
    } catch (error: any) {
      console.error('Error fetching scheduled maintenance:', error)
      toast.error('❌ Gagal memuat jadwal maintenance')
    } finally {
      setLoading(false)
    }
  }

  const fetchUpcomingMaintenance = async () => {
    try {
      const response = await adminApi.get('/api/v1/broadcast/maintenance/upcoming?days=7')
      if (response.data.success) {
        setUpcomingMaintenance(response.data.data.upcoming_maintenance)
      }
    } catch (error: any) {
      console.error('Error fetching upcoming maintenance:', error)
    }
  }

  const fetchRegions = async () => {
    try {
      const response = await adminApi.get('/api/v1/regions')
      if (response.data.success) {
        setRegions(response.data.data.regions || [])
      }
    } catch (error: any) {
      console.error('Error fetching regions:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      priority: 'high',
      maintenance_type: 'planned',
      estimated_duration: '',
      affected_services: [],
      contact_person: '',
      backup_plan: '',
      scheduled_start_time: '',
      scheduled_end_time: '',
      target_areas: [],
      target_all: true,
      auto_activate: true,
      auto_deactivate: true,
      send_push_notification: true
    })
    setEditingMaintenance(null)
    setShowScheduleForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim() || !formData.message.trim() || !formData.scheduled_start_time) {
      toast.error('❌ Judul, pesan, dan waktu mulai harus diisi')
      return
    }

    try {
      const payload = {
        ...formData,
        target_areas: formData.target_all ? [] : formData.target_areas,
        scheduled_start_time: new Date(formData.scheduled_start_time).toISOString(),
        scheduled_end_time: formData.scheduled_end_time ? new Date(formData.scheduled_end_time).toISOString() : null,
        estimated_duration: formData.estimated_duration ? parseInt(formData.estimated_duration) : null
      }

      let response
      if (editingMaintenance) {
        response = await adminApi.put(`/api/v1/broadcast/messages/${editingMaintenance.id}`, payload)
        toast.success('✅ Jadwal maintenance berhasil diperbarui')
      } else {
        response = await adminApi.post('/api/v1/broadcast/maintenance/schedule', payload)
        toast.success('✅ Jadwal maintenance berhasil dibuat')
      }

      setRefreshKey(prev => prev + 1)
      resetForm()
    } catch (error: any) {
      console.error('Error saving maintenance schedule:', error)
      toast.error('❌ ' + handleApiError(error, 'Gagal menyimpan jadwal maintenance'))
    }
  }

  const getMaintenanceIcon = (type: string) => {
    switch (type) {
      case 'emergency': return <AlertTriangle className="h-4 w-4" />
      case 'planned': return <Calendar className="h-4 w-4" />
      case 'upgrade': return <Wrench className="h-4 w-4" />
      case 'network': return <Network className="h-4 w-4" />
      case 'power': return <Power className="h-4 w-4" />
      case 'system': return <Server className="h-4 w-4" />
      default: return <Activity className="h-4 w-4" />
    }
  }

  const getMaintenanceBadge = (type: string) => {
    const colors = {
      emergency: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      planned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      upgrade: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      network: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      power: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      system: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    }
    return (
      <Badge className={colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800'}>
        {getMaintenanceIcon(type)}
        <span className="ml-1 capitalize">{type}</span>
      </Badge>
    )
  }

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    }
    return (
      <Badge variant="outline" className={colors[priority as keyof typeof colors]}>
        {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </Badge>
    )
  }

  const getStatusBadge = (maintenance: ScheduledMaintenance) => {
    if (maintenance.is_active) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle className="h-3 w-3 mr-1" />
        Sedang Berlangsung
      </Badge>
    } else if (maintenance.hours_until_start && maintenance.hours_until_start > 0) {
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        <Clock className="h-3 w-3 mr-1" />
        {Math.floor(maintenance.hours_until_start)} jam lagi
      </Badge>
    } else {
      return <Badge variant="outline">Selesai</Badge>
    }
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

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}j ${mins}m` : `${mins}m`
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
          <Calendar className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">Maintenance Scheduler</h2>
        </div>
        <Button
          onClick={() => setShowScheduleForm(true)}
          disabled={showScheduleForm}
        >
          <Plus className="h-4 w-4 mr-2" />
          Jadwalkan Maintenance
        </Button>
      </div>

      {/* Create/Edit Form */}
      {showScheduleForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {editingMaintenance ? 'Edit Jadwal Maintenance' : 'Jadwalkan Maintenance Baru'}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={resetForm}>
                <Trash2 className="h-4 w-4 mr-1" />
                Batal
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Judul Maintenance</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Contoh: Maintenance Server Mingguan"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium mb-2">Tipe</label>
                    <Select value={formData.maintenance_type} onValueChange={(value: any) => setFormData(prev => ({ ...prev, maintenance_type: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="emergency">Emergency</SelectItem>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="upgrade">Upgrade</SelectItem>
                        <SelectItem value="network">Network</SelectItem>
                        <SelectItem value="power">Power</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Prioritas</label>
                    <Select value={formData.priority} onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}>
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
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Deskripsi Maintenance</label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Deskripsikan detail maintenance yang akan dilakukan"
                  rows={3}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Waktu Mulai</label>
                  <Input
                    type="datetime-local"
                    value={formData.scheduled_start_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, scheduled_start_time: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Waktu Selesai (Opsional)</label>
                  <Input
                    type="datetime-local"
                    value={formData.scheduled_end_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, scheduled_end_time: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Durasi Estimasi (menit)</label>
                  <Input
                    type="number"
                    value={formData.estimated_duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimated_duration: e.target.value }))}
                    placeholder="120"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Layanan Terpengaruh</label>
                  <Input
                    value={formData.affected_services.join(', ')}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      affected_services: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    }))}
                    placeholder="Internet, Email, VoIP"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Contact Person</label>
                  <Input
                    value={formData.contact_person}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_person: e.target.value }))}
                    placeholder="Nama teknisi atau departemen"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Backup Plan</label>
                <Textarea
                  value={formData.backup_plan}
                  onChange={(e) => setFormData(prev => ({ ...prev, backup_plan: e.target.value }))}
                  placeholder="Jelaskan rencana backup selama maintenance"
                  rows={2}
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

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.auto_activate}
                    onChange={(e) => setFormData(prev => ({ ...prev, auto_activate: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Auto Activate</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.auto_deactivate}
                    onChange={(e) => setFormData(prev => ({ ...prev, auto_deactivate: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Auto Deactivate</span>
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

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Batal
                </Button>
                <Button type="submit">
                  <Calendar className="h-4 w-4 mr-2" />
                  {editingMaintenance ? 'Perbarui Jadwal' : 'Jadwalkan Maintenance'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Maintenance */}
      {upcomingMaintenance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Maintenance Akan Datang (7 hari ke depan)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingMaintenance.map((maintenance) => (
                <div key={maintenance.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{maintenance.title}</h3>
                      {getMaintenanceBadge(maintenance.maintenance_type)}
                      {getPriorityBadge(maintenance.priority)}
                      {getStatusBadge(maintenance)}
                    </div>

                    <p className="text-sm text-muted-foreground mb-2">
                      {maintenance.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(maintenance.scheduled_start_time)}
                      </span>
                      {maintenance.estimated_duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(maintenance.estimated_duration)}
                        </span>
                      )}
                      {maintenance.contact_person && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {maintenance.contact_person}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingMaintenance(maintenance)
                      setFormData({
                        title: maintenance.title,
                        message: maintenance.message,
                        priority: maintenance.priority as any,
                        maintenance_type: maintenance.maintenance_type as any,
                        estimated_duration: maintenance.estimated_duration?.toString() || '',
                        affected_services: maintenance.affected_services || [],
                        contact_person: maintenance.contact_person || '',
                        backup_plan: maintenance.backup_plan || '',
                        scheduled_start_time: new Date(maintenance.scheduled_start_time).toISOString().slice(0, 16),
                        scheduled_end_time: maintenance.scheduled_end_time ? new Date(maintenance.scheduled_end_time).toISOString().slice(0, 16) : '',
                        target_areas: maintenance.target_areas || [],
                        target_all: maintenance.target_all,
                        auto_activate: maintenance.auto_activate,
                        auto_deactivate: maintenance.auto_deactivate,
                        send_push_notification: true
                      })
                      setShowScheduleForm(true)
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Scheduled Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle>Semua Jadwal Maintenance</CardTitle>
        </CardHeader>
        <CardContent>
          {scheduledMaintenance.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Belum ada jadwal maintenance</p>
              <p className="text-sm text-muted-foreground mt-2">
                Klik &quot;Jadwalkan Maintenance&quot; untuk membuat jadwal pertama
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {scheduledMaintenance.map((maintenance) => (
                <div key={maintenance.id} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{maintenance.title}</h3>
                        {getMaintenanceBadge(maintenance.maintenance_type)}
                        {getPriorityBadge(maintenance.priority)}
                        {getStatusBadge(maintenance)}
                      </div>

                      <p className="text-muted-foreground mb-3">
                        {maintenance.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Mulai: {formatDate(maintenance.scheduled_start_time)}
                        </span>
                        {maintenance.scheduled_end_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Selesai: {formatDate(maintenance.scheduled_end_time)}
                          </span>
                        )}
                        {maintenance.estimated_duration && (
                          <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            Durasi: {formatDuration(maintenance.estimated_duration)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {maintenance.target_all ? 'Semua Pelanggan' : `${maintenance.target_areas?.join(', ') || 'Area Tertentu'}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingMaintenance(maintenance)
                          setFormData({
                            title: maintenance.title,
                            message: maintenance.message,
                            priority: maintenance.priority as any,
                            maintenance_type: maintenance.maintenance_type as any,
                            estimated_duration: maintenance.estimated_duration?.toString() || '',
                            affected_services: maintenance.affected_services || [],
                            contact_person: maintenance.contact_person || '',
                            backup_plan: maintenance.backup_plan || '',
                            scheduled_start_time: new Date(maintenance.scheduled_start_time).toISOString().slice(0, 16),
                            scheduled_end_time: maintenance.scheduled_end_time ? new Date(maintenance.scheduled_end_time).toISOString().slice(0, 16) : '',
                            target_areas: maintenance.target_areas || [],
                            target_all: maintenance.target_all,
                            auto_activate: maintenance.auto_activate,
                            auto_deactivate: maintenance.auto_deactivate,
                            send_push_notification: true
                          })
                          setShowScheduleForm(true)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
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