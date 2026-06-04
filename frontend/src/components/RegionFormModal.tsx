'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, X } from 'lucide-react'

interface RegionFormData {
  name: string
  district: string
  regency: string
  province: string
  mitra_id: string
}

interface MitraOption {
  id: string
  name: string
}

interface RegionFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: RegionFormData) => Promise<void>
  editingRegion?: {
    id: string
    name: string
    district: string
    regency: string
    province: string
    mitra_id?: string
  }
  mitraList?: MitraOption[]
  isLoading?: boolean
}

const RegionFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  editingRegion,
  mitraList = [],
  isLoading = false
}: RegionFormModalProps) => {
  const [formData, setFormData] = useState<RegionFormData>({
    name: '',
    district: '',
    regency: '',
    province: '',
    mitra_id: ''
  })
  const [submitting, setSubmitting] = useState(false)

  // Reset form when modal opens or editing region changes
  useEffect(() => {
    if (editingRegion) {
      setFormData({
        name: editingRegion.name || '',
        district: editingRegion.district || '',
        regency: editingRegion.regency || '',
        province: editingRegion.province || '',
        mitra_id: editingRegion.mitra_id || ''
      })
    } else {
      setFormData({
        name: '',
        district: '',
        regency: '',
        province: '',
        mitra_id: ''
      })
    }
  }, [editingRegion, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    if (!formData.name.trim()) {
      alert('Nama wilayah wajib diisi!')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(formData)
      if (!editingRegion) {
        // Reset form only for new region, not when editing
        setFormData({
          name: '',
          district: '',
          regency: '',
          province: '',
          mitra_id: ''
        })
      }
    } catch (error) {
      console.error('Error submitting region:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingRegion ? 'Edit Wilayah' : 'Tambah Wilayah Baru'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="region-name">Nama Wilayah *</Label>
            <Input
              id="region-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Contoh: Jakarta Pusat"
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region-district">Kecamatan</Label>
            <Input
              id="region-district"
              value={formData.district}
              onChange={(e) => setFormData({ ...formData, district: e.target.value })}
              placeholder="Contoh: Menteng"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region-regency">Kabupaten/Kota</Label>
            <Input
              id="region-regency"
              value={formData.regency}
              onChange={(e) => setFormData({ ...formData, regency: e.target.value })}
              placeholder="Contoh: Jakarta Pusat"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region-province">Provinsi</Label>
            <Input
              id="region-province"
              value={formData.province}
              onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              placeholder="Contoh: DKI Jakarta"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="region-mitra">Mitra</Label>
            <select
              id="region-mitra"
              value={formData.mitra_id}
              onChange={(e) => setFormData({ ...formData, mitra_id: e.target.value })}
              disabled={submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">-- Tanpa Mitra --</option>
              {mitraList.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <DialogFooter className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Batal
            </Button>

            <Button
              type="submit"
              disabled={submitting || isLoading}
              className="flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingRegion ? 'Update' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default RegionFormModal
