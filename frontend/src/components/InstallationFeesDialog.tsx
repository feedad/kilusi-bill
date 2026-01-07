'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Edit2, Calculator, DollarSign, Loader2, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface InstallationFee {
  id: number
  billing_type: 'prepaid' | 'postpaid'
  fee_amount: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  package_id?: number
  package_name?: string
  package_price?: number | null
}

interface FeeCalculation {
  billing_type: string
  installation_fee: number
  description: string
  calculated_at: string
  package_id?: string | null
}

interface InstallationFeesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function InstallationFeesDialog({ open, onOpenChange }: InstallationFeesDialogProps) {
  const [fees, setFees] = useState<InstallationFee[]>([])
  const [loading, setLoading] = useState(false)
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showCalculateDialog, setShowCalculateDialog] = useState(false)
  const [editingFee, setEditingFee] = useState<InstallationFee | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [calculation, setCalculation] = useState<FeeCalculation | null>(null)
  const [selectedBillingType, setSelectedBillingType] = useState<'prepaid' | 'postpaid'>('prepaid')
  const [selectedPackage, setSelectedPackage] = useState<string>('')
  const [packages, setPackages] = useState<{ id: string, name: string }[]>([])
  const [formData, setFormData] = useState({
    billing_type: 'prepaid' as 'prepaid' | 'postpaid',
    package_id: '',
    fee_amount: '',
    description: '',
    is_active: true
  })

  const fetchFees = async () => {
    try {
      setLoading(true)
      const response = await adminApi.get('/api/v1/installation-fees')

      if (response.data.success) {
        setFees(response.data.data.settings)
      } else {
        alert('Gagal memuat data biaya instalasi: ' + (response.data.message || 'Unknown error'))
      }
    } catch (error: any) {
      console.error('Error fetching installation fees:', error)
      alert('Terjadi kesalahan saat memuat data biaya instalasi: ' + (error.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  const fetchPackages = async () => {
    try {
      setPackagesLoading(true)
      console.log('Fetching packages...')
      const response = await adminApi.get('/api/v1/packages')
      console.log('Full API response:', response.data)

      if (response.data.success && response.data.data) {
        const packagesData = response.data.data.packages || []
        console.log('Packages data from API:', packagesData)

        // Use the same mapping as packages page - direct assignment
        const mappedPackages = packagesData.map(pkg => ({
          id: String(pkg.id || ''), // Ensure string type
          name: String(pkg.name || 'Unknown Package') // Ensure string type
        }))

        console.log('Mapped packages:', mappedPackages)

        // Fallback to sample data if no packages
        if (mappedPackages.length === 0) {
          console.log('No packages found, using sample data')
          const samplePackages = [
            { id: '1', name: 'Lite' },
            { id: '2', name: 'Bronze' },
            { id: '3', name: 'Silver' },
            { id: '4', name: 'Gold' }
          ]
          setPackages(samplePackages)
        } else {
          setPackages(mappedPackages)
        }
      } else {
        console.error('Invalid response structure:', response.data)
        // Use sample data as fallback
        const samplePackages = [
          { id: '1', name: 'Lite' },
          { id: '2', name: 'Bronze' },
          { id: '3', name: 'Silver' },
          { id: '4', name: 'Gold' }
        ]
        setPackages(samplePackages)
      }
    } catch (error) {
      console.error('Error fetching packages:', error)
      // Use sample data as fallback
      const samplePackages = [
        { id: '1', name: 'Lite' },
        { id: '2', name: 'Bronze' },
        { id: '3', name: 'Silver' },
        { id: '4', name: 'Gold' }
      ]
      setPackages(samplePackages)
    } finally {
      setPackagesLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchFees()
      fetchPackages()
    }
  }, [open])

  const handleCreateFee = async () => {
    if (!formData.fee_amount) {
      alert('Jumlah biaya instalasi wajib diisi')
      return
    }

    try {
      setFormLoading(true)
      const requestData = {
        billing_type: formData.billing_type,
        package_id: formData.package_id || null,
        fee_amount: formData.fee_amount ? parseFloat(formData.fee_amount) : 0,
        description: formData.description || null,
        is_active: formData.is_active
      }

      const response = await adminApi.post('/api/v1/installation-fees', requestData)

      if (response.data.success) {
        setShowCreateDialog(false)
        resetForm()
        fetchFees()
        alert('Biaya instalasi berhasil ditambahkan')
      } else {
        alert(response.data.message || 'Gagal menambahkan biaya instalasi')
      }
    } catch (error: any) {
      console.error('Error creating installation fee:', error)
      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else {
        alert('Terjadi kesalahan saat menambahkan biaya instalasi: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleUpdateFee = async () => {
    if (!editingFee || !formData.fee_amount) {
      alert('Jumlah biaya instalasi wajib diisi')
      return
    }

    try {
      setFormLoading(true)
      const requestData = {
        billing_type: formData.billing_type,
        package_id: formData.package_id || null,
        fee_amount: formData.fee_amount ? parseFloat(formData.fee_amount) : 0,
        description: formData.description || null,
        is_active: formData.is_active
      }

      const response = await adminApi.put(`/api/v1/installation-fees/${editingFee.id}`, requestData)

      if (response.data.success) {
        setShowEditDialog(false)
        resetForm()
        fetchFees()
        alert('Biaya instalasi berhasil diperbarui')
      } else {
        alert(response.data.message || 'Gagal memperbarui biaya instalasi')
      }
    } catch (error: any) {
      console.error('Error updating installation fee:', error)
      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else {
        alert('Terjadi kesalahan saat memperbarui biaya instalasi: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteFee = async (fee: InstallationFee) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus biaya instalasi ${fee.package_name ? `untuk paket ${fee.package_name}` : 'default'} (${fee.billing_type})?`)) {
      return
    }

    try {
      setFormLoading(true)
      const response = await adminApi.delete(`/api/v1/installation-fees/${fee.id}`)

      if (response.data.success) {
        fetchFees()
        alert('Biaya instalasi berhasil dihapus')
      } else {
        alert(response.data.message || 'Gagal menghapus biaya instalasi')
      }
    } catch (error: any) {
      console.error('Error deleting installation fee:', error)
      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else {
        alert('Terjadi kesalahan saat menghapus biaya instalasi: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleCalculateFee = async () => {
    try {
      setFormLoading(true)
      const params = selectedPackage ? `?package_id=${selectedPackage}` : ''
      const response = await adminApi.get(`/api/v1/installation-fees/calculate/${selectedBillingType}${params}`)

      if (response.data.success) {
        setCalculation(response.data.data)
      } else {
        alert(response.data.message || 'Gagal menghitung biaya instalasi')
      }
    } catch (error: any) {
      console.error('Error calculating installation fee:', error)
      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else {
        alert('Terjadi kesalahan saat menghitung biaya instalasi: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const openEditDialog = (fee: InstallationFee) => {
    setEditingFee(fee)
    setFormData({
      billing_type: fee.billing_type,
      package_id: fee.package_id?.toString() || '',
      fee_amount: fee.fee_amount.toString(),
      description: fee.description || '',
      is_active: fee.is_active
    })
    setShowEditDialog(true)
  }

  const resetForm = () => {
    setFormData({
      billing_type: 'prepaid',
      package_id: '',
      fee_amount: '',
      description: '',
      is_active: true
    })
    setEditingFee(null)
  }

  const getBillingTypeLabel = (type: string) => {
    return type === 'prepaid' ? 'Prabayar' : 'Pascabayar'
  }

  const getBillingTypeBadgeVariant = (type: string) => {
    return type === 'prepaid' ? 'default' : 'secondary'
  }


  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pengaturan Biaya Instalasi</DialogTitle>
            <DialogDescription>
              Kelola biaya instalasi berdasarkan paket dan tipe billing pelanggan
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 sm:gap-0">
            <div className="flex flex-col sm:flex-row w-full sm:w-auto space-y-2 sm:space-y-0 sm:space-x-2">
              <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Tambah
              </Button>
              <Button onClick={() => setShowCalculateDialog(true)} variant="outline" size="sm" className="w-full sm:w-auto">
                <Calculator className="h-4 w-4 mr-2" />
                Test Kalkulasi
              </Button>
              <Button onClick={fetchFees} variant="outline" size="sm" className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4">
              {fees.map((fee) => (
                <div key={fee.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="font-semibold">
                          {fee.package_name ? `${fee.package_name} - ${getBillingTypeLabel(fee.billing_type)}` : `Default ${getBillingTypeLabel(fee.billing_type)}`}
                        </h3>
                        <Badge variant={getBillingTypeBadgeVariant(fee.billing_type)}>
                          {fee.billing_type.toUpperCase()}
                        </Badge>
                        <Badge variant={fee.is_active ? 'default' : 'secondary'}>
                          {fee.is_active ? 'Aktif' : 'Non-aktif'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {fee.description || 'Tidak ada deskripsi'}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium flex items-center">
                            <DollarSign className="h-4 w-4 mr-1" />
                            Biaya Instalasi:
                          </span>
                          <p className="text-lg font-bold text-green-600">
                            Rp {fee.fee_amount.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium">Dibuat:</span>
                          <p>{new Date(fee.created_at).toLocaleDateString('id-ID')}</p>
                        </div>
                        <div>
                          <span className="font-medium">Diperbarui:</span>
                          <p>{new Date(fee.updated_at).toLocaleDateString('id-ID')}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(fee)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteFee(fee)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Fee Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Biaya Instalasi</DialogTitle>
            <DialogDescription>
              Ubah pengaturan biaya instalasi untuk paket dan tipe billing tertentu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label htmlFor="edit-billing-type">Tipe Billing</Label>
              <Select
                value={formData.billing_type}
                onValueChange={(value) => setFormData({ ...formData, billing_type: value as 'prepaid' | 'postpaid' })}
                disabled={!!editingFee}
              >
                <SelectTrigger id="edit-billing-type">
                  <SelectValue placeholder="Pilih Tipe Billing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">Prabayar</SelectItem>
                  <SelectItem value="postpaid">Pascabayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-package">Paket (opsional)</Label>
              <Select
                value={formData.package_id || 'all'}
                onValueChange={(value) => setFormData({ ...formData, package_id: value === 'all' ? '' : value })}
                disabled={packagesLoading}
              >
                <SelectTrigger id="edit-package">
                  <SelectValue placeholder="Semua Paket (Default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Paket (Default)</SelectItem>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-fee-amount">Biaya Instalasi (Rp)</Label>
              <Input
                id="edit-fee-amount"
                type="number"
                value={formData.fee_amount}
                onChange={(e) => setFormData({ ...formData, fee_amount: e.target.value })}
                placeholder="Masukkan biaya instalasi"
                min="0"
                step="1000"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Deskripsi</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Masukkan deskripsi biaya instalasi"
                rows={3}
              />
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
              onClick={handleUpdateFee}
              disabled={formLoading || !formData.fee_amount}
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

      {/* Calculate Fee Dialog */}
      <Dialog open={showCalculateDialog} onOpenChange={setShowCalculateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Kalkulasi Biaya Instalasi</DialogTitle>
            <DialogDescription>
              Test kalkulasi biaya instalasi berdasarkan tipe billing dan paket
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="calc-billing-type">Tipe Billing</Label>
              <Select
                value={selectedBillingType}
                onValueChange={(value) => setSelectedBillingType(value as 'prepaid' | 'postpaid')}
              >
                <SelectTrigger id="calc-billing-type">
                  <SelectValue placeholder="Pilih Tipe Billing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">Prabayar</SelectItem>
                  <SelectItem value="postpaid">Pascabayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="calc-package">Paket (opsional)</Label>
              <Select
                value={selectedPackage || 'all'}
                onValueChange={(value) => setSelectedPackage(value === 'all' ? '' : value)}
                disabled={packagesLoading}
              >
                <SelectTrigger id="calc-package">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Default</SelectItem>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleCalculateFee}
              className="w-full"
              disabled={formLoading}
            >
              {formLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menghitung...
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4 mr-2" />
                  Hitung Biaya
                </>
              )}
            </Button>

            {calculation && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium">Tipe Billing:</span>
                    <span>{getBillingTypeLabel(calculation.billing_type)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Paket:</span>
                    <span>{calculation.package_id ? `Paket ID ${calculation.package_id}` : 'Default'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Biaya Instalasi:</span>
                    <span className="text-lg font-bold text-green-600">
                      Rp {calculation.installation_fee.toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Deskripsi:</span>
                    <span className="text-sm">{calculation.description}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Dihitung pada:</span>
                    <span className="text-sm">
                      {new Date(calculation.calculated_at).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCalculateDialog(false)
                setCalculation(null)
              }}
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Fee Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Biaya Instalasi</DialogTitle>
            <DialogDescription>
              Buat pengaturan biaya instalasi baru untuk paket dan tipe billing tertentu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label htmlFor="create-billing-type">Tipe Billing</Label>
              <Select
                value={formData.billing_type}
                onValueChange={(value) => setFormData({ ...formData, billing_type: value as 'prepaid' | 'postpaid' })}
              >
                <SelectTrigger id="create-billing-type">
                  <SelectValue placeholder="Pilih Tipe Billing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">Prabayar</SelectItem>
                  <SelectItem value="postpaid">Pascabayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="create-package">Paket (opsional)</Label>
              <Select
                value={formData.package_id || 'all'}
                onValueChange={(value) => setFormData({ ...formData, package_id: value === 'all' ? '' : value })}
                disabled={packagesLoading}
              >
                <SelectTrigger id="create-package">
                  <SelectValue placeholder="Semua Paket (Default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Paket (Default)</SelectItem>
                  {packages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="create-fee-amount">Biaya Instalasi (Rp)</Label>
              <Input
                id="create-fee-amount"
                type="number"
                value={formData.fee_amount}
                onChange={(e) => setFormData({ ...formData, fee_amount: e.target.value })}
                placeholder="Masukkan biaya instalasi"
                min="0"
                step="1000"
              />
            </div>
            <div>
              <Label htmlFor="create-description">Deskripsi</Label>
              <Textarea
                id="create-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Masukkan deskripsi biaya instalasi"
                rows={3}
              />
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
              onClick={handleCreateFee}
              disabled={formLoading || !formData.fee_amount}
            >
              {formLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                'Tambah'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}