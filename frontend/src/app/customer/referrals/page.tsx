'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Gift, Users, TrendingUp, Target, Copy, Share2, Smartphone, Mail, MessageCircle } from 'lucide-react'
import { useCustomerAuth } from '@/contexts/CustomerAuthContext'
import { customerAPI } from '@/lib/customer-api'
import { toast } from 'react-hot-toast'

interface ReferralCode {
  id: number
  code: string
  is_active: boolean
  created_at: string
  expires_at?: string
  usage_count: number
  max_uses: number
}

interface ReferralTransaction {
  id: number
  referrer_id?: number
  referred_id?: number
  referral_code_id?: number
  benefit_type: 'discount' | 'cash' | 'fee_deduction'
  benefit_amount: number
  status: 'pending' | 'applied' | 'expired'
  applied_date?: string
  created_at: string
  referrer_name?: string
  referred_name?: string
  code?: string
}

export default function CustomerReferralsPage() {
  const { customer, isAuthenticated } = useCustomerAuth()
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null)
  const [transactions, setTransactions] = useState<ReferralTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isAuthenticated && customer?.id) {
      fetchReferralData()
    }
  }, [isAuthenticated, customer?.id])

  const fetchReferralData = async () => {
    if (!customer?.id) return

    try {
      setLoading(true)

      // Fetch referral code via customer API
      const codeResponse = await customerAPI.request(`/api/v1/customer-referrals/my-code`)
      if (codeResponse.success && codeResponse.data) {
        setReferralCode(codeResponse.data)
      }

      // Fetch referral history
      const historyResponse = await customerAPI.request(`/api/v1/customer-referrals/history`)
      if (historyResponse.success) {
        setTransactions(historyResponse.data || [])
      }
    } catch (error) {
      console.error('Error fetching referral data:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyReferralCode = () => {
    if (referralCode?.code) {
      navigator.clipboard.writeText(referralCode.code)
      setCopied(true)
      toast.success('Kode referral disalin!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const shareReferral = async (method: string) => {
    if (!referralCode?.code) return

    const referralLink = `https://portal.kilusi.net/register?ref=${referralCode.code}`
    // Updated message reflecting new business logic - customer gets billing discount
    const message = `Dapatkan diskon instalasi Rp 50.000 dengan menggunakan kode referral saya: ${referralCode.code}. Saya akan mendapatkan potongan tagihan Rp 25.000. Daftar di ${referralLink}`

    try {
      switch (method) {
        case 'whatsapp':
          window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
          break
        case 'telegram':
          window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(message)}`, '_blank')
          break
        case 'copy':
          navigator.clipboard.writeText(message)
          toast.success('Link referral disalin!')
          break
      }
    } catch (error) {
      toast.error('Gagal membagikan referral')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'applied':
        return <Badge className="bg-green-100 text-green-800">Berhasil</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
      case 'expired':
        return <Badge className="bg-red-100 text-red-800">Kadaluarsa</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const totalReferrals = transactions.filter(t => t.referrer_id === customer?.id).length
  const successfulReferrals = transactions.filter(t =>
    t.referrer_id === customer?.id && t.status === 'applied'
  ).length
  const totalEarnings = transactions
    .filter(t => t.referrer_id === customer?.id && t.status === 'applied')
    .reduce((sum, t) => sum + t.benefit_amount, 0)

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Program Referral</h1>
        <p className="text-muted-foreground">
          Dapatkan reward dengan mengajak teman-teman Anda bergabung dengan layanan kami
        </p>
      </div>

      {isAuthenticated && customer ? (
        <>
          {/* Referral Code Card */}
          <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-6 w-6" />
                Kode Referral Anda
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              ) : referralCode ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/20 backdrop-blur rounded-lg">
                    <div>
                      <div className="font-mono text-xl font-bold">{referralCode.code}</div>
                      <div className="text-sm opacity-90">
                        Digunakan {referralCode.usage_count} dari {referralCode.max_uses} kali
                      </div>
                      {referralCode.expires_at && (
                        <div className="text-sm opacity-90">
                          Berlaku hingga {new Date(referralCode.expires_at).toLocaleDateString('id-ID')}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={copyReferralCode}
                        className="flex items-center gap-2"
                      >
                        {copied ? 'Tersalin!' : <><Copy className="h-4 w-4" /> Salin</>}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => shareReferral('whatsapp')}
                        className="flex items-center gap-2"
                      >
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary/50"
                      size="sm"
                      onClick={() => shareReferral('telegram')}
                      className="flex items-center justify-center gap-2"
                    >
                      <Share2 className="h-4 w-4" /> Telegram
                    </Button>
                    <Button
                      variant="secondary/50"
                      size="sm"
                      onClick={() => shareReferral('copy')}
                      className="flex items-center justify-center gap-2"
                    >
                      <Copy className="h-4 w-4" /> Salin Link
                    </Button>
                    <Button
                      variant="secondary/50"
                      size="sm"
                      onClick={() => shareReferral('whatsapp')}
                      className="flex items-center justify-center gap-2"
                    >
                      <Smartphone className="h-4 w-4" /> SMS
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Gift className="h-16 w-16 opacity-70 mx-auto mb-4" />
                  <p className="opacity-90">Membuat kode referral Anda...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Referral</p>
                    <p className="text-3xl font-bold text-primary">{totalReferrals}</p>
                  </div>
                  <Users className="h-8 w-8 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Berhasil</p>
                    <p className="text-3xl font-bold text-green-600">{successfulReferrals}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Reward</p>
                    <p className="text-3xl font-bold text-purple-600">
                      Rp {totalEarnings.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <Gift className="h-8 w-8 text-purple-600 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Referral History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5" />
                Riwayat Referral
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : transactions.length > 0 ? (
                <div className="space-y-4">
                  {transactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Kode: {transaction.code}</span>
                            {getStatusBadge(transaction.status)}
                            <Badge variant="outline">
                              {transaction.benefit_type === 'discount' ? '🏷️ Potongan Tagihan' : '💵 Cash Reward'}
                            </Badge>
                          </div>

                          {transaction.referrer_id === customer?.id ? (
                            <div className="bg-green-50 p-3 rounded">
                              <div className="text-sm font-medium text-green-800">
                                🎉 Anda mengajak teman bergabung
                              </div>
                              <div className="text-sm text-green-600">
                                Teman: <span className="font-medium">{transaction.referred_name}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-blue-50 p-3 rounded">
                              <div className="text-sm font-medium text-blue-800">
                                👋 Anda diajak bergabung
                              </div>
                              <div className="text-sm text-blue-600">
                                Diajak oleh: <span className="font-medium">{transaction.referrer_name}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="text-sm text-muted-foreground">
                              {new Date(transaction.created_at).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </div>
                            <div className="font-medium text-green-600">
                              +Rp {transaction.benefit_amount.toLocaleString('id-ID')}
                            </div>
                          </div>

                          {transaction.applied_date && (
                            <div className="text-sm text-green-600">
                              Diterapkan pada {new Date(transaction.applied_date).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Belum ada riwayat referral</p>
                  <p className="text-sm text-muted-foreground">
                    Bagikan kode referral Anda kepada teman-teman untuk memulai
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Cara Kerja Referral</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    Untuk Pengajak (Pelanggan Aktif)
                  </h4>
                  <ol className="space-y-2 text-sm">
                    <li>1. <strong>Bagikan kode referral</strong> Anda kepada teman</li>
                    <li>2. <strong>Teman daftar</strong> menggunakan kode Anda</li>
                    <li>3. <strong>Dapatkan potongan tagihan</strong>: Rp 25.000</li>
                    <li>4. <strong>Reward aktif</strong> setelah teman aktif 1 bulan</li>
                    <li className="text-green-600 font-medium">✅ Khusus pelanggan aktif dengan akses portal</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Untuk Diajak (Teman Anda)
                  </h4>
                  <ol className="space-y-2 text-sm">
                    <li>1. <strong>Masukkan kode referral</strong> saat registrasi</li>
                    <li>2. <strong>Dapatkan diskon</strong>: Rp 50.000 (instalasi)</li>
                    <li>3. <strong>Aktifkan layanan</strong> internet</li>
                    <li>4. <strong>Temannya dapat reward</strong> setelah Anda aktif</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Program Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="text-center">
                <Gift className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">Reward Menarik</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground">
                  Dapatkan potongan tagihan atau cash reward untuk setiap referral berhasil
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">Mudah Digunakan</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground">
                  Cukup bagikan kode referral Anda dan teman tinggal memasukkannya saat registrasi
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-primary" />
                <CardTitle className="text-xl">Tidak Ada Batas</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <p className="text-muted-foreground">
                  Referensikan sebanyak mungkin teman dan kumpulkan reward terus menerus
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Login Required */}
          <Card>
            <CardHeader>
              <CardTitle>Akses Referral Saya</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Gift className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Reward Referral</h3>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-green-700 mb-3">🎉 Untuk Pengajak (Pelanggan Aktif)</h4>
                  <div className="p-4 border-2 border-green-200 rounded-lg bg-green-50 max-w-md mx-auto">
                    <div className="text-2xl font-bold text-green-600">Rp 25.000</div>
                    <div className="text-sm text-green-700">Potongan Tagihan</div>
                    <div className="text-xs text-green-600 mt-1">Hanya untuk pelanggan aktif yang memiliki portal</div>
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-blue-700 mb-3">👋 Untuk Diajak (Yang Direferensikan)</h4>
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                      <div className="text-2xl font-bold text-blue-600">Rp 50.000</div>
                      <div className="text-sm text-blue-700">Diskon Instalasi</div>
                    </div>
                    <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                      <div className="text-2xl font-bold text-blue-600">Rp 25.000</div>
                      <div className="text-sm text-blue-700">Diskon Tagihan 1x</div>
                    </div>
                  </div>
                </div>

                <p className="text-muted-foreground mb-4">
                  Login untuk mulai mendapatkan kode referral Anda
                </p>
                <Button onClick={() => window.location.href = '/customer/login'}>
                  Login Sekarang
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card>
            <CardHeader>
              <CardTitle>Pertanyaan yang Sering Diajukan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Berapa reward yang saya dapatkan?</h4>
                <p className="text-sm text-muted-foreground">
                  Sebagai pelanggan aktif, Anda akan mendapatkan <strong>potongan tagihan Rp 25.000</strong> untuk setiap referral berhasil.
                  Reward otomatis diterapkan ke tagihan bulanan Anda setelah referred customer aktif 1 bulan.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Kapan saya mendapatkan reward?</h4>
                <p className="text-sm text-muted-foreground">
                  Reward akan diberikan setelah pelanggan yang direferensikan aktif selama 1 bulan dan melakukan pembayaran pertama.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Bagaimana dengan non-pelanggan yang mereferensikan?</h4>
                <p className="text-sm text-muted-foreground">
                  Untuk marketer atau non-pelanggan yang mereferensikan customer baru, sistem akan memberikan <strong>cash reward Rp 30.000</strong>.
                  Ini berlaku otomatis berdasarkan status pengaju di sistem.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Ada berapa jenis kode referral?</h4>
                <p className="text-sm text-muted-foreground">
                  Kami menggunakan sistem <strong>hybrid</strong>:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 ml-4 list-disc">
                  <li><strong>Kode Pribadi</strong> - Generate otomatis untuk setiap pelanggan aktif (contoh: REF7X9Y2Z)</li>
                  <li><strong>Kode Marketing</strong> - Kode tetap untuk campaign marketing (contoh: KILUSI2025)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-2">
                  Keduanya memberikan benefit yang sama untuk yang direferensikan!
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Apakah ada batas penggunaan kode referral?</h4>
                <p className="text-sm text-muted-foreground">
                  Setiap kode referral memiliki batas penggunaan dan masa berlaku tertentu. Defaultnya adalah 50 penggunaan dalam 1 tahun.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}