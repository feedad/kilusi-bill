'use client'

import React, { useState, useEffect } from 'react'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { customerApi } from '@/lib/api-clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  User,
  Mail,
  Phone,
  MapPin,
  Camera,
  Save,
  CheckCircle,
  Globe,
  Palette,
} from 'lucide-react'
import { toast } from 'react-hot-toast'
import CustomerAuth from '@/lib/customer-auth'

interface CustomerProfile {
  id: number
  name: string
  email: string
  phone: string
  address: string
  customer_id: string
  avatar?: string
  package_name: string
  package_price: number
  installation_date: string
  status: 'active' | 'inactive' | 'suspended'
  preferences: {
    language: 'id' | 'en'
    timezone: string
    currency: string
    notifications: {
      email: boolean
      sms: boolean
      billing: boolean
      maintenance: boolean
      marketing: boolean
    }
  }
}

export default function CustomerProfilePage() {
  const { customer, refreshCustomerData } = useCustomerAuth()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'personal' | 'notifications'>('personal')
  const [editingAvatar, setEditingAvatar] = useState(false)

  useEffect(() => {
    if (customer) {
      fetchProfileData()
    }
  }, [customer])

  const fetchProfileData = async () => {
    try {
      setLoading(true)

      if (!customer) {
        throw new Error('Customer data not available')
      }

      console.log('🔍 Profile: Fetching REAL data from database via API')

      // GET REAL DATA FROM DATABASE via API
      const response = await customerApi.get('/api/v1/customer-auth-nextjs/get-customer-data')

      console.log('🔍 Profile: API Response status:', response.status)

      if (response.data.success === false) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`)
      }

      console.log('🔍 Profile: REAL API Response:', response.data)

      if (response.data.success && response.data.data && response.data.data.customer) {
        const realCustomerData = response.data.data.customer

        console.log('🔍 Profile: REAL customer data from DATABASE:', realCustomerData)
        console.log('🔍 Profile: REAL customer_id:', realCustomerData.customer_id)
        console.log('🔍 Profile: REAL package_name:', realCustomerData.package_name)
        console.log('🔍 Profile: REAL isolir_date:', realCustomerData.isolir_date)

        // Transform REAL database data to profile format
        const profileData: CustomerProfile = {
          id: realCustomerData.id,
          name: realCustomerData.name,
          email: realCustomerData.email || '',
          phone: realCustomerData.phone || '',
          address: realCustomerData.address || '',
          customer_id: realCustomerData.customer_id || '',
          avatar: '',
          package_name: realCustomerData.package_name || 'Paket Internet',
          package_price: parseFloat(realCustomerData.package_price) || 0,
          installation_date: realCustomerData.created_at,
          status: realCustomerData.status || 'active',
          preferences: {
            language: 'id',
            timezone: 'Asia/Jakarta',
            currency: 'IDR',
            notifications: {
              email: true,
              sms: true,
              billing: true,
              maintenance: true,
              marketing: false
            }
          }
        }

        console.log('🔍 Profile: REAL profile data from DATABASE:', profileData)
        setProfile(profileData)
        console.log('🔍 Profile: REAL data set successfully!')
      } else {
        throw new Error(response.data.message || 'Failed to get customer data from database')
      }

    } catch (error: any) {
      console.error('🔥 Error fetching REAL customer data from DATABASE:', error)
      toast.error('❌ Gagal mengambil data dari database: ' + error.message)

      // Fallback: Show error state, don't use fake data
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!profile) return

    setSaving(true)
    try {
      // Prepare data for API
      const updateData = {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address
      }

      // Update customer data via customer profile endpoint
      const response = await CustomerAuth.apiRequest(`/customer-auth-nextjs/update-profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (response.success) {
        toast.success('✅ Profil berhasil diperbarui!')
        await refreshCustomerData()
      } else {
        throw new Error(response.message || 'Failed to update profile')
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error(`❌ Gagal memperbarui profil: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error('❌ Ukuran file terlalu besar. Maksimal 2MB.')
        return
      }

      // TODO: Implement avatar upload API
      setProfile(prev => prev ? { ...prev, avatar: URL.createObjectURL(file) } : null)
      setEditingAvatar(false)
      toast.success('✅ Avatar berhasil diperbarui!')
    }
  }

  const handleInputChange = (field: string, value: any) => {
    if (!profile) return

    const keys = field.split('.')
    const newProfile = { ...profile }
    let current: any = newProfile

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]]
    }

    current[keys[keys.length - 1]] = value
    setProfile(newProfile)
  }

  const handleSavePreferences = async () => {
    if (!profile) return

    setSaving(true)
    try {
      // TODO: Implement preferences API
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success('✅ Preferensi berhasil diperbarui!')
    } catch (error) {
      toast.error('❌ Gagal memperbarui preferensi')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Memuat data profil...</p>
        </div>
      </div>
    )
  }

  console.log('🔍 Profile: Rendering with profile state:', profile)

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <User className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Profil tidak ditemukan</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Profil Saya</h1>
          <p className="text-gray-600 dark:text-gray-300">Kelola informasi pribadi dan preferensi akun Anda</p>
        </div>

        {/* Profile Summary Card */}
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-100 dark:border-blue-800">
          <CardContent className="pt-6">
            {/* Mobile Layout */}
            <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-6">
              {/* Avatar Section - Mobile Friendly */}
              <div className="relative mx-auto sm:mx-0">
                {profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-2xl sm:text-3xl font-bold">
                      {profile.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                <Button
                  size="sm"
                  className="absolute bottom-0 right-0 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 shadow-lg"
                  onClick={() => setEditingAvatar(true)}
                >
                  <Camera className="h-4 w-4" />
                </Button>

                {editingAvatar && (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                    id="avatar-upload"
                  />
                )}
                {editingAvatar && (
                  <label htmlFor="avatar-upload" className="absolute inset-0 cursor-pointer"></label>
                )}
              </div>

              {/* Info Section - Mobile Responsive */}
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{profile.name}</h2>
                <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base break-words">{profile.email}</p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mt-2 space-y-1 sm:space-y-0">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{profile.phone}</span>
                  <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">•</span>
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {profile.package_name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                      }).format(profile.package_price)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status Badge - Mobile Friendly */}
              <div className="flex justify-center sm:justify-end">
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  profile.status === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                }`}>
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {profile.status === 'active' ? 'Aktif' : 'Tidak Aktif'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation Tabs - Mobile Responsive */}
        <div className="flex space-x-1 mb-8 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-full sm:w-fit">
          {[
            { id: 'personal', label: 'Info Pribadi', icon: <User className="h-4 w-4" /> },
            { id: 'notifications', label: 'Notifikasi', icon: <Palette className="h-4 w-4" /> }
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'ghost'}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 sm:flex-initial flex items-center justify-center sm:justify-start space-x-2 ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
            >
              {tab.icon}
              <span className="text-sm sm:text-base">{tab.label}</span>
            </Button>
          ))}
        </div>

        {/* Personal Information */}
        {activeTab === 'personal' && (
          <Card>
            <CardHeader>
              <CardTitle>Informasi Pribadi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div>
                    <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">Nama Lengkap</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email" className="text-gray-700 dark:text-gray-300">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone" className="text-gray-700 dark:text-gray-300">Nomor Telepon</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <Label htmlFor="customer_id" className="text-gray-700 dark:text-gray-300">ID Pelanggan</Label>
                    <Input
                      id="customer_id"
                      value={profile.customer_id}
                      placeholder="ID Pelanggan tidak tersedia"
                      disabled
                      className="mt-1 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="address" className="text-gray-700 dark:text-gray-300">Alamat Lengkap</Label>
                <Input
                  id="address"
                  value={profile.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-center sm:justify-end">
                <Button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="w-full sm:w-auto"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Simpan Perubahan
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pengaturan Notifikasi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(profile.preferences.notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium capitalize text-gray-900 dark:text-white">
                        {key === 'billing' && 'Notifikasi Tagihan'}
                        {key === 'maintenance' && 'Pemeliharaan Sistem'}
                        {key === 'marketing' && 'Promosi & Marketing'}
                        {key === 'email' && 'Notifikasi Email'}
                        {key === 'sms' && 'Notifikasi SMS'}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {key === 'billing' && 'Terima pengingat tagihan dan konfirmasi pembayaran'}
                        {key === 'maintenance' && 'Informasi jadwal maintenance dan gangguan layanan'}
                        {key === 'marketing' && 'Penawaran khusus dan informasi produk terbaru'}
                        {key === 'email' && 'Terima notifikasi melalui email'}
                        {key === 'sms' && 'Terima notifikasi melalui SMS'}
                      </p>
                    </div>
                    <Button
                      variant={value ? 'default' : 'outline'}
                      onClick={() => handleInputChange(`preferences.notifications.${key}`, !value)}
                      className={value ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}
                    >
                      {value ? 'Aktif' : 'Nonaktif'}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-center sm:justify-end">
              <Button
                onClick={handleSavePreferences}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {saving ? 'Menyimpan...' : 'Simpan Notifikasi'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}