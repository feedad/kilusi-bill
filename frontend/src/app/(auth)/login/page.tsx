'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { Server, X } from 'lucide-react'
import { LoginFormData } from '@/types'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const { addNotification } = useAppStore()

  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
    remember: false,
  })

  const [errors, setErrors] = useState<Partial<LoginFormData>>({})
  const [loginError, setLoginError] = useState<string | null>(null)

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginFormData> = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault() // Mencegah form submission default behavior
    e.stopPropagation() // Mencegah event bubbling

    if (!validateForm()) return false

    // Clear previous error
    setLoginError(null)

    try {
      // Tambahkan logging untuk debugging
      console.log('Attempting login with:', formData.username)

      await login(formData.username, formData.password)

      addNotification({
        type: 'success',
        title: 'Login Successful',
        message: 'Welcome back to Kilusi Bill!',
      })

      // Redirect based on user role
      const user = useAuthStore.getState().user
      console.log('Login successful, user:', user)

      if (user?.role === 'admin') {
        router.push('/admin/dashboard')
      } else if (user?.role === 'technician') {
        router.push('/technician/dashboard')
      } else {
        router.push('/customer/dashboard')
      }

      return true
    } catch (error: any) {
      // Prevent page reload by ensuring all errors are caught
      console.error('Login error caught:', error)

      // Set specific error message
      let errorMessage = 'Username atau password salah. Silakan coba lagi.'

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.status === 401) {
        errorMessage = 'Username atau password salah. Silakan periksa kembali.'
      } else if (error.response?.status === 429) {
        errorMessage = 'Terlalu banyak percobaan login. Silakan coba lagi nanti.'
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server sedang bermasalah. Silakan coba lagi nanti.'
      } else if (error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error')) {
        errorMessage = 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.'
      } else if (error.name === 'TypeError' && error.message?.includes('fetch')) {
        errorMessage = 'Gagal terhubung ke server. Periksa koneksi internet.'
      } else if (error.message) {
        errorMessage = error.message
      }

      // Set error state dan mencegah form refresh
      setLoginError(errorMessage)

      // Return false untuk mencegah form submission default
      return false
    }
  }

  const handleInputChange = (field: keyof LoginFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear errors when user starts typing
    setErrors(prev => ({ ...prev, [field]: undefined }))

    // Clear login error only when user actually types something (not for checkbox)
    if (typeof value === 'string' && value.length > 0) {
      setLoginError(null)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary-600">
            <Server className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link href="/register" className="font-medium text-primary-600 hover:text-primary-500">
              register for a new account
            </Link>
          </p>
        </div>

        {/* Login Form */}
        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Error Alert - More prominent and persistent */}
              {loginError && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4 shadow-lg animate-pulse hover:shadow-xl transition-shadow duration-200">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-base font-bold text-red-800">
                        ⚠️ Login Gagal
                      </h3>
                      <div className="mt-1 text-sm text-red-700">
                        {loginError}
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-red-600">
                          💡 <strong>Tips:</strong> Periksa kembali username dan password Anda, atau gunakan demo credentials di bawah.
                        </p>
                      </div>
                    </div>
                    <div className="ml-4 pl-4 border-l border-red-200">
                      <button
                        type="button"
                        onClick={() => setLoginError(null)}
                        className="inline-flex text-red-400 hover:text-red-600 focus:outline-none transition-colors"
                        title="Tutup pesan error"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <Input
                id="username"
                type="text"
                label="Username"
                placeholder="Enter your username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                error={errors.username}
                disabled={isLoading}
                autoComplete="username"
                required
              />

              <Input
                id="password"
                type="password"
                label="Password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                error={errors.password}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={formData.remember}
                    onChange={(e) => handleInputChange('remember', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <Link href="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500">
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            {/* Demo credentials */}
            <div className="mt-6 border-t pt-6">
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-2">💡 Credential Demo:</p>
                <div className="space-y-1 text-xs">
                  <div className="bg-gray-50 p-2 rounded">
                    <p><strong>Admin:</strong> admin / admin123</p>
                    <p className="text-gray-500">Akses: Dashboard, Pelanggan, Billing, dll.</p>
                  </div>
                  <div className="bg-blue-50 p-2 rounded">
                    <p><strong>Technician:</strong> tech / password</p>
                    <p className="text-blue-500">Akses: Dashboard Teknisi, ODP, Realtime</p>
                  </div>
                  <div className="bg-green-50 p-2 rounded">
                    <p><strong>Customer:</strong> customer / password</p>
                    <p className="text-green-500">Akses: Portal pelanggan</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 italic">
                  *Gunakan credential ini untuk testing. Ganti password di production!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}