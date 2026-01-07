'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Edit2, Trash2, Search, Users, DollarSign, Package, Loader2, Settings, Wifi, Zap, Clock, TrendingUp } from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import InstallationFeesDialog from '@/components/InstallationFeesDialog'

interface ServicePackage {
  id: string
  name: string
  description: string
  price: number
  speed: string
  duration: string
  isActive: boolean
  customerCount: number
  totalRevenue: number
  features: string[]
  group: string | null
  rateLimit: string | null
  shared: boolean
  hpp: number
  commission: number
  createdAt: string
  updatedAt: string
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showInstallationFeesDialog, setShowInstallationFeesDialog] = useState(false)
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    speed: '',
    price: '',
    group: '',
    rate_limit: '',
    shared: true,
    hpp: '',
    commission: '',
    is_active: true
  })

  const fetchPackages = async () => {
    try {
      setLoading(true)
      const response = await adminApi.get('/api/v1/packages')
      console.log('Fetch packages response:', response.data)

      if (response.data.success) {
        setPackages(response.data.data.packages)
        console.log('Packages loaded:', response.data.data.packages.length, 'packages')
      } else {
        console.error('API returned error:', response.data.message)
        alert('Gagal memuat data paket: ' + (response.data.message || 'Unknown error'))
      }
    } catch (error: any) {
      console.error('Error fetching packages:', error)

      if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
        window.location.href = '/admin/login'
      } else {
        alert('Terjadi kesalahan saat memuat data paket: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPackages()
  }, [])

  const handleCreatePackage = async () => {
    if (!formData.name || !formData.speed || !formData.price) {
      alert('Nama, kecepatan, dan harga paket wajib diisi')
      return
    }

    try {
      setFormLoading(true)
      const requestData = {
        name: formData.name,
        speed: formData.speed,
        price: parseFloat(formData.price),
        description: formData.description,
        group: formData.group || null,
        rate_limit: formData.rate_limit || null,
        shared: formData.shared,
        hpp: parseFloat(formData.hpp) || 0,
        commission: parseFloat(formData.commission) || 0
      }

      console.log('Creating package with data:', requestData)
      const response = await adminApi.post('/api/v1/packages', requestData)
      console.log('Create response:', response.data)

      if (response.data.success) {
        setShowCreateDialog(false)
        resetForm()
        fetchPackages()
        alert('Paket berhasil dibuat')
      } else {
        alert(response.data.message || 'Gagal membuat paket')
      }
    } catch (error: any) {
      console.error('Error creating package:', error)

      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
      } else {
        alert('Terjadi kesalahan saat membuat paket: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleUpdatePackage = async () => {
    if (!formData.name || !formData.speed || !formData.price || !editingPackage) {
      alert('Nama, kecepatan, dan harga paket wajib diisi')
      return
    }

    try {
      setFormLoading(true)
      const requestData = {
        name: formData.name,
        speed: formData.speed,
        price: parseFloat(formData.price),
        description: formData.description,
        group: formData.group || null,
        rate_limit: formData.rate_limit || null,
        shared: formData.shared,
        hpp: parseFloat(formData.hpp) || 0,
        commission: parseFloat(formData.commission) || 0
      }

      console.log('Updating package:', editingPackage.id, 'with data:', requestData)
      const response = await adminApi.put(`/api/v1/packages/${editingPackage.id}`, requestData)
      console.log('Update response:', response.data)

      if (response.data.success) {
        setShowEditDialog(false)
        resetForm()
        fetchPackages()
        alert('Paket berhasil diperbarui')
      } else {
        alert(response.data.message || 'Gagal memperbarui paket')
      }
    } catch (error: any) {
      console.error('Error updating package:', error)

      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
      } else {
        alert('Terjadi kesalahan saat memperbarui paket: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeletePackage = async (pkg: ServicePackage) => {
    if (pkg.customerCount > 0) {
      alert('Tidak dapat menghapus paket yang memiliki pelanggan')
      return
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus paket "${pkg.name}"?`)) {
      return
    }

    try {
      console.log('Deleting package:', pkg.id, pkg.name)
      const response = await adminApi.delete(`/api/v1/packages/${pkg.id}`)
      console.log('Delete response:', response.data)

      if (response.data.success) {
        fetchPackages()
        alert('Paket berhasil dihapus')
      } else {
        alert(response.data.message || 'Gagal menghapus paket')
      }
    } catch (error: any) {
      console.error('Error deleting package:', error)

      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
      } else {
        alert('Terjadi kesalahan saat menghapus paket: ' + (error.message || 'Unknown error'))
      }
    }
  }

  const openEditDialog = (pkg: ServicePackage) => {
    setEditingPackage(pkg)
    setFormData({
      name: pkg.name,
      description: pkg.description || '',
      speed: pkg.speed,
      price: pkg.price.toString(),
      group: pkg.group || '',
      rate_limit: pkg.rateLimit || '',
      shared: pkg.shared,
      hpp: pkg.hpp.toString(),
      commission: pkg.commission.toString(),
      is_active: pkg.isActive
    })
    setShowEditDialog(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      speed: '',
      price: '',
      group: '',
      rate_limit: '',
      shared: true,
      hpp: '',
      commission: '',
      is_active: true
    })
    setEditingPackage(null)
  }

  const filteredPackages = packages.filter(pkg =>
    pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pkg.speed.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
        <div>
          <h1 className="text-3xl font-bold">Manajemen Paket</h1>
          <p className="text-muted-foreground">Kelola paket layanan internet</p>
        </div>
        <div className="flex flex-col sm:flex-row w-full sm:w-auto space-y-2 sm:space-y-0 sm:space-x-2">
          <Button variant="outline" onClick={() => setShowInstallationFeesDialog(true)} className="w-full sm:w-auto">
            <Settings className="h-4 w-4 mr-2" />
            Biaya Instalasi
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Tambah Paket
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Paket</CardTitle>
          <CardDescription>
            Total {filteredPackages.length} paket layanan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari paket..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPackages.map((pkg) => (
                <Card key={pkg.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${pkg.isActive ? 'bg-blue-500' : 'bg-slate-500'}`}>
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{pkg.name}</h3>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Zap className="w-3 h-3 mr-1" />
                            {pkg.speed}
                          </div>
                        </div>
                      </div>
                      <Badge variant={pkg.isActive ? 'default' : 'secondary'}>
                        {pkg.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="flex items-start space-x-2 text-sm">
                      <Settings className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <span className="text-muted-foreground line-clamp-2">
                        {pkg.description || 'No description provided'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Revenue Share</span>
                        <span>{pkg.commission}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(pkg.commission, 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        HPP: Rp {pkg.hpp.toLocaleString()}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-primary">Rp {pkg.price.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">/month</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1">
                          <p className="text-2xl font-bold text-green-600">{pkg.customerCount}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Customers</p>
                      </div>
                    </div>

                    <div className="flex space-x-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(pkg)}
                        className="flex-1"
                      >
                        <Edit2 className="w-4 h-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeletePackage(pkg)}
                        disabled={pkg.customerCount > 0}
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Package Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Paket Baru</DialogTitle>
            <DialogDescription>
              Buat paket layanan internet baru
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label htmlFor="create-name">Nama Paket</Label>
              <Input
                id="create-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Masukkan nama paket"
              />
            </div>
            <div>
              <Label htmlFor="create-description">Deskripsi</Label>
              <Textarea
                id="create-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Masukkan deskripsi paket"
              />
            </div>
            <div>
              <Label htmlFor="create-speed">Kecepatan</Label>
              <Input
                id="create-speed"
                value={formData.speed}
                onChange={(e) => setFormData({ ...formData, speed: e.target.value })}
                placeholder="Contoh: 10/10"
              />
            </div>
            <div>
              <Label htmlFor="create-price">Harga</Label>
              <Input
                id="create-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="Masukkan harga"
              />
            </div>
            <div>
              <Label htmlFor="create-group">Grup</Label>
              <Input
                id="create-group"
                value={formData.group}
                onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                placeholder="Masukkan grup paket"
              />
            </div>
            <div>
              <Label htmlFor="create-rate-limit">Rate Limit</Label>
              <Input
                id="create-rate-limit"
                value={formData.rate_limit}
                onChange={(e) => setFormData({ ...formData, rate_limit: e.target.value })}
                placeholder="Contoh: 10M/10M"
              />
            </div>
            <div>
              <Label htmlFor="create-hpp">HPP (Harga Pokok)</Label>
              <Input
                id="create-hpp"
                type="number"
                value={formData.hpp}
                onChange={(e) => setFormData({ ...formData, hpp: e.target.value })}
                placeholder="Masukkan HPP"
              />
            </div>
            <div>
              <Label htmlFor="create-commission">Komisi</Label>
              <Input
                id="create-commission"
                type="number"
                value={formData.commission}
                onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                placeholder="Masukkan komisi"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="create-shared"
                checked={formData.shared}
                onCheckedChange={(checked) => setFormData({ ...formData, shared: checked })}
              />
              <Label htmlFor="create-shared">Shared</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="create-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="create-active">Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={formLoading}
            >
              Batal
            </Button>
            <Button
              onClick={handleCreatePackage}
              disabled={formLoading || !formData.name || !formData.speed || !formData.price}
            >
              {formLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                'Simpan'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Package Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Paket</DialogTitle>
            <DialogDescription>
              Ubah informasi paket layanan
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label htmlFor="edit-name">Nama Paket</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Masukkan nama paket"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Deskripsi</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Masukkan deskripsi paket"
              />
            </div>
            <div>
              <Label htmlFor="edit-speed">Kecepatan</Label>
              <Input
                id="edit-speed"
                value={formData.speed}
                onChange={(e) => setFormData({ ...formData, speed: e.target.value })}
                placeholder="Contoh: 10/10"
              />
            </div>
            <div>
              <Label htmlFor="edit-price">Harga</Label>
              <Input
                id="edit-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="Masukkan harga"
              />
            </div>
            <div>
              <Label htmlFor="edit-group">Grup</Label>
              <Input
                id="edit-group"
                value={formData.group}
                onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                placeholder="Masukkan grup paket"
              />
            </div>
            <div>
              <Label htmlFor="edit-rate-limit">Rate Limit</Label>
              <Input
                id="edit-rate-limit"
                value={formData.rate_limit}
                onChange={(e) => setFormData({ ...formData, rate_limit: e.target.value })}
                placeholder="Contoh: 10M/10M"
              />
            </div>
            <div>
              <Label htmlFor="edit-hpp">HPP (Harga Pokok)</Label>
              <Input
                id="edit-hpp"
                type="number"
                value={formData.hpp}
                onChange={(e) => setFormData({ ...formData, hpp: e.target.value })}
                placeholder="Masukkan HPP"
              />
            </div>
            <div>
              <Label htmlFor="edit-commission">Komisi</Label>
              <Input
                id="edit-commission"
                type="number"
                value={formData.commission}
                onChange={(e) => setFormData({ ...formData, commission: e.target.value })}
                placeholder="Masukkan komisi"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-shared"
                checked={formData.shared}
                onCheckedChange={(checked) => setFormData({ ...formData, shared: checked })}
              />
              <Label htmlFor="edit-shared">Shared</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="edit-active">Aktif</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={formLoading}
            >
              Batal
            </Button>
            <Button
              onClick={handleUpdatePackage}
              disabled={formLoading || !formData.name || !formData.speed || !formData.price}
            >
              {formLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                'Update'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Installation Fees Dialog */}
      <InstallationFeesDialog
        open={showInstallationFeesDialog}
        onOpenChange={setShowInstallationFeesDialog}
      />
    </div>
  )
}