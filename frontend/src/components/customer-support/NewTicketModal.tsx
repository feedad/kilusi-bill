'use client'

import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  MessageCircle,
  Send,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Tag,
  AlertTriangle,
  Info,
  Upload,
  Trash2
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'

interface NewTicketModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

interface SupportCategory {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  subcategories?: string[]
}

interface Attachment {
  id: string
  file: File
  name: string
  size: number
  preview?: string
}

interface TicketFormData {
  subject: string
  category: string
  subcategory: string
  priority: string
  description: string
  attachments: Attachment[]
}

const supportCategories: SupportCategory[] = [
  {
    id: 'technical',
    name: 'Masalah Teknis',
    description: 'Koneksi internet lambat, tidak bisa akses, perangkat bermasalah',
    icon: <AlertTriangle className="h-5 w-5" />,
    subcategories: [
      'Koneksi Lambat',
      'Tidak Bisa Connect',
      'WiFi Router',
      'Perangkat Modem',
      'Lainnya'
    ]
  },
  {
    id: 'billing',
    name: 'Tagihan & Pembayaran',
    description: 'Pembayaran gagal, invoice tidak ada, permintaan tagihan',
    icon: <Tag className="h-5 w-5" />,
    subcategories: [
      'Pembayaran Gagal',
      'Invoice Tidak Terima',
      'Permintaan Invoice',
      'Refund',
      'Lainnya'
    ]
  },
  {
    id: 'service',
    name: 'Layanan Internet',
    description: 'Upgrade paket, pindah alamat, informasi layanan',
    icon: <Info className="h-5 w-5" />,
    subcategories: [
      'Upgrade Paket',
      'Downgrade Paket',
      'Pindah Alamat',
      'Info Layanan',
      'Lainnya'
    ]
  },
  {
    id: 'complaint',
    name: 'Keluhan & Kritik',
    description: 'Pelayanan, kualitas, saran dan masukan',
    icon: <MessageCircle className="h-5 w-5" />,
    subcategories: [
      'Pelayanan',
      'Kualitas Layanan',
      'Tim Support',
      'Saran & Masukan',
      'Lainnya'
    ]
  }
]

const priorityLevels = [
  { id: 'low', name: 'Rendah', description: 'Tidak urgent, bisa ditangani nanti', color: 'green' },
  { id: 'medium', name: 'Sedang', description: 'Perlu perhatian dalam waktu dekat', color: 'yellow' },
  { id: 'high', name: 'Tinggi', description: 'Pengaruh besar pada penggunaan', color: 'orange' },
  { id: 'urgent', name: 'Urgent', description: 'Perlu penanganan segera', color: 'red' }
]

