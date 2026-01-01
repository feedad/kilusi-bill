'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Gift, Users, TrendingUp, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { adminApi } from '@/lib/api-clients'

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

interface ReferralCode {
  id: number
  code: string
  is_active: boolean
  created_at: string
  expires_at?: string
  usage_count: number
  max_uses: number
}

interface ReferralHistoryProps {
  customerId: string
}

export default function ReferralHistory({ customerId }: ReferralHistoryProps) {
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null)
  const [transactions, setTransactions] = useState<ReferralTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchReferralData()
  }, [customerId])

  const fetchReferralData = async () => {
    try {
      setLoading(true)

      // Fetch referral code
      const codeResponse = await adminApi.get(`/api/v1/referrals/my-code?customerId=${customerId}`)
      if (codeResponse.data?.success && codeResponse.data?.data) {
        setReferralCode(codeResponse.data.data)
      }

      // Fetch referral history
      const historyResponse = await adminApi.get(`/api/v1/referrals/history?customerId=${customerId}`)
      if (historyResponse.data?.success) {
        setTransactions(historyResponse.data.data)
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
      setTimeout(() => setCopied(false), 2000)
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

  const getBenefitTypeBadge = (type: string) => {
    switch (type) {
      case 'discount':
        return <Badge variant="outline">🏷️ Diskon</Badge>
      case 'cash':
        return <Badge variant="outline">💵 Cash</Badge>
      case 'fee_deduction':
        return <Badge variant="outline">📉 Potongan Biaya</Badge>
      default:
        return <Badge>{type}</Badge>
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Referral Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Kode Referral Anda
          </CardTitle>
        </CardHeader>
        <CardContent>
          {referralCode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <div className="font-mono text-lg font-bold">{referralCode.code}</div>
                  <div className="text-sm text-muted-foreground">
                    Digunakan {referralCode.usage_count} dari {referralCode.max_uses} kali
                  </div>
                  {referralCode.expires_at && (
                    <div className="text-sm text-muted-foreground">
                      Berlaku hingga {new Date(referralCode.expires_at).toLocaleDateString('id-ID')}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyReferralCode}
                  className="flex items-center gap-2"
                >
                  {copied ? 'Tersalin!' : <><Copy className="h-4 w-4" /> Salin</>}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                Bagikan kode ini kepada teman-teman Anda untuk mendapatkan reward!
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Belum ada kode referral</p>
              <p className="text-sm text-muted-foreground">
                Kode referral akan otomatis dibuat untuk Anda
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Referral</p>
                <p className="text-2xl font-bold">
                  {transactions.filter(t => t.referrer_id && t.referrer_id === parseInt(customerId)).length}
                </p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Benefit</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(transactions.filter(t => t.status === 'applied' && t.referrer_id === parseInt(customerId)).reduce((sum, t) => sum + t.benefit_amount, 0))}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="text-lg font-bold">
                  {referralCode?.is_active ? 'Aktif' : 'Non-aktif'}
                </p>
              </div>
              <Gift className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Riwayat Referral
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Kode: {transaction.code}</span>
                        {getBenefitTypeBadge(transaction.benefit_type)}
                        {getStatusBadge(transaction.status)}
                      </div>

                      {transaction.referrer_id === parseInt(customerId) ? (
                        <div className="bg-green-50 p-2 rounded">
                          <div className="text-sm font-medium text-green-800">
                            🎉 Anda mengajak teman bergabung
                          </div>
                          <div className="text-sm text-green-600">
                            Teman: <span className="font-medium">{transaction.referred_name}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-blue-50 p-2 rounded">
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
                          {new Date(transaction.created_at).toLocaleDateString('id-ID')}
                        </div>
                        <div className="font-medium text-green-600">
                          +{formatCurrency(transaction.benefit_amount)}
                        </div>
                      </div>

                      {transaction.applied_date && (
                        <div className="text-sm text-green-600">
                          Diterapkan pada {new Date(transaction.applied_date).toLocaleDateString('id-ID')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Belum ada riwayat referral</p>
              <p className="text-sm text-muted-foreground">
                Ajak teman-teman Anda untuk menggunakan layanan kami
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How it Works */}
      <Card>
        <CardHeader>
          <CardTitle>Cara Kerja Referral</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">1</div>
              <div>Bagikan kode referral Anda kepada teman atau keluarga</div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">2</div>
              <div>Masukkan kode referral saat registrasi pelanggan baru</div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">3</div>
              <div>Pilih jenis benefit: potongan tagihan atau cash reward</div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">4</div>
              <div>Nikmati benefit setelah referral berhasil diverifikasi</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}