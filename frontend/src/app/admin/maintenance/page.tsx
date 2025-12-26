'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Calendar,
    Plus,
    Trash2,
    Edit,
    Save,
    X,
    Loader2,
    Clock,
    Users,
    AlertTriangle,
    CheckCircle,
    PlayCircle,
    PauseCircle,
    Bell,
    MessageSquare,
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import { toast } from 'react-hot-toast'

interface Maintenance {
    id: string
    title: string
    description: string
    startTime: string
    endTime: string
    affectedAreas: string[]
    status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
    notifyCustomers: boolean
    notificationSent: boolean
    createdAt: string
}

const STATUS_CONFIG = {
    scheduled: { label: 'Terjadwal', color: 'bg-blue-500', icon: Clock },
    in_progress: { label: 'Berlangsung', color: 'bg-yellow-500', icon: PlayCircle },
    completed: { label: 'Selesai', color: 'bg-green-500', icon: CheckCircle },
    cancelled: { label: 'Dibatalkan', color: 'bg-gray-500', icon: PauseCircle },
}

export default function MaintenancePage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [maintenances, setMaintenances] = useState<Maintenance[]>([])
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form state
    const [form, setForm] = useState({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        affectedAreas: '',
        status: 'scheduled' as Maintenance['status'],
        notifyCustomers: true,
    })

    useEffect(() => {
        fetchMaintenances()
    }, [])

    const fetchMaintenances = async () => {
        setLoading(true)
        try {
            const response = await adminApi.get('/api/v1/maintenance')
            if (response.data.success) {
                setMaintenances(response.data.maintenances || [])
            }
        } catch (error) {
            console.error('Error fetching maintenances:', error)
            // Mock data for demo
            setMaintenances([
                {
                    id: '1',
                    title: 'Upgrade Core Router',
                    description: 'Peningkatan kapasitas core router untuk meningkatkan kecepatan jaringan.',
                    startTime: '2024-12-15T00:00',
                    endTime: '2024-12-15T06:00',
                    affectedAreas: ['Area Jakarta Selatan', 'Area Jakarta Barat'],
                    status: 'scheduled',
                    notifyCustomers: true,
                    notificationSent: true,
                    createdAt: new Date().toISOString(),
                },
                {
                    id: '2',
                    title: 'Maintenance Fiber',
                    description: 'Perbaikan kabel fiber optik yang rusak di area tertentu.',
                    startTime: '2024-12-10T10:00',
                    endTime: '2024-12-10T14:00',
                    affectedAreas: ['Area Tangerang'],
                    status: 'completed',
                    notifyCustomers: true,
                    notificationSent: true,
                    createdAt: new Date().toISOString(),
                },
            ])
        } finally {
            setLoading(false)
        }
    }

    const resetForm = () => {
        setForm({
            title: '',
            description: '',
            startTime: '',
            endTime: '',
            affectedAreas: '',
            status: 'scheduled',
            notifyCustomers: true,
        })
        setEditingId(null)
        setShowForm(false)
    }

    const handleEdit = (maintenance: Maintenance) => {
        setForm({
            title: maintenance.title,
            description: maintenance.description,
            startTime: maintenance.startTime,
            endTime: maintenance.endTime,
            affectedAreas: maintenance.affectedAreas.join('\n'),
            status: maintenance.status,
            notifyCustomers: maintenance.notifyCustomers,
        })
        setEditingId(maintenance.id)
        setShowForm(true)
    }

    const handleSave = async () => {
        if (!form.title.trim() || !form.startTime || !form.endTime) {
            toast.error('Judul, waktu mulai, dan waktu selesai harus diisi')
            return
        }

        setSaving(true)
        try {
            const payload = {
                ...form,
                affectedAreas: form.affectedAreas.split('\n').filter(a => a.trim()),
            }

            if (editingId) {
                const response = await adminApi.put(`/api/v1/maintenance/${editingId}`, payload)
                if (response.data.success) {
                    toast.success('Jadwal maintenance berhasil diperbarui')
                    fetchMaintenances()
                    resetForm()
                }
            } else {
                const response = await adminApi.post('/api/v1/maintenance', payload)
                if (response.data.success) {
                    toast.success('Jadwal maintenance berhasil dibuat')
                    fetchMaintenances()
                    resetForm()
                }
            }
        } catch (error) {
            console.error('Error saving maintenance:', error)
            // Demo: add locally
            const newMaintenance: Maintenance = {
                id: Date.now().toString(),
                ...form,
                affectedAreas: form.affectedAreas.split('\n').filter(a => a.trim()),
                notificationSent: false,
                createdAt: new Date().toISOString(),
            }
            if (editingId) {
                setMaintenances(prev => prev.map(m => m.id === editingId ? { ...newMaintenance, id: editingId } : m))
            } else {
                setMaintenances(prev => [...prev, newMaintenance])
            }
            toast.success(editingId ? 'Jadwal maintenance diperbarui' : 'Jadwal maintenance dibuat')
            resetForm()
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Hapus jadwal maintenance ini?')) return

        try {
            await adminApi.delete(`/api/v1/maintenance/${id}`)
            toast.success('Jadwal maintenance dihapus')
            fetchMaintenances()
        } catch (error) {
            // Demo: remove locally
            setMaintenances(prev => prev.filter(m => m.id !== id))
            toast.success('Jadwal maintenance dihapus')
        }
    }

    const handleStatusChange = async (id: string, newStatus: Maintenance['status']) => {
        try {
            await adminApi.put(`/api/v1/maintenance/${id}/status`, { status: newStatus })
            toast.success('Status diperbarui')
            fetchMaintenances()
        } catch (error) {
            // Demo: update locally
            setMaintenances(prev => prev.map(m =>
                m.id === id ? { ...m, status: newStatus } : m
            ))
            toast.success('Status diperbarui')
        }
    }

    const handleSendNotification = async (id: string) => {
        try {
            await adminApi.post(`/api/v1/maintenance/${id}/notify`)
            toast.success('Notifikasi terkirim ke pelanggan')
            fetchMaintenances()
        } catch (error) {
            toast.error('Gagal mengirim notifikasi')
        }
    }

    const formatDateTime = (dateStr: string) => {
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        return date.toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <Calendar className="h-8 w-8" />
                        Jadwal Maintenance
                    </h1>
                    <p className="text-muted-foreground">
                        Kelola jadwal maintenance jaringan dan notifikasi pelanggan
                    </p>
                </div>
                <Button onClick={() => { resetForm(); setShowForm(true) }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah Jadwal
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                    const count = maintenances.filter(m => m.status === key).length
                    return (
                        <Card key={key}>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${config.color} text-white`}>
                                        <config.icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{count}</p>
                                        <p className="text-sm text-muted-foreground">{config.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Form */}
            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>{editingId ? 'Edit Jadwal Maintenance' : 'Buat Jadwal Maintenance'}</CardTitle>
                        <CardDescription>
                            Jadwalkan maintenance dan kirim notifikasi ke pelanggan yang terdampak
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Judul</label>
                            <Input
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                                placeholder="Contoh: Upgrade Core Router"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Deskripsi</label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Jelaskan detail maintenance yang akan dilakukan..."
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Waktu Mulai</label>
                                <Input
                                    type="datetime-local"
                                    value={form.startTime}
                                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Waktu Selesai</label>
                                <Input
                                    type="datetime-local"
                                    value={form.endTime}
                                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Area Terdampak</label>
                            <Textarea
                                value={form.affectedAreas}
                                onChange={(e) => setForm({ ...form, affectedAreas: e.target.value })}
                                placeholder="Satu area per baris, contoh:&#10;Area Jakarta Selatan&#10;Area Tangerang"
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground mt-1">Kosongkan jika mempengaruhi semua area</p>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value as Maintenance['status'] })}
                                className="w-full p-2 border rounded-md bg-background text-sm"
                            >
                                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                                    <option key={key} value={key}>{config.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={form.notifyCustomers}
                                onChange={(e) => setForm({ ...form, notifyCustomers: e.target.checked })}
                                id="notifyCustomers"
                            />
                            <label htmlFor="notifyCustomers" className="text-sm font-medium">
                                Kirim notifikasi WhatsApp ke pelanggan terdampak
                            </label>
                        </div>

                        <div className="flex gap-2 pt-4">
                            <Button onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                {editingId ? 'Perbarui' : 'Simpan'}
                            </Button>
                            <Button variant="outline" onClick={resetForm}>
                                <X className="h-4 w-4 mr-2" />
                                Batal
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Maintenance List */}
            <Card>
                <CardHeader>
                    <CardTitle>Daftar Jadwal</CardTitle>
                </CardHeader>
                <CardContent>
                    {maintenances.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Belum ada jadwal maintenance</p>
                            <p className="text-sm">Klik &quot;Tambah Jadwal&quot; untuk membuat jadwal baru</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {maintenances.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map((maintenance) => {
                                const statusConfig = STATUS_CONFIG[maintenance.status]
                                return (
                                    <div
                                        key={maintenance.id}
                                        className="p-4 border rounded-lg"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h3 className="font-semibold">{maintenance.title}</h3>
                                                    <Badge className={statusConfig.color}>
                                                        {statusConfig.label}
                                                    </Badge>
                                                    {maintenance.notificationSent && (
                                                        <Badge variant="outline" className="text-green-600 border-green-600">
                                                            <Bell className="h-3 w-3 mr-1" />
                                                            Terkirim
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-sm text-muted-foreground">{maintenance.description}</p>

                                                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <Clock className="h-4 w-4" />
                                                        {formatDateTime(maintenance.startTime)} - {formatDateTime(maintenance.endTime)}
                                                    </div>
                                                    {maintenance.affectedAreas.length > 0 && (
                                                        <div className="flex items-center gap-1 text-muted-foreground">
                                                            <Users className="h-4 w-4" />
                                                            {maintenance.affectedAreas.join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {maintenance.status === 'scheduled' && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleStatusChange(maintenance.id, 'in_progress')}
                                                            title="Mulai"
                                                        >
                                                            <PlayCircle className="h-4 w-4 mr-1" />
                                                            Mulai
                                                        </Button>
                                                        {maintenance.notifyCustomers && !maintenance.notificationSent && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleSendNotification(maintenance.id)}
                                                                title="Kirim Notifikasi"
                                                            >
                                                                <MessageSquare className="h-4 w-4 mr-1" />
                                                                Notify
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                                {maintenance.status === 'in_progress' && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleStatusChange(maintenance.id, 'completed')}
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-1" />
                                                        Selesai
                                                    </Button>
                                                )}
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleEdit(maintenance)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleDelete(maintenance.id)}
                                                >
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