export default function NewTicketModal({ open, onOpenChange, onSuccess }: NewTicketModalProps) {
  const { customer } = useCustomerAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<TicketFormData>({
    subject: '',
    category: '',
    subcategory: '',
    priority: 'medium',
    description: '',
    attachments: []
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory | null>(null)

  const handleInputChange = (field: keyof TicketFormData, value: string | Attachment[]) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setError('')

    if (field === 'category') {
      const category = supportCategories.find(cat => cat.id === value)
      setSelectedCategory(category || null)
      setFormData(prev => ({ ...prev, subcategory: '' }))
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`❌ File ${file.name} terlalu besar. Maksimal 5MB.`)
        return
      }

      const attachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        size: file.size
      }

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          attachment.preview = e.target?.result as string
        }
        reader.readAsDataURL(file)
      }

      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, attachment]
      }))
    })

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter(att => att.id !== id)
    }))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const validateForm = () => {
    if (!formData.category) {
      setError('Silakan pilih kategori tiket')
      return false
    }

    if (!formData.subject.trim()) {
      setError('Subjek tiket harus diisi')
      return false
    }

    if (formData.subject.trim().length < 10) {
      setError('Subjek minimal 10 karakter')
      return false
    }

    if (!formData.description.trim()) {
      setError('Deskripsi masalah harus diisi')
      return false
    }

    if (formData.description.trim().length < 20) {
      setError('Deskripsi minimal 20 karakter')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('customer_token')
      if (!token) {
        throw new Error('Token tidak ditemukan, silakan login kembali')
      }

      // Prepare form data with customer info (same as original page)
      const ticketData = {
        customer_id: customer?.id?.toString(),
        customer_name: customer?.name,
        customer_phone: customer?.phone,
        customer_email: customer?.email,
        customer_address: customer?.address,
        customer_code: customer?.customer_id,
        category: formData.category,
        subcategory: formData.subcategory,
        subject: formData.subject,
        description: formData.description,
        priority: formData.priority,
        initial_message: formData.description // Use description as initial message
      }

      // Create FormData for file upload
      const submitData = new FormData()
      Object.entries(ticketData).forEach(([key, value]) => {
        submitData.append(key, value || '')
      })

      // Add attachments
      formData.attachments.forEach((attachment, index) => {
        submitData.append(`attachment_${index}`, attachment.file)
      })

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/v1/support/tickets`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: submitData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Gagal membuat tiket')
      }

      const result = await response.json()

      if (result.success) {
        toast.success('✅ Tiket berhasil dibuat! Tim kami akan segera merespon.', {
          duration: 3000,
          position: 'top-center'
        })

        // Reset form
        setFormData({
          subject: '',
          category: '',
          subcategory: '',
          priority: 'medium',
          description: '',
          attachments: []
        })
        setSelectedCategory(null)

        onOpenChange(false)
        onSuccess?.()
      } else {
        throw new Error(result.message || 'Gagal membuat tiket')
      }

    } catch (error: any) {
      console.error('Error creating ticket:', error)
      toast.error(`❌ ${error.message}`)
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (isSubmitting) return

    // Reset form on close
    setFormData({
      subject: '',
      category: '',
      subcategory: '',
      priority: 'medium',
      description: '',
      attachments: []
    })
    setSelectedCategory(null)
    setError('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
        {/* Header with gradient background */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-700 dark:to-purple-700 p-6 -mx-6 -mt-6">
          <DialogHeader className="border-0 pb-0">
            <DialogTitle className="text-white text-xl font-bold flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Buat Tiket Baru
            </DialogTitle>
            <p className="text-blue-100 text-sm mt-1">
              Laporkan masalah Anda dan kami akan segera membantu menyelesaikannya
            </p>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category Selection - Visual Cards */}
          <div className="space-y-4">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Kategori Tiket <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-1 gap-3">
              {supportCategories.map((category) => (
                <div
                  key={category.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    formData.category === category.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                  onClick={() => handleInputChange('category', category.id)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      {category.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{category.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{category.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedCategory && selectedCategory.subcategories && (
              <div className="mt-3">
                <Label htmlFor="subcategory" className="text-sm text-gray-700 dark:text-gray-300">Subkategori</Label>
                <select
                  id="subcategory"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  value={formData.subcategory}
                  onChange={(e) => handleInputChange('subcategory', e.target.value)}
                >
                  <option value="">Pilih subkategori (opsional)</option>
                  {selectedCategory.subcategories.map((sub) => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Subjek Tiket <span className="text-red-500">*</span>
            </Label>
            <Input
              id="subject"
              type="text"
              placeholder="Contoh: Internet sangat lambat sejak 2 hari lalu"
              value={formData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400"
              disabled={isSubmitting}
              minLength={10}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minimal 10 karakter, maksimal 100 karakter
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Deskripsi Masalah <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="description"
              placeholder="Jelaskan masalah yang Anda alami dengan detail. Sertakan informasi seperti kapan masalah terjadi, apa yang sudah Anda coba lakukan, dll."
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={6}
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
              disabled={isSubmitting}
              minLength={20}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Minimal 20 karakter. Semakin detail, semakin mudah tim kami membantu.
            </p>
          </div>

          {/* Priority Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Tingkat Prioritas
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {priorityLevels.map((priority) => (
                <div
                  key={priority.id}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    formData.priority === priority.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                  onClick={() => handleInputChange('priority', priority.id)}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${
                      priority.id === 'low' ? 'bg-green-500' :
                      priority.id === 'medium' ? 'bg-yellow-500' :
                      priority.id === 'high' ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}></div>
                    <span className="font-medium text-gray-900 dark:text-white">{priority.name}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{priority.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Lampiran (Opsional)
            </Label>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                disabled={isSubmitting}
              >
                <Upload className="h-4 w-4 mr-2" />
                Tambah Lampiran
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Maksimal 5 file, masing-masing maksimal 5MB. Format: JPG, PNG, PDF, DOC, TXT
              </p>
            </div>

            {formData.attachments.length > 0 && (
              <div className="mt-4 space-y-2">
                {formData.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {attachment.preview ? (
                        <img
                          src={attachment.preview}
                          alt={attachment.name}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                          <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{attachment.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(attachment.size)}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeAttachment(attachment.id)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border-red-300 dark:border-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
            </div>
          )}

          {/* Help Text */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Waktu Response:</p>
                <p className="text-blue-700 dark:text-blue-300">
                  Tiket akan kami proses dalam 1x24 jam pada hari kerja. Prioritas tinggi akan diproses lebih cepat.
                </p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <DialogFooter className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <CheckCircle className="w-3 h-3 inline mr-1" />
            Tiket akan dilacak melalui email Anda
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Batal
            </Button>
            <Button
              type="submit"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Mengirim...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Kirim Tiket
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}