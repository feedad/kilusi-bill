'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, Smartphone, RefreshCw, CheckCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import CustomerAuth from '@/lib/customer-auth'
import { useBranding } from '@/hooks/useBranding'

export default function CustomerLoginPage() {
  const router = useRouter()
  const { branding, getLogoUrl, isLogoMode } = useBranding()
  const [isClient, setIsClient] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const [formData, setFormData] = useState({
    phone: '',
    captchaInput: ''
  })

  const [captchaCode, setCaptchaCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Generate new 5-digit code
  const generateCaptcha = () => {
    const code = Math.floor(10000 + Math.random() * 90000).toString()
    setCaptchaCode(code)
    setFormData(prev => ({ ...prev, captchaInput: '' }))
  }

  useEffect(() => {
    setIsClient(true)
    generateCaptcha()
  }, [])

  useEffect(() => {
    if (!isClient) return
    const isAuth = CustomerAuth.isAuthenticated()
    setIsAuthenticated(isAuth)
  }, [isClient])

  // Auto-redirect if authenticated - MUST be before any conditional returns
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        router.push('/customer/portal')
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isAuthenticated, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (formData.captchaInput !== captchaCode) {
      setError('Kode captcha salah')
      setLoading(false)
      generateCaptcha()
      return
    }

    try {
      const result = await CustomerAuth.loginByPhone(formData.phone)

      if (result.valid && result.customer) {
        toast.success('Login berhasil!')
        const storedAuth = CustomerAuth.getStoredAuth()

        if (storedAuth.customer && storedAuth.token) {
          window.dispatchEvent(new CustomEvent('auth:updated', {
            detail: { customer: storedAuth.customer, token: storedAuth.token }
          }))
        }

        router.push('/customer/portal')
      } else {
        setError(result.error || 'Nomor telepon tidak terdaftar')
        generateCaptcha()
      }
    } catch (err: any) {
      setError('Terjadi kesalahan saat login')
      generateCaptcha()
    } finally {
      setLoading(false)
    }
  }

  if (!isClient) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-foreground mb-2">
              Anda Sudah Login
            </h2>
            <p className="text-muted-foreground mb-6">
              Mengalihkan ke portal pelanggan...
            </p>
            <Button onClick={() => router.push('/customer/portal')} className="w-full mb-2">
              Lanjut ke Portal
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                CustomerAuth.logout()
                setIsAuthenticated(false)
              }}
              className="w-full text-muted-foreground"
            >
              Logout & Login Ulang
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          {isLogoMode && getLogoUrl() ? (
            <img
              src={getLogoUrl()!}
              alt={branding.siteTitle}
              className="h-14 mx-auto mb-4 object-contain"
            />
          ) : (
            <div className="mx-auto h-14 w-14 flex items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Shield className="h-7 w-7 text-primary" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-foreground">Login Pelanggan</h1>
          <p className="text-muted-foreground mt-1">
            Masukkan nomor telepon untuk login
          </p>
        </div>

        {/* Login Card */}
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Phone */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nomor Telepon</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="08123456789"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="pl-10 h-12 rounded-lg bg-muted/30 border-0"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Captcha - Inline Simple Style */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Captcha</label>
                <div className="flex items-center gap-2">
                  {/* Captcha Code Display */}
                  <div className="h-12 px-4 bg-primary/10 rounded-lg flex items-center justify-center min-w-[80px]">
                    <span className="text-xl font-bold font-mono text-primary tracking-wider">
                      {captchaCode}
                    </span>
                  </div>

                  {/* Captcha Input */}
                  <Input
                    type="text"
                    placeholder="Masukkan kode"
                    value={formData.captchaInput}
                    onChange={(e) => setFormData({ ...formData, captchaInput: e.target.value })}
                    className="flex-1 h-12 rounded-lg bg-muted/30 border-0 font-mono text-center"
                    maxLength={5}
                    disabled={loading}
                    required
                  />

                  {/* Refresh Button */}
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

              {/* Login Button */}
              <Button
                type="submit"
                className="w-full h-12 rounded-lg text-base font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Login'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Pastikan nomor telepon Anda sudah terdaftar di sistem kami.
        </p>
      </div>
    </div>
  )
}