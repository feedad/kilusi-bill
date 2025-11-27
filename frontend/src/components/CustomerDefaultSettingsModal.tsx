import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CreditCard,
  Wifi,
  Settings,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Save,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { useCustomerDefaults } from '@/hooks/useCustomerDefaults'

interface CustomerDefaultSettingsModalProps {
  open: boolean
  onClose: () => void
}

export default function CustomerDefaultSettingsModal({ open, onClose }: CustomerDefaultSettingsModalProps) {
  const { defaults, loading, updateDefaults, getDefaultValue, refetch } = useCustomerDefaults()
  const [activeTab, setActiveTab] = useState('billing')
  const [formData, setFormData] = useState<{ [key: string]: any }>({})
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Initialize form data when defaults are loaded
  useEffect(() => {
    if (!loading && Object.keys(defaults).length > 0) {
      const initialData: { [key: string]: any } = {}

      Object.keys(defaults).forEach(key => {
        if (!defaults[key]) return

        const setting = defaults[key]

        // Parse based on type
        switch (setting.type) {
          case 'boolean':
            initialData[key] = setting.value === 'true'
            break
          case 'number':
            initialData[key] = parseFloat(setting.value)
            break
          default:
            initialData[key] = setting.value
        }
      })

      setFormData(initialData)
    }
  }, [defaults, loading])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveMessage(null)

      const result = await updateDefaults(formData)

      if (result.success) {
        setSaveMessage({
          type: 'success',
          message: 'Settings berhasil disimpan!'
        })
        setTimeout(() => {
          setSaveMessage(null)
        }, 3000)
      } else {
        setSaveMessage({
          type: 'error',
          message: result.message || 'Gagal menyimpan settings'
        })
      }
    } catch (error) {
      setSaveMessage({
        type: 'error',
        message: 'Terjadi kesalahan saat menyimpan settings'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    // Reset to original defaults
    const resetData: { [key: string]: any } = {}
    Object.keys(defaults).forEach(key => {
      if (!defaults[key]) return

      const setting = defaults[key]

      // Parse based on type
      switch (setting.type) {
        case 'boolean':
          resetData[key] = setting.value === 'true'
          break
        case 'number':
          resetData[key] = parseFloat(setting.value)
          break
        default:
          resetData[key] = setting.value
      }
    })
    setFormData(resetData)
    setSaveMessage(null)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Default Settings Pelanggan</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Atur nilai default untuk mempercepat input data pelanggan baru
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Loading settings...</span>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="billing" className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Billing
                </TabsTrigger>
                <TabsTrigger value="network" className="flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Network
                </TabsTrigger>
                <TabsTrigger value="advanced" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced
                </TabsTrigger>
              </TabsList>

              {/* Billing Settings Tab */}
              <TabsContent value="billing" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Jenis Tagihan
                    </label>
                    <select
                      value={formData.billing_type || 'postpaid'}
                      onChange={(e) => handleInputChange('billing_type', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="prepaid">Prabayar</option>
                      <option value="postpaid">Pascabayar</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Siklus Billing
                    </label>
                    <select
                      value={formData.billing_cycle || 'bulan'}
                      onChange={(e) => handleInputChange('billing_cycle', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="profile">Profile</option>
                      <option value="tetap">Tetap</option>
                      <option value="bulan">Bulanan</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Aktifkan Pajak
                    </label>
                    <select
                      value={formData.tax_enabled ? 'true' : 'false'}
                      onChange={(e) => handleInputChange('tax_enabled', e.target.value === 'true')}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="true">Ya</option>
                      <option value="false">Tidak</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Persentase Pajak (%)
                    </label>
                    <Input
                      type="number"
                      value={formData.tax_percentage || 11}
                      onChange={(e) => handleInputChange('tax_percentage', parseFloat(e.target.value) || 0)}
                      min={0}
                      max={100}
                      step={0.1}
                      disabled={!formData.tax_enabled}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Tanggal Jatuh Tempo
                    </label>
                    <Input
                      type="number"
                      value={formData.due_date_day || 25}
                      onChange={(e) => handleInputChange('due_date_day', parseInt(e.target.value) || 25)}
                      min={1}
                      max={31}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Default tanggal jatuh tempo untuk pelanggan siklus bulanan (misal: 20 = tanggal 20 setiap bulan)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Hari Invoice Sebelum Suspend
                    </label>
                    <Input
                      type="number"
                      value={formData.invoice_days_before_suspend || 3}
                      onChange={(e) => handleInputChange('invoice_days_before_suspend', parseInt(e.target.value) || 3)}
                      min={1}
                      max={30}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Invoice terbit X hari sebelum suspend (berlaku untuk semua siklus)
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Network Settings Tab */}
              <TabsContent value="network" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Suffix Username PPPoE
                    </label>
                    <Input
                      value={formData.pppoe_suffix || 'isp'}
                      onChange={(e) => handleInputChange('pppoe_suffix', e.target.value)}
                      placeholder="isp"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Contoh: customer_id@{formData.pppoe_suffix || 'isp'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Default Password PPPoE
                    </label>
                    <Input
                      value={formData.pppoe_password || '1234567'}
                      onChange={(e) => handleInputChange('pppoe_password', e.target.value)}
                      type="password"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Password default untuk pelanggan baru</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Jam Isolir
                    </label>
                    <Input
                      value={formData.isolate_time || '23:59'}
                      onChange={(e) => handleInputChange('isolate_time', e.target.value)}
                      placeholder="23:59"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Jam otomatis isolir pelanggan</p>
                  </div>
                </div>
              </TabsContent>

              {/* Advanced Settings Tab */}
              <TabsContent value="advanced" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Metode Perhitungan Tanggal Aktif
                    </label>
                    <select
                      value={formData.reconnection_calculation || 'payment_date'}
                      onChange={(e) => handleInputChange('reconnection_calculation', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="payment_date">Hitung dari tanggal pembayaran</option>
                      <option value="isolate_date">Hitung dari tanggal isolir</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Untuk layanan yang sudah terisolir
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 mt-6">
                  <h4 className="font-medium text-foreground mb-2">Penjelasan Metode Perhitungan:</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p><strong>Tanggal Pembayaran:</strong> Pemakaian selama isolir diabaikan, dihitung mulai dari tanggal pembayaran</p>
                    <p><strong>Tanggal Isolir:</strong> Pemakaian selama isolir tetap dihitung ke dalam invoice</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Save Message */}
          {saveMessage && (
            <div className={`flex items-center gap-2 p-3 rounded-lg mt-4 ${
              saveMessage.type === 'success'
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-error/10 text-error border border-error/20'
            }`}>
              {saveMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>{saveMessage.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || loading}
              className="flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Simpan Settings
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}