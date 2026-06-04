'use client'

import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Wifi } from 'lucide-react'
import { useEffect, useState } from 'react'

interface VoucherStatus {
  code: string
  status: string
  payment_status: string
  duration_hours: number
  speed_limit: string
}

export default function HotspotSuccessPage() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const [voucherStatus, setVoucherStatus] = useState<VoucherStatus | null>(null)
  const [loading, setLoading] = useState(true)

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
      }

      // If still pending, poll again
      if (result.data?.payment_status === 'unpaid' || result.data?.payment_status === 'pending') {
        setTimeout(checkVoucherStatus, 3000)
      }
    } catch (error) {
      console.error('Error checking voucher status:', error)
    } finally {
      setLoading(false)
    }
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
                  <p className="text-gray-600">
                    Voucher hotspot telah dikirim ke WhatsApp Anda
                  </p>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-sm text-gray-700">Kode Voucher:</p>
                    <p className="text-2xl font-bold text-green-700 mt-1">{code}</p>
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
