'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, X, Gift, Loader2 } from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface ReferralValidationResult {
  valid: boolean
  referral?: {
    code: string
    referrer_name: string
    referrer_customer_id: string
  }
  reason?: string
}

interface ReferralBenefit {
  success: boolean
  benefitType: 'discount' | 'cash'
  benefitAmount: number
  referrerName: string
}

interface ReferralCodeInputProps {
  value: string
  onChange: (value: string) => void
  onBenefitApplied?: (benefit: ReferralBenefit) => void
  customerId?: string
  disabled?: boolean
}

export default function ReferralCodeInput({
  value,
  onChange,
  onBenefitApplied,
  customerId,
  disabled = false
}: ReferralCodeInputProps) {
  const [isValidating, setIsValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<ReferralValidationResult | null>(null)
  const [showBenefit, setShowBenefit] = useState(false)
  const [applyingReferral, setApplyingReferral] = useState(false)
  const [benefitType, setBenefitType] = useState<'discount' | 'cash'>('discount')

  // Validate referral code when it changes
  useEffect(() => {
    if (value.length >= 6) {
      validateReferralCode()
    } else {
      setValidationResult(null)
    }
  }, [value, customerId])

  const validateReferralCode = async () => {
    if (!value || value.length < 6) return

    setIsValidating(true)
    try {
      const response = await adminApi.get(`/api/v1/referrals/validate/${value}${customerId ? `?customerId=${customerId}` : ''}`)

      if (response.data?.success) {
        setValidationResult(response.data.data)
      }
    } catch (error) {
      console.error('Error validating referral code:', error)
      setValidationResult({ valid: false, reason: 'Kode referral tidak valid' })
    } finally {
      setIsValidating(false)
    }
  }

  const handleApplyReferral = async () => {
    if (!validationResult?.valid || !customerId) return

    setApplyingReferral(true)
    try {
      const response = await adminApi.post('/api/v1/referrals/apply', {
        code: value,
        customerId: customerId,
        benefitType: benefitType
      })

      if (response.data?.success) {
        setShowBenefit(true)
        onBenefitApplied?.(response.data.data)
      }
    } catch (error: any) {
      console.error('Error applying referral:', error)
      alert(error.response?.data?.message || 'Gagal mengaplikasikan referral')
    } finally {
      setApplyingReferral(false)
    }
  }

  const handleClearReferral = () => {
    onChange('')
    setValidationResult(null)
    setShowBenefit(false)
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4" />
          Kode Referral (Opsional)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="referralCode">Masukkan Kode Referral</Label>
          <div className="relative">
            <Input
              id="referralCode"
              placeholder="Contoh: REF123ABC"
              value={value}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              disabled={disabled || isValidating}
              className="pr-10"
            />

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearReferral}
                className="absolute right-1 top-1 h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}

            {isValidating && (
              <div className="absolute right-10 top-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <div className={`p-3 rounded-lg text-sm ${
            validationResult.valid
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {validationResult.valid ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <X className="h-4 w-4 text-red-600" />
              )}
              <span>
                {validationResult.valid
                  ? `✅ Kode valid! Dari: ${validationResult.referral?.referrer_name}`
                  : validationResult.reason
                }
              </span>
            </div>
            {validationResult.valid && (
              <div className="mt-2 text-xs text-green-700">
                💡 Pelanggan baru akan mendapatkan diskon, dan pengajak akan mendapatkan reward
              </div>
            )}
          </div>
        )}

        {/* Benefit Type Selection */}
        {validationResult?.valid && !showBenefit && (
          <div className="space-y-2">
            <Label>Pilih Jenis Benefit</Label>
            <div>
              <div className="text-xs text-muted-foreground mb-2">Reward untuk Pengajak (Yang Mereferensikan):</div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={benefitType === 'discount' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBenefitType('discount')}
                  disabled={applyingReferral}
                  className="h-14 flex flex-col items-center justify-center"
                >
                  <span className="text-xs">🏷️ Potongan Tagihan</span>
                  <span className="font-bold text-sm">Rp 25.000</span>
                  <span className="text-xs opacity-75">Untuk Pengajak</span>
                </Button>
                <Button
                  type="button"
                  variant={benefitType === 'cash' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBenefitType('cash')}
                  disabled={applyingReferral}
                  className="h-14 flex flex-col items-center justify-center"
                >
                  <span className="text-xs">💵 Cash Reward</span>
                  <span className="font-bold text-sm">Rp 30.000</span>
                  <span className="text-xs opacity-75">Untuk Pengajak</span>
                </Button>
              </div>
              <div className="text-xs text-green-600 mt-2 text-center">
                💡 Pelanggan baru (diajak) dapat diskon instalasi/tagihan
              </div>
            </div>
          </div>
        )}

        {/* Apply Button */}
        {validationResult?.valid && !showBenefit && (
          <Button
            type="button"
            onClick={handleApplyReferral}
            disabled={applyingReferral}
            className="w-full"
          >
            {applyingReferral ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Terapkan Referral
          </Button>
        )}

        {/* Success Message */}
        {showBenefit && onBenefitApplied && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span>
                Referral berhasil diterapkan! Referrer akan mendapatkan benefit.
              </span>
            </div>
          </div>
        )}

        {/* Info */}
        {!showBenefit && (
          <p className="text-xs text-muted-foreground">
            Dapatkan keuntungan dari referral yang Anda masukkan. Pilih antara potongan tagihan atau cash reward.
          </p>
        )}
      </CardContent>
    </Card>
  )
}