'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Copy, ArrowRight, User, Shield, CheckCircle, Clock, Smartphone, Lock, RefreshCw, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import CustomerAuth from '@/lib/customer-auth'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'

export default function CustomerLoginPage() {
  const router = useRouter()
  const { login } = useCustomerAuth()
  const [isClient, setIsClient] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const [formData, setFormData] = useState({
    phone: '',
    otp: ''
  })
  const [loading, setLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [displayOTP, setDisplayOTP] = useState<string>('')
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Client-side mounting check
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Check if already authenticated
  useEffect(() => {
    if (!isClient) return

    const checkAuth = () => {
      // Check URL for force parameter
      const urlParams = new URLSearchParams(window.location.search)
      const force = urlParams.get('force')

      // If force parameter is present, clear existing session
      if (force === 'true') {
        CustomerAuth.logout()
      }

      // Check if already authenticated (only if not forced)
      if (!force && CustomerAuth.isAuthenticated()) {
        setIsAuthenticated(true)
        // Auto-redirect to portal
        router.push('/customer/portal')
        return
      }
    }

    checkAuth()
  }, [isClient, router])

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await CustomerAuth.requestOTP(formData.phone)

      if (result.success) {
        setOtpSent(true)
        setDisplayOTP(result.data?.otp || '')
        setCountdown(120)
        toast.success('OTP berhasil dikirim!')

        // Start countdown
        const interval = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(interval)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        setError(result.message || 'Gagal mengirim OTP')
        toast.error(result.message || 'Gagal mengirim OTP')
      }
    } catch (err: any) {
      setError('Terjadi kesalahan saat mengirim OTP')
      toast.error('Terjadi kesalahan saat mengirim OTP')
      console.error('Request OTP error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const success = await login(formData.phone, formData.otp)

      if (success) {
        toast.success('Login berhasil!')
        // Redirect to customer portal
        router.push('/customer/portal')
      } else {
        setError('Login gagal')
        toast.error('Login gagal')
      }
    } catch (err: any) {
      setError('Terjadi kesalahan saat login')
      toast.error('Terjadi kesalahan saat login')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const copyOTP = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(displayOTP)
      } else {
        // Fallback for older browsers or insecure contexts
        const textArea = document.createElement('textarea')
        textArea.value = displayOTP
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      toast.success('OTP berhasil disalin!')
    } catch (err) {
      console.error('Failed to copy OTP:', err)
      // Show OTP in alert as last resort
      alert(`OTP Anda: ${displayOTP}`)
    }
  }

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-slate-800 dark:to-blue-900 flex items-center justify-center p-4">
        <div className="text-center text-blue-600">Loading...</div>
      </div>
    )
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-700 mb-2">
              Anda Sudah Login
            </h2>
            <p className="text-green-600 mb-6">
              Mengalihkan ke portal pelanggan...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-slate-800 dark:to-blue-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Shield className="w-12 h-12 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Login Pelanggan
          </CardTitle>
          <p className="text-gray-600">
            Masukkan nomor telepon Anda untuk menerima OTP
          </p>
        </CardHeader>

        <CardContent>
          {/* Phone/OTP Login Form */}
          <form onSubmit={otpSent ? handleLogin : handleRequestOTP} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Nomor Telepon</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="Contoh: 08123456789"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                disabled={loading || otpSent}
                required
              />
            </div>

            {otpSent && (
              <div className="space-y-3">
                <Label htmlFor="otp" className="text-base font-semibold">🔢 Kode OTP</Label>
                <div className="flex gap-2">
                  <Input
                    id="otp"
                    type="text"
                    placeholder="Masukkan 6 digit OTP"
                    value={formData.otp}
                    onChange={(e) => setFormData({ ...formData, otp: e.target.value })}
                    className="flex-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 text-lg text-center font-mono font-bold h-12"
                    disabled={loading}
                    required
                    maxLength={6}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={copyOTP}
                    title="Salin OTP"
                    className="shrink-0 h-12 px-3"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

  
  
                <div className="text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setOtpSent(false)
                      setDisplayOTP('')
                      setCountdown(0)
                      setError(null)
                    }}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Kirim Ulang OTP
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {otpSent ? 'Memproses...' : 'Mengirim...'}
                </>
              ) : (
                <>
                  <Smartphone className="mr-2 h-4 w-4" />
                  {otpSent ? 'Login dengan OTP' : 'Kirim OTP'}
                </>
              )}
            </Button>
          </form>

          {/* Help Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <User className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-semibold mb-1">Informasi OTP:</p>
                <ul className="space-y-1 text-xs">
                  <li>• OTP akan dikirim ke nomor telepon Anda</li>
                  <li>• OTP berlaku selama 2 menit</li>
                  <li>• Anda bisa meminta OTP ulang jika diperlukan</li>
                  <li>• Pastikan nomor telepon Anda aktif</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Back Button */}
          <div className="text-center mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              className="text-sm"
            >
              ← Kembali
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* OTP Modal Popup */}
      {displayOTP && displayOTP.length > 0 && (
        <Dialog open={!!displayOTP} onOpenChange={(open) => !open && setDisplayOTP('')}>
          <DialogContent className="sm:max-w-md mx-4">
            <DialogHeader>
              <DialogTitle className="text-center text-lg font-bold text-blue-700 dark:text-blue-300">
                📱 Kode OTP Anda
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 p-6 rounded-xl border-2 border-blue-200 dark:border-blue-700">
                <div className="flex justify-center mb-4">
                  <div className="flex space-x-3">
                    {displayOTP.split('').map((digit, index) => (
                      <div
                        key={index}
                        className="w-14 h-14 flex items-center justify-center bg-white dark:bg-gray-800 border-2 border-blue-400 dark:border-blue-500 rounded-lg text-2xl font-black text-blue-800 dark:text-blue-200 shadow-lg"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                    🎯 Masukkan kode: <span className="font-mono text-lg tracking-widest">{displayOTP}</span>
                  </p>
                  <div className="flex items-center justify-center text-xs text-gray-600 dark:text-gray-400">
                    <Clock className="h-3 w-3 mr-1" />
                    Berlaku selama: <span className="font-mono font-semibold ml-1">{formatCountdown(countdown)}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={copyOTP}
                  className="flex items-center gap-2 border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300"
                >
                  <Copy className="h-4 w-4" />
                  Salin OTP
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDisplayOTP('')}
                  className="flex items-center gap-2 border-gray-300 dark:border-gray-600"
                >
                  <X className="h-4 w-4" />
                  Tutup
                </Button>
              </div>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                OTP akan muncul otomatis setelah mengirim nomor telepon
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}