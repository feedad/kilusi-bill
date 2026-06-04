'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui'
import { Button, Input } from '@/components/ui'
import { toast } from 'react-hot-toast'
import { Plus, Trash2, Edit, Save, X, Loader2, Search, EyeOff, Eye } from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface Mitra {
  id: string
  name: string
  phone: string
  email: string
  address: string
  notes: string
  disabled_at: string | null
  created_at: string
}

export default function MitraPage() {
  const [mitra, setMitra] = useState<Mitra[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [search, setSearch] = useState('')

  const fetchMitra = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (search) params.set('search', search)
      const res = await adminApi.get(`/api/v1/mitra?${params}`)
      if (res.data?.success) {
        setMitra(res.data.data || [])
      }
    } catch (e) {
      toast.error('Gagal memuat data mitra')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { fetchMitra() }, [fetchMitra])

  const resetForm = () => {
    setForm({ name: '', phone: '', email: '', address: '', notes: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleEdit = (m: Mitra) => {
    setForm({ name: m.name, phone: m.phone || '', email: m.email || '', address: m.address || '', notes: m.notes || '' })
    setEditingId(m.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nama mitra harus diisi'); return }
    setSaving(true)
    try {
      if (editingId) {
        const res = await adminApi.put(`/api/v1/mitra/${editingId}`, form)
        if (res.data?.success) {
          toast.success('Mitra berhasil diperbarui')
          fetchMitra(); resetForm()
        } else { toast.error(res.data?.message) }
      } else {
        const res = await adminApi.post('/api/v1/mitra', form)
        if (res.data?.success) {
          toast.success('Mitra berhasil dibuat')
          fetchMitra(); resetForm()
        } else { toast.error(res.data?.message) }
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal menyimpan')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus mitra ini?')) return
    try {
      const res = await adminApi.delete(`/api/v1/mitra/${id}`)
      if (res.data?.success) {
        toast.success('Mitra dihapus')
        fetchMitra()
      } else { toast.error(res.data?.message) }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal menghapus')
    }
  }

  const handleToggle = async (m: Mitra) => {
    try {
      const endpoint = m.disabled_at ? 'enable' : 'disable'
      const res = await adminApi.patch(`/api/v1/mitra/${m.id}/${endpoint}`)
      if (res.data?.success) {
        toast.success(m.disabled_at ? 'Mitra diaktifkan' : 'Mitra dinonaktifkan')
        fetchMitra()
      } else { toast.error(res.data?.message) }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal')
    }
  }

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mitra</h1>
          <p className="text-muted-foreground text-sm">Kelola data mitra/partner</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-2" />Tambah Mitra
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Nama Mitra *</label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama mitra" />
              </div>
              <div>
                <label className="text-sm font-medium">Telepon</label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Nomor telepon" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Alamat email" />
              </div>
              <div>
                <label className="text-sm font-medium">Alamat</label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Alamat mitra" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Catatan</label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Catatan" />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {editingId ? 'Perbarui' : 'Simpan'}
              </Button>
              <Button variant="outline" onClick={resetForm}><X className="h-4 w-4 mr-2" />Batal</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 max-w-xs">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cari mitra..."
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">NAMA</th>
                  <th className="text-left p-3 font-medium">TELEPON</th>
                  <th className="text-left p-3 font-medium">EMAIL</th>
                  <th className="text-left p-3 font-medium">ALAMAT</th>
                  <th className="text-left p-3 font-medium">CATATAN</th>
                  <th className="text-left p-3 font-medium">STATUS</th>
                  <th className="text-center p-3 font-medium">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></td></tr>
                ) : mitra.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Tidak ada data mitra</td></tr>
                ) : mitra.map(m => (
                  <tr key={m.id} className={`border-b hover:bg-muted/50 ${m.disabled_at ? 'opacity-50' : ''}`}>
                    <td className="p-3 font-medium">{m.name}</td>
                    <td className="p-3 text-xs">{m.phone || '-'}</td>
                    <td className="p-3 text-xs">{m.email || '-'}</td>
                    <td className="p-3 text-xs">{m.address || '-'}</td>
                    <td className="p-3 text-xs max-w-[150px] truncate">{m.notes || '-'}</td>
                    <td className="p-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${m.disabled_at ? 'bg-red-500/10 text-red-600 border-red-500/30' : 'bg-green-500/10 text-green-600 border-green-500/30'}`}>
                        {m.disabled_at ? 'Nonaktif' : 'Aktif'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="ghost" onClick={() => handleToggle(m)} title={m.disabled_at ? 'Aktifkan' : 'Nonaktifkan'}>
                          {m.disabled_at ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(m)}><Edit className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
