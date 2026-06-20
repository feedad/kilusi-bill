'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wifi, Clock, Zap, CheckCircle, QrCode, Loader2 } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface HotspotPackage {
  id: number
  name: string
  description: string
  price: number
  duration_hours: number
  speed_limit: string
}

export default function HotspotLandingPage() {
  const [packages, setPackages] = useState<HotspotPackage[]>([])
  const [selectedPackage, setSelectedPackage] = useState<HotspotPackage | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)

  // Form state
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')

  // Payment state
  const [showPayment, setShowPayment] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success'>('pending')
  const [paymentAmount, setPaymentAmount] = useState(0)

  // Cek Voucher state
  const [checkCode, setCheckCode] = useState('')
  const [checkingVoucher, setCheckingVoucher] = useState(false)
  const [voucherInfo, setVoucherInfo] = useState<any>(null)
  const [checkError, setCheckError] = useState('')
  const [showCheckPass, setShowCheckPass] = useState(false)

  useEffect(() => {
    fetchPackages()
  }, [])

  const fetchPackages = async () => {
    try {
      const response = await fetch('/api/v1/hotspot/packages')
      const result = await response.json()
      if (result.success) {
        setPackages(result.data)
      }
    } catch (error) {
      toast.error('Gagal memuat paket hotspot')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    if (!selectedPackage || !customerName || !customerPhone) {
      toast.error('Mohon lengkapi data')
      return
    }

    setPurchasing(true)
    try {
      const response = await fetch('/api/v1/hotspot/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: selectedPackage.id,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail
        })
      })

      const result = await response.json()
      if (result.success) {
        setVoucherCode(result.data.voucher_code)
        setQrCodeUrl(result.data.payment_url)
        setPaymentAmount(result.data.amount)
        setShowPayment(true)

        // Start polling for payment status
        pollPaymentStatus(result.data.voucher_code)
      } else {
        toast.error(result.message || 'Gagal membuat pesanan')
      }
    } catch (error) {
      toast.error('Terjadi kesalahan')
    } finally {
      setPurchasing(false)
    }
  }

  const pollPaymentStatus = async (code: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/hotspot/status/${code}`)
        const result = await response.json()

        if (result.data?.payment_status === 'paid') {
          setPaymentStatus('success')
          clearInterval(interval)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 3000) // Poll every 3 seconds

    // Stop after 5 minutes
    setTimeout(() => clearInterval(interval), 300000)
  }

  const resetForm = () => {
    setShowPayment(false)
    setSelectedPackage(null)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerEmail('')
    setVoucherCode('')
    setPaymentStatus('pending')
    setQrCodeUrl('')
    setPaymentAmount(0)
  }

  const handleCheckVoucher = async () => {
    if (!checkCode) return
    setCheckingVoucher(true)
    setCheckError('')
    setVoucherInfo(null)
    try {
      const response = await fetch(`/api/v1/hotspot/status/${checkCode}`)
      const result = await response.json()
      if (result.success) {
        setVoucherInfo(result.data)
      } else {
        setCheckError(result.message || 'Voucher tidak ditemukan')
      }
    } catch (error) {
      setCheckError('Gagal memeriksa voucher')
    } finally {
      setCheckingVoucher(false)
    }
  }

  if (showPayment) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">
                {paymentStatus === 'pending' ? 'Scan QRIS untuk Bayar' : 'Pembayaran Berhasil!'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {paymentStatus === 'pending' ? (
                <>
                  <div className="text-center">
                    <QrCode className="h-48 w-48 mx-auto mb-4 text-blue-600" />
                    {qrCodeUrl && (
                      <img
                        src={qrCodeUrl}
                        alt="QRIS"
                        className="mx-auto max-w-[300px]"
                      />
                    )}
                    <p className="text-sm text-gray-600 mt-4">
                      Scan QR code di atas dengan e-wallet atau mobile banking Anda
                    </p>
                    <p className="text-lg font-semibold mt-2 text-blue-600">
                      Rp {paymentAmount.toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="text-center text-sm text-gray-600 bg-blue-50 p-4 rounded-lg">
                    <p className="font-medium mb-1">Menunggu pembayaran...</p>
                    <p className="text-xs">Voucher akan dikirim via WhatsApp setelah pembayaran</p>
                  </div>

                  <Button
                    onClick={resetForm}
                    variant="outline"
                    className="w-full"
                  >
                    Batal
                  </Button>
                </>
              ) : (
                <div className="text-center">
                  <CheckCircle className="h-24 w-24 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Pembayaran Berhasil!</h3>
                  <p className="text-gray-600 mb-4">
                    Voucher hotspot telah dikirim ke WhatsApp Anda
                  </p>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <p className="text-sm">Kode Voucher: <strong className="text-green-700">{voucherCode}</strong></p>
                  </div>
                  <Button
                    onClick={resetForm}
                    className="mt-4 w-full"
                  >
                    Beli Lagi
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Wifi className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Hotspot Kilusi
          </h1>
          <p className="text-xl text-gray-600">
            Internet cepat, mudah, terjangkau
          </p>
          <p className="text-sm text-gray-500 mt-2">
            QRIS Only - Scan dengan GoPay, OVO, Dana, ShopeePay, atau Mobile Banking
          </p>
        </div>

        {/* Package Selection */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">Pilih Paket</h2>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-gray-600">Memuat paket...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {packages.map((pkg) => (
                <Card
                  key={pkg.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedPackage?.id === pkg.id
                      ? 'ring-2 ring-blue-600 bg-blue-50 shadow-lg'
                      : ''
                  }`}
                  onClick={() => setSelectedPackage(pkg)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-center">{pkg.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-center space-y-2">
                    <div className="text-2xl font-bold text-blue-600">
                      Rp {pkg.price.toLocaleString('id-ID')}
                    </div>
                    <div className="flex items-center justify-center text-sm text-gray-600">
                      <Clock className="h-4 w-4 mr-1" />
                      {pkg.duration_hours} jam
                    </div>
                    <div className="flex items-center justify-center text-sm text-gray-600">
                      <Zap className="h-4 w-4 mr-1" />
                      {pkg.speed_limit || 'As paket'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Customer Form */}
        {selectedPackage && (
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>Detail Pemesanan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm"><strong>Paket:</strong> {selectedPackage.name}</p>
                <p className="text-lg font-bold text-blue-600">
                  Rp {selectedPackage.price.toLocaleString('id-ID')}
                </p>
              </div>

              <div>
                <Label htmlFor="name">Nama Lengkap</Label>
                <Input
                  id="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Masukkan nama Anda"
                  disabled={purchasing}
                />
              </div>

              <div>
                <Label htmlFor="phone">Nomor WhatsApp</Label>
                <Input
                  id="phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  disabled={purchasing}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Voucher akan dikirim ke nomor ini
                </p>
              </div>

              <div>
                <Label htmlFor="email">Email (Opsional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="email@example.com"
                  disabled={purchasing}
                />
              </div>

              <Button
                onClick={handlePurchase}
                disabled={purchasing || !customerName || !customerPhone}
                className="w-full"
                size="lg"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  `Bayar Rp ${selectedPackage.price.toLocaleString('id-ID')}`
                )}
              </Button>

                <p className="text-xs text-center text-gray-500">
                <strong>QRIS Only</strong> - Scan dengan GoPay, OVO, Dana, ShopeePay, atau Mobile Banking
              </p>
            </CardContent>
          </Card>
        )}

        {/* Cek Voucher */}
        <div className="mt-12 max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cek / Lihat Voucher</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                type="text"
                value={checkCode}
                onChange={(e) => setCheckCode(e.target.value)}
                placeholder="Masukkan kode voucher"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <Button
                onClick={handleCheckVoucher}
                disabled={checkingVoucher || !checkCode}
                className="w-full"
                variant="outline"
              >
                {checkingVoucher ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Memeriksa...</>
                ) : (
                  'Cek Voucher'
                )}
              </Button>
              {voucherInfo && (
                <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
                  <p><strong>Status:</strong>{' '}
                    <span className={voucherInfo.status === 'active' ? 'text-green-600' : 'text-gray-500'}>
                      {voucherInfo.status === 'active' ? 'Aktif' : voucherInfo.status}
                    </span>
                  </p>
                  {voucherInfo.status === 'active' && (
                    <>
                      {voucherInfo.username && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Username:</span>
                          <span className="font-mono font-medium">{voucherInfo.username}</span>
                        </div>
                      )}
                      {voucherInfo.password && (
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Password:</span>
                          <span className="font-mono font-medium">{showCheckPass ? voucherInfo.password : '••••••••'}</span>
                          <button onClick={() => setShowCheckPass(!showCheckPass)} className="text-blue-600 text-xs">
                            {showCheckPass ? 'Sembunyikan' : 'Lihat'}
                          </button>
                        </div>
                      )}
                      {voucherInfo.expires_at && (
                        <p className="text-xs text-gray-500">Berlaku hingga: {new Date(voucherInfo.expires_at).toLocaleString('id-ID')}</p>
                      )}
                    </>
                  )}
                </div>
              )}
              {checkError && <p className="text-xs text-red-500">{checkError}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
