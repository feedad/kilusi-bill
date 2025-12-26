'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  Send,
  Upload,
  X,
  AlertCircle,
  MessageSquare,
  Tag,
  AlertTriangle,
  Info,
  FileText,
  Plus,
  Trash2
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { api } from '@/lib/api'

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
    id: 'general',
    name: 'Informasi Umum',
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
    icon: <MessageSquare className="h-5 w-5" />,
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

export default function NewSupportTicketPage() {
  const router = useRouter()
  const { customer } = useCustomerAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    category: '',
    subcategory: '',
    subject: '',
    description: '',
    priority: 'medium'
  })

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<SupportCategory | null>(null)

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))

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

      setAttachments(prev => [...prev, attachment])
    })

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id))
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
      toast.error('❌ Silakan pilih kategori tiket')
      return false
    }

    if (!formData.subject) {
      toast.error('❌ Silakan isi subjek tiket')
      return false
    }

    if (formData.subject.length < 10) {
      toast.error('❌ Subjek minimal 10 karakter')
      return false
    }

    if (!formData.description) {
      toast.error('❌ Silakan isi deskripsi masalah')
      return false
    }

    if (formData.description.length < 20) {
      toast.error('❌ Deskripsi minimal 20 karakter')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare form data with customer info
      const ticketData = {
        customer_id: customer?.id?.toString(),
        customer_name: customer?.name,
        customer_phone: customer?.phone,
        customer_email: customer?.email,
        customer_address: customer?.address,
        customer_code: customer?.customer_id,
        category: formData.category,
        subject: formData.subject,
        description: formData.description,
        priority: formData.priority,
        initial_message: formData.description // Use description as initial message
      }

      // Submit to API
      const response = await api.post('/support/tickets', ticketData)

      toast.success('✅ Tiket berhasil dibuat! Tim kami akan segera merespon.')
      router.push('/customer/support')
    } catch (error: any) {
      console.error('Error creating ticket:', error)
      const errorMessage = error.response?.data?.message || 'Gagal membuat tiket. Silakan coba lagi.'
      toast.error(`❌ ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-8">
          <Button
            variant="outline"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Buat Tiket Baru</h1>
            <p className="text-gray-600">Jelaskan masalah yang Anda alami</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center space-x-4 mb-8">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</div>
            <span className="ml-2 text-sm font-medium">Pilih Kategori</span>
          </div>
          <div className="flex-1 h-0.5 bg-gray-300"></div>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-sm font-medium">2</div>
            <span className="ml-2 text-sm text-gray-600">Isi Detail</span>
          </div>
          <div className="flex-1 h-0.5 bg-gray-300"></div>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gray-300 text-gray-600 rounded-full flex items-center justify-center text-sm font-medium">3</div>
            <span className="ml-2 text-sm text-gray-600">Kirim</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Category Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Tag className="h-5 w-5 mr-2" />
                Kategori Tiket
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {supportCategories.map((category) => (
                  <div
                    key={category.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all ${
                      formData.category === category.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleInputChange('category', category.id)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        {category.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{category.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedCategory && selectedCategory.subcategories && (
                <div className="mt-4">
                  <Label htmlFor="subcategory">Subkategori</Label>
                  <select
                    id="subcategory"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
            </CardContent>
          </Card>

          {/* Ticket Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Detail Tiket
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="subject">Subjek Tiket *</Label>
                <Input
                  id="subject"
                  type="text"
                  placeholder="Contoh: Internet sangat lambat sejak 2 hari lalu"
                  value={formData.subject}
                  onChange={(e) => handleInputChange('subject', e.target.value)}
                  className="mt-1"
                  minLength={10}
                  maxLength={100}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Minimal 10 karakter, maksimal 100 karakter
                </p>
              </div>

              <div>
                <Label htmlFor="description">Deskripsi Masalah *</Label>
                <Textarea
                  id="description"
                  rows={6}
                  placeholder="Jelaskan masalah yang Anda alami dengan detail. Sertakan informasi seperti kapan masalah terjadi, apa yang sudah Anda coba lakukan, dll."
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  className="mt-1"
                  minLength={20}
                />
                <p className="text-sm text-gray-500 mt-1">
                  Minimal 20 karakter. Semakin detail, semakin mudah tim kami membantu.
                </p>
              </div>

              <div>
                <Label htmlFor="priority">Tingkat Prioritas</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  {priorityLevels.map((priority) => (
                    <div
                      key={priority.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-all ${
                        formData.priority === priority.id
                          ? `border-${priority.color}-500 bg-${priority.color}-50`
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleInputChange('priority', priority.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 bg-${priority.color}-500 rounded-full`}></div>
                        <span className="font-medium">{priority.name}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{priority.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attachments */}
              <div>
                <Label>Lampiran (opsional)</Label>
                <div className="mt-2">
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
                    className="w-full border-dashed"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Tambah Lampiran
                  </Button>
                  <p className="text-sm text-gray-500 mt-1">
                    Maksimal 5 file, masing-masing maksimal 5MB. Format: JPG, PNG, PDF, DOC, TXT
                  </p>
                </div>

                {attachments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          {attachment.preview ? (
                            <img
                              src={attachment.preview}
                              alt={attachment.name}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                              <FileText className="h-5 w-5 text-gray-500" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium">{attachment.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(attachment.size)}</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Help Information */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="ml-2">
              <strong>Tip:</strong> Berikan informasi yang detail dan lengkap agar tim kami dapat membantu Anda lebih cepat. Sertakan screenshot jika perlu.
            </AlertDescription>
          </Alert>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Mengirim...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Kirim Tiket
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}