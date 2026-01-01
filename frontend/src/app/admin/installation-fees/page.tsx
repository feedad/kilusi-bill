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
import { Edit2, Calculator, DollarSign, Settings, Loader2, RefreshCw } from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface InstallationFee {
  id: number
  billing_type: 'prepaid' | 'postpaid'
  fee_amount: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface FeeCalculation {
  billing_type: string
  installation_fee: number
  description: string
  calculated_at: string
}

export default function InstallationFeesPage() {
  const [fees, setFees] = useState<InstallationFee[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showCalculateDialog, setShowCalculateDialog] = useState(false)
  const [editingFee, setEditingFee] = useState<InstallationFee | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [calculation, setCalculation] = useState<FeeCalculation | null>(null)
  const [selectedBillingType, setSelectedBillingType] = useState<'prepaid' | 'postpaid'>('prepaid')
  const [formData, setFormData] = useState({
    billing_type: 'prepaid' as 'prepaid' | 'postpaid',
    fee_amount: '',
    description: '',
    is_active: true
  })

  const fetchFees = async () => {
    try {
      setLoading(true)
      const response = await adminApi.get('/api/v1/installation-fees')
      console.log('Fetch installation fees response:', response.data)

      if (response.data.success) {
        setFees(response.data.data.settings)
        console.log('Installation fees loaded:', response.data.data.settings.length, 'fees')
      } else {
        console.error('API returned error:', response.data.message)
        alert('Gagal memuat data biaya instalasi: ' + (response.data.message || 'Unknown error'))
      }
    } catch (error: any) {
      console.error('Error fetching installation fees:', error)

      if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
        window.location.href = '/admin/login'
      } else {
        alert('Terjadi kesalahan saat memuat data biaya instalasi: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFees()
  }, [])

  const handleUpdateFee = async () => {
    if (!editingFee || !formData.fee_amount) {
      alert('Jumlah biaya instalasi wajib diisi')
      return
    }

    try {
      setFormLoading(true)
      const requestData = {
        billing_type: formData.billing_type,
        fee_amount: parseFloat(formData.fee_amount),
        description: formData.description || null,
        is_active: formData.is_active
      }

      console.log('Updating installation fee:', editingFee.id, 'with data:', requestData)
      const response = await adminApi.put(`/api/v1/installation-fees/${editingFee.id}`, requestData)
      console.log('Update response:', response.data)

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
      } else if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
      } else {
        alert('Terjadi kesalahan saat memperbarui biaya instalasi: ' + (error.message || 'Unknown error'))
      }
    } finally {
      setFormLoading(false)
    }
  }

  const handleCalculateFee = async () => {
    try {
      setFormLoading(true)
      console.log('Calculating installation fee for:', selectedBillingType)
      const response = await adminApi.get(`/api/v1/installation-fees/calculate/${selectedBillingType}`)
      console.log('Calculate response:', response.data)

      if (response.data.success) {
        setCalculation(response.data.data)
      } else {
        alert(response.data.message || 'Gagal menghitung biaya instalasi')
      }
    } catch (error: any) {
      console.error('Error calculating installation fee:', error)

      if (error.response?.data?.message) {
        alert(error.response.data.message)
      } else if (error.response?.status === 401) {
        alert('Session habis, silakan login ulang')
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
      fee_amount: fee.fee_amount.toString(),
      description: fee.description || '',
      is_active: fee.is_active
    })
    setShowEditDialog(true)
  }

  const resetForm = () => {
    setFormData({
      billing_type: 'prepaid',
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Settings className="h-8 w-8 mr-3" />
            Pengaturan Biaya Instalasi
          </h1>
          <p className="text-muted-foreground">Kelola biaya instalasi berdasarkan tipe billing pelanggan</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => setShowCalculateDialog(true)} variant="outline">
            <Calculator className="h-4 w-4 mr-2" />
            Test Kalkulasi
          </Button>
          <Button onClick={fetchFees} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Biaya Instalasi</CardTitle>
          <CardDescription>
            Konfigurasi biaya instalasi untuk pelanggan prabayar dan pascabayar
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                        <h3 className="font-semibold">Pelanggan {getBillingTypeLabel(fee.billing_type)}</h3>
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
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Fee Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Biaya Instalasi</DialogTitle>
            <DialogDescription>
              Ubah pengaturan biaya instalasi untuk tipe billing tertentu
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label htmlFor="edit-billing-type">Tipe Billing</Label>
              <Select
                value={formData.billing_type}
                onValueChange={(value: 'prepaid' | 'postpaid') =>
                  setFormData({...formData, billing_type: value})
                }
                disabled={!!editingFee}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tipe billing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">Prabayar</SelectItem>
                  <SelectItem value="postpaid">Pascabayar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-fee-amount">Biaya Instalasi (Rp)</Label>
              <Input
                id="edit-fee-amount"
                type="number"
                value={formData.fee_amount}
                onChange={(e) => setFormData({...formData, fee_amount: e.target.value})}
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
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Masukkan deskripsi biaya instalasi"
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
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
              Test kalkulasi biaya instalasi berdasarkan tipe billing
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="calc-billing-type">Tipe Billing</Label>
              <Select
                value={selectedBillingType}
                onValueChange={(value: 'prepaid' | 'postpaid') =>
                  setSelectedBillingType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tipe billing" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prepaid">Prabayar</SelectItem>
                  <SelectItem value="postpaid">Pascabayar</SelectItem>
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
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">Tipe Billing:</span>
                      <span>{getBillingTypeLabel(calculation.billing_type)}</span>
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
                </CardContent>
              </Card>
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
    </div>
  )
}