'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
    Megaphone,
    Plus,
    Trash2,
    Edit,
    Save,
    X,
    Eye,
    EyeOff,
    Loader2,
    Calendar,
    AlertTriangle,
    Info,
    CheckCircle,
    Bell,
    GripVertical,
    ChevronDown,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { adminApi } from '@/lib/api-clients'
import { toast } from 'react-hot-toast'

interface Broadcast {
    id: string
    title: string
    content: string
    type: 'info' | 'warning' | 'success' | 'error'
    isActive: boolean
    startDate: string
    endDate: string
    priority: number
    createdAt: string
    target_all?: boolean
    target_areas?: string // JSON string or array from backend
}

const BROADCAST_TYPES = [
    { value: 'info', label: 'Informasi', icon: Info, color: 'bg-blue-500' },
    { value: 'warning', label: 'Peringatan', icon: AlertTriangle, color: 'bg-yellow-500' },
    { value: 'success', label: 'Sukses', icon: CheckCircle, color: 'bg-green-500' },
    { value: 'error', label: 'Penting', icon: Bell, color: 'bg-red-500' },
]

export default function BroadcastPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
    const [regions, setRegions] = useState<{ id: string, name: string }[]>([])
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form state
    const [form, setForm] = useState({
        title: '',
        content: '',
        type: 'info' as Broadcast['type'],
        isActive: true,
        startDate: '',
        endDate: '',
        priority: 0,
        target_all: true,
        target_areas: [] as string[],
    })

    useEffect(() => {
        fetchBroadcasts()
        fetchRegions()
    }, [])

    const fetchRegions = async () => {
        try {
            const response = await adminApi.get('/api/v1/regions')
            if (response.data.success) {
                setRegions(response.data.data || [])
            }
        } catch (error) {
            console.error('Error fetching regions:', error)
            // Fallback for empty/missing table
            setRegions([])
        }
    }

    const fetchBroadcasts = async () => {
        setLoading(true)
        try {
            const response = await adminApi.get('/api/v1/broadcasts')
            if (response.data.success) {
                setBroadcasts(response.data.broadcasts || [])
            }
        } catch (error) {
            console.error('Error fetching broadcasts:', error)
            // Mock data for demo
            setBroadcasts([
                {
                    id: '1',
                    title: 'Maintenance Terjadwal',
                    content: 'Akan ada maintenance jaringan pada tanggal 15 Desember 2024 pukul 00:00 - 06:00 WIB.',
                    type: 'warning',
                    isActive: true,
                    startDate: '2024-12-01',
                    endDate: '2024-12-15',
                    priority: 1,
                    createdAt: new Date().toISOString(),
                },
                {
                    id: '2',
                    title: 'Promo Akhir Tahun',
                    content: 'Dapatkan diskon 20% untuk upgrade paket hingga 31 Desember 2024!',
                    type: 'success',
                    isActive: true,
                    startDate: '2024-12-01',
                    endDate: '2024-12-31',
                    priority: 2,
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
            content: '',
            type: 'info',
            isActive: true,
            startDate: '',
            endDate: '',
            priority: 0,
            startDate: '',
            endDate: '',
            priority: 0,
            target_all: true,
            target_areas: [],
        })
        setEditingId(null)
        setShowForm(false)
    }

    const handleEdit = (broadcast: Broadcast) => {
        setForm({
            title: broadcast.title,
            content: broadcast.content,
            type: broadcast.type,
            isActive: broadcast.isActive,
            startDate: broadcast.startDate,
            endDate: broadcast.endDate,
            priority: broadcast.priority,
            target_all: broadcast.target_all !== undefined ? broadcast.target_all : true,
            target_areas: broadcast.target_areas
                ? (Array.isArray(broadcast.target_areas)
                    ? broadcast.target_areas
                    : typeof broadcast.target_areas === 'string'
                        ? (broadcast.target_areas as string).replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean)
                        : [])
                : [],
        })
        setEditingId(broadcast.id)
        setShowForm(true)
    }

    const handleSave = async () => {
        if (!form.title.trim() || !form.content.trim()) {
            toast.error('Judul dan konten harus diisi')
            return
        }

        setSaving(true)
        try {
            const payload = {
                ...form,
                target_areas: form.target_all ? [] : form.target_areas
            }

            if (editingId) {
                // Update existing
                const response = await adminApi.put(`/api/v1/broadcasts/${editingId}`, payload)
                if (response.data.success) {
                    toast.success('Pengumuman berhasil diperbarui')
                    fetchBroadcasts()
                    resetForm()
                }
            } else {
                // Create new
                const response = await adminApi.post('/api/v1/broadcasts', payload)
                if (response.data.success) {
                    toast.success('Broadcast berhasil dibuat')
                    fetchBroadcasts()
                    resetForm()
                }
            }
        } catch (error) {
            console.error('Error saving broadcast:', error)
            // Demo: add locally
            const newBroadcast: Broadcast = {
                id: Date.now().toString(),
                ...form,
                createdAt: new Date().toISOString(),
            }
            if (editingId) {
                setBroadcasts(prev => prev.map(b => b.id === editingId ? { ...newBroadcast, id: editingId } : b))
            } else {
                setBroadcasts(prev => [...prev, newBroadcast])
            }
            toast.success(editingId ? 'Broadcast diperbarui' : 'Broadcast dibuat')
            resetForm()
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Hapus broadcast ini?')) return

        try {
            await adminApi.delete(`/api/v1/broadcasts/${id}`)
            toast.success('Broadcast dihapus')
            fetchBroadcasts()
        } catch (error) {
            // Demo: remove locally
            setBroadcasts(prev => prev.filter(b => b.id !== id))
            toast.success('Broadcast dihapus')
        }
    }

    const toggleActive = async (broadcast: Broadcast) => {
        try {
            await adminApi.put(`/api/v1/broadcasts/${broadcast.id}`, {
                ...broadcast,
                isActive: !broadcast.isActive,
            })
            fetchBroadcasts()
        } catch (error) {
            // Demo: toggle locally
            setBroadcasts(prev => prev.map(b =>
                b.id === broadcast.id ? { ...b, isActive: !b.isActive } : b
            ))
        }
    }

    const getTypeConfig = (type: Broadcast['type']) => {
        return BROADCAST_TYPES.find(t => t.value === type) || BROADCAST_TYPES[0]
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
                        <Megaphone className="h-8 w-8" />
                        Pengumuman
                    </h1>
                    <p className="text-muted-foreground">
                        Kelola pengumuman yang ditampilkan di portal pelanggan
                    </p>
                </div>
                <Button onClick={() => { resetForm(); setShowForm(true) }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Buat Pengumuman
                </Button>
            </div>

            {/* Form */}
            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle>{editingId ? 'Edit Pengumuman' : 'Buat Pengumuman Baru'}</CardTitle>
                        <CardDescription>
                            Pengumuman akan ditampilkan sebagai banner di portal pelanggan
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Judul</label>
                                <Input
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    placeholder="Judul pengumuman"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Tipe</label>
                                <div className="flex gap-2">
                                    {BROADCAST_TYPES.map(type => (
                                        <button
                                            key={type.value}
                                            onClick={() => setForm({ ...form, type: type.value as Broadcast['type'] })}
                                            className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-sm transition-colors ${form.type === type.value
                                                ? `${type.color} text-white border-transparent`
                                                : 'bg-background border-border hover:bg-muted'
                                                }`}
                                        >
                                            <type.icon className="h-4 w-4" />
                                            {type.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">Konten</label>
                            <Textarea
                                value={form.content}
                                onChange={(e) => setForm({ ...form, content: e.target.value })}
                                placeholder="Isi pengumuman yang akan ditampilkan ke pelanggan..."
                                rows={4}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Tanggal Mulai</label>
                                <Input
                                    type="date"
                                    value={form.startDate}
                                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Tanggal Berakhir</label>
                                <Input
                                    type="date"
                                    value={form.endDate}
                                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Prioritas</label>
                                <Input
                                    type="number"
                                    value={form.priority}
                                    onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                                    placeholder="0"
                                />
                                <p className="text-xs text-muted-foreground mt-1">Semakin tinggi, semakin atas</p>
                            </div>
                        </div>

                        {/* Target Audience Section */}
                        <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            <label className="text-sm font-medium mb-4 block">Target Audience</label>

                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={form.target_all}
                                        onChange={(e) => setForm({ ...form, target_all: e.target.checked })}
                                        id="targetAll"
                                    />
                                    <label htmlFor="targetAll" className="text-sm font-medium">
                                        Kirim ke Semua Pelanggan
                                    </label>
                                </div>

                                {!form.target_all && (
                                    <div className="ml-6">
                                        <label className="text-sm font-medium mb-1 block">
                                            Pilih Wilayah
                                        </label>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" className="w-full justify-between">
                                                    {form.target_areas.length > 0
                                                        ? `${form.target_areas.length} Wilayah Dipilih`
                                                        : "Pilih Wilayah..."}
                                                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-[300px] max-h-[300px] overflow-y-auto">
                                                <DropdownMenuLabel>Daftar Wilayah</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                {regions.length === 0 ? (
                                                    <div className="p-2 text-sm text-muted-foreground text-center">
                                                        Tidak ada data wilayah ditemukan (Tabel regions kosong)
                                                    </div>
                                                ) : (
                                                    regions.map((region) => (
                                                        <DropdownMenuCheckboxItem
                                                            key={region.id}
                                                            checked={form.target_areas.includes(region.name)}
                                                            onCheckedChange={(checked) => {
                                                                setForm(prev => ({
                                                                    ...prev,
                                                                    target_areas: checked
                                                                        ? [...prev.target_areas, region.name]
                                                                        : prev.target_areas.filter(name => name !== region.name)
                                                                }))
                                                            }}
                                                        >
                                                            {region.name}
                                                        </DropdownMenuCheckboxItem>
                                                    ))
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>

                                        {/* Display selected tags */}
                                        {form.target_areas.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {form.target_areas.map(area => (
                                                    <Badge key={area} variant="secondary" className="text-xs">
                                                        {area}
                                                        <button
                                                            onClick={() => setForm(prev => ({
                                                                ...prev,
                                                                target_areas: prev.target_areas.filter(name => name !== area)
                                                            }))}
                                                            className="ml-1 hover:text-red-500"
                                                        >
                                                            ×
                                                        </button>
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}

                                        <p className="text-xs text-muted-foreground mt-2">
                                            Pilih wilayah target dari dropdown. (Data diambil dari tabel regions)
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                                id="isActive"
                            />
                            <label htmlFor="isActive" className="text-sm font-medium">
                                Aktifkan pengumuman ini
                            </label>
                        </div>

                        {/* Preview */}
                        <div className="pt-4 border-t">
                            <p className="text-sm font-medium mb-2">Preview:</p>
                            <div className={`p-4 rounded-lg ${getTypeConfig(form.type).color} text-white`}>
                                <div className="flex items-center gap-2 font-semibold">
                                    {React.createElement(getTypeConfig(form.type).icon, { className: 'h-5 w-5' })}
                                    {form.title || 'Judul Pengumuman'}
                                </div>
                                <p className="mt-1 text-sm opacity-90">
                                    {form.content || 'Konten pengumuman akan ditampilkan di sini...'}
                                </p>
                                {(!form.target_all && form.target_areas.length > 0) && (
                                    <div className="mt-2 pt-2 border-t border-white/20 text-xs">
                                        Target: {form.target_areas.join(', ')}
                                    </div>
                                )}
                            </div>
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

            {/* Broadcasts List */}
            <Card>
                <CardHeader>
                    <CardTitle>Daftar Pengumuman</CardTitle>
                </CardHeader>
                <CardContent>
                    {broadcasts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>Belum ada pengumuman</p>
                            <p className="text-sm">Klik &quot;Buat Pengumuman&quot; untuk membuat pengumuman baru</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {broadcasts.sort((a, b) => b.priority - a.priority).map((broadcast) => {
                                const typeConfig = getTypeConfig(broadcast.type)
                                return (
                                    <div
                                        key={broadcast.id}
                                        className={`p-4 border rounded-lg ${broadcast.isActive ? '' : 'opacity-50'}`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 flex-1">
                                                <div className={`p-2 rounded-lg ${typeConfig.color} text-white`}>
                                                    <typeConfig.icon className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-semibold">{broadcast.title}</h3>
                                                        <Badge variant={broadcast.isActive ? 'default' : 'secondary'}>
                                                            {broadcast.isActive ? 'Aktif' : 'Nonaktif'}
                                                        </Badge>
                                                        {!broadcast.target_all && (
                                                            <Badge variant="outline" className="text-xs">
                                                                Target Area
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground mt-1">{broadcast.content}</p>
                                                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {broadcast.startDate || '-'} s/d {broadcast.endDate || '-'}
                                                        </span>
                                                        <span>Prioritas: {broadcast.priority}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => toggleActive(broadcast)}
                                                    title={broadcast.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                                >
                                                    {broadcast.isActive ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleEdit(broadcast)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleDelete(broadcast.id)}
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
