'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { useBranding } from '@/hooks/useBranding'
import { Button, Input } from '@/components/ui'
import { Server, RefreshCw } from 'lucide-react'
import { LoginFormData } from '@/types'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const { addNotification } = useAppStore()
  const { branding, getLogoUrl, isLogoMode } = useBranding()

  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
    remember: false,
  })
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')

  const [errors, setErrors] = useState<Partial<LoginFormData>>({})
  const [loginError, setLoginError] = useState<string | null>(null)

  // Generate 5-digit captcha
  const generateCaptcha = () => {
    const code = Math.floor(10000 + Math.random() * 90000).toString()
    setCaptchaCode(code)
    setCaptchaInput('')
  }

  useEffect(() => {
    generateCaptcha()
  }, [])

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginFormData> = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username wajib diisi'
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password wajib diisi'
    }

    if (captchaInput !== captchaCode) {
      setLoginError('Kode keamanan salah')
      generateCaptcha()
      return false
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!validateForm()) return false

    setLoginError(null)

    try {
      await login(formData.username, formData.password)

      addNotification({
        type: 'success',
        title: 'Login Berhasil',
        message: 'Selamat datang di Kilusi Bill!',
      })

      const user = useAuthStore.getState().user

      if (user?.role === 'admin' || user?.role === 'administrator' || user?.role === 'superadmin') {
        router.push('/admin/dashboard')
      } else if (user?.role === 'technician') {
        router.push('/admin/technician-dashboard')
      } else {
        router.push('/admin/dashboard')
      }

      return true
    } catch (error: any) {
      let errorMessage = 'Username atau password salah.'

      if (error.response?.status === 401) {
        errorMessage = 'Username atau password salah.'
      } else if (error.response?.status === 429) {
        errorMessage = 'Terlalu banyak percobaan. Coba lagi nanti.'
      } else if (error.response?.status >= 500) {
        errorMessage = 'Server bermasalah. Coba lagi nanti.'
      }

      setLoginError(errorMessage)
      generateCaptcha()
      return false
    }
  }

  const handleInputChange = (field: keyof LoginFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: undefined }))
    if (typeof value === 'string' && value.length > 0) {
      setLoginError(null)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding with Animation */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1C2536] via-[#1C2536] to-[#0f172a] relative overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute inset-0">
          {/* Floating circles */}
          <div className="absolute top-20 left-20 w-32 h-32 bg-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="absolute top-40 right-20 w-24 h-24 bg-primary/10 rounded-full blur-lg animate-bounce" style={{ animationDuration: '3s' }} />
          <div className="absolute bottom-40 left-1/3 w-40 h-40 bg-primary/15 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }} />
          
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-5" 
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '40px 40px'
            }} 
          />
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 lg:px-16">
          {/* Logo Animation */}
          <div className="mb-8">
            {isLogoMode && getLogoUrl() ? (
              <img 
                src={getLogoUrl()!} 
                alt={branding.siteTitle}
                className="h-16 object-contain"
              />
            ) : (
              <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30 animate-pulse">
                <Server className="h-8 w-8 text-white" />
              </div>
            )}
          </div>

          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4">
            Selamat Datang di Dashboard
            <br />
            <span className="text-primary bg-clip-text">{branding.siteTitle || 'Kilusi'}</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-md mb-8">
            Admin dashboard terlengkap untuk billing, pelanggan, dan monitoring jaringan real-time.
          </p>
          
          {/* Feature highlights */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Manajemen Pelanggan</span>
            </div>
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Billing Otomatis</span>
            </div>
            <div className="flex items-center gap-3 text-gray-300">
              <div className="w-2 h-2 bg-primary rounded-full" />
              <span>Monitoring Real-time</span>
            </div>
          </div>
          
          {/* Abstract decorative elements */}
          <div className="absolute bottom-16 right-16 flex gap-3 opacity-60">
            <div className="w-4 h-24 bg-gradient-to-t from-primary to-transparent rounded-full" />
            <div className="w-4 h-32 bg-gradient-to-t from-primary/60 to-transparent rounded-full mt-4" />
            <div className="w-4 h-20 bg-gradient-to-t from-primary/40 to-transparent rounded-full mt-8" />
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary">
              <Server className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Kilusi Bill</span>
          </div>

          {/* Sign In Header */}
          <h2 className="text-2xl font-bold text-foreground mb-2">Sign In</h2>
          <p className="text-muted-foreground mb-8">
            Masuk ke dashboard admin
          </p>

          {/* Error Message */}
          {loginError && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-6">
              {loginError}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Username */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Username</label>
              <Input
                type="text"
                placeholder="Masukkan username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                disabled={isLoading}
                autoComplete="username"
                className="h-12 rounded-lg bg-muted/30 border-0 focus:ring-2 focus:ring-primary/20"
              />
              {errors.username && (
                <p className="text-sm text-destructive">{errors.username}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Lupa Password?
                </Link>
              </div>
              <Input
                type="password"
                placeholder="Masukkan password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                className="h-12 rounded-lg bg-muted/30 border-0 focus:ring-2 focus:ring-primary/20"
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            {/* Captcha - 5 digits */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Kode Keamanan</label>
              <div className="flex items-center gap-2">
                <div className="h-12 px-4 bg-primary/10 rounded-lg flex items-center justify-center min-w-[100px]">
                  <span className="text-xl font-bold font-mono text-primary tracking-wider">
                    {captchaCode}
                  </span>
                </div>
                <Input
                  type="text"
                  placeholder="Masukkan kode"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  className="flex-1 h-12 rounded-lg bg-muted/30 border-0 font-mono text-center"
                  maxLength={5}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={generateCaptcha}
                  className="h-12 w-12 shrink-0"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={formData.remember}
                onChange={(e) => handleInputChange('remember', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              <label htmlFor="remember" className="text-sm text-muted-foreground">
                Ingat saya
              </label>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              className="w-full h-12 rounded-lg text-base font-semibold"
              loading={isLoading}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}