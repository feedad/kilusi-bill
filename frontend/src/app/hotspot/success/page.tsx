'use client'

import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Wifi, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'

interface VoucherStatus {
  code: string
  status: string
  payment_status: string
  duration_hours: number
  speed_limit: string
  username?: string
  password?: string
}

export default function HotspotSuccessPage() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const [voucherStatus, setVoucherStatus] = useState<VoucherStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    if (code) {
      checkVoucherStatus()
    }
  }, [code])

  const checkVoucherStatus = async () => {
    try {
      const response = await fetch(`/api/v1/hotspot/status/${code}`)
      const result = await response.json()
      if (result.success) {
        setVoucherStatus(result.data)
        // Save to localStorage for retrieval
        if (result.data.username && result.data.password) {
          const saved = JSON.parse(localStorage.getItem('hotspot_vouchers') || '[]')
          const existing = saved.findIndex((v: any) => v.code === result.data.code)
          if (existing >= 0) {
            saved[existing] = { ...saved[existing], ...result.data }
          } else {
            saved.push(result.data)
          }
          localStorage.setItem('hotspot_vouchers', JSON.stringify(saved.slice(-10)))
        }
      }

      if (result.data?.payment_status === 'unpaid' || result.data?.payment_status === 'pending') {
        setTimeout(checkVoucherStatus, 3000)
      }
    } catch (error) {
      console.error('Error checking voucher status:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success('Disalin!')
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          {loading ? (
            <>
              <div className="h-24 w-24 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                <Wifi className="h-12 w-12 text-blue-600 animate-pulse" />
              </div>
              <h1 className="text-2xl font-bold">Memeriksa Status...</h1>
              <p className="text-gray-600">Mohon tunggu sebentar</p>
            </>
          ) : (
            <>
              <CheckCircle className="h-24 w-24 text-green-500 mx-auto" />
              <h1 className="text-2xl font-bold">Pembayaran Berhasil!</h1>

              {voucherStatus?.payment_status === 'paid' ? (
                <div className="space-y-4">
                  <p className="text-green-600 font-medium">
                    ✓ Voucher berhasil diaktivasi
                  </p>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200 space-y-3">
                    <div>
                      <p className="text-xs text-gray-500">Kode Voucher</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-lg font-bold text-green-700">{code}</p>
                        <button onClick={() => copyToClipboard(code || '', 'code')} className="p-1 hover:bg-green-100 rounded">
                          {copiedField === 'code' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                        </button>
                      </div>
                    </div>
                    {voucherStatus.username && (
                      <div>
                        <p className="text-xs text-gray-500">Username</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-mono font-medium">{voucherStatus.username}</p>
                          <button onClick={() => copyToClipboard(voucherStatus.username!, 'user')} className="p-1 hover:bg-green-100 rounded">
                            {copiedField === 'user' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                          </button>
                        </div>
                      </div>
                    )}
                    {voucherStatus.password && (
                      <div>
                        <p className="text-xs text-gray-500">Password</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-mono font-medium">{showPassword ? voucherStatus.password : '••••••••'}</p>
                          <div className="flex gap-1">
                            <button onClick={() => setShowPassword(!showPassword)} className="p-1 hover:bg-green-100 rounded">
                              {showPassword ? <EyeOff className="h-4 w-4 text-gray-500" /> : <Eye className="h-4 w-4 text-gray-500" />}
                            </button>
                            <button onClick={() => copyToClipboard(voucherStatus.password!, 'pass')} className="p-1 hover:bg-green-100 rounded">
                              {copiedField === 'pass' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {voucherStatus.duration_hours && (
                    <p className="text-sm text-gray-600">
                      Durasi: <strong>{voucherStatus.duration_hours} jam</strong>
                    </p>
                  )}

                  {voucherStatus.speed_limit && (
                    <p className="text-sm text-gray-600">
                      Speed: <strong>{voucherStatus.speed_limit}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Sedang memproses pembayaran...
                  </p>
                  <div className="h-24 w-24 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
                    <Wifi className="h-12 w-12 text-blue-600 animate-pulse" />
                  </div>
                  <p className="text-sm text-gray-500">
                    Halaman ini akan otomatis update setelah pembayaran diterima
                  </p>
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 mb-2">Cara menggunakan voucher:</p>
                <ol className="text-left text-sm space-y-1 text-gray-700 bg-gray-50 p-3 rounded-lg">
                  <li>1. Connect ke WiFi "Kilusi-Hotspot"</li>
                  <li>2. Browser akan otomatis ke login page</li>
                  <li>3. Masukkan username & password dari WhatsApp</li>
                  <li>4. Klik Login</li>
                </ol>
              </div>

              <div className="flex gap-2 pt-2">
                <a
                  href="/hotspot"
                  className="flex-1"
                >
                  <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                    Beli Lagi
                  </button>
                </a>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
