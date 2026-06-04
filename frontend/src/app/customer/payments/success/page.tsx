'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Home, Receipt, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function PaymentSuccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [paymentDetails, setPaymentDetails] = useState<any>(null)

  useEffect(() => {
    // Check payment status from URL parameters
    const paymentStatus = searchParams.get('status')
    const transactionId = searchParams.get('transaction_id')
    const orderId = searchParams.get('order_id')
    const invoiceNumber = searchParams.get('invoice')

    // Simulate status check - in production, this should call an API to verify
    setTimeout(() => {
      if (paymentStatus === 'paid' || paymentStatus === 'success') {
        setStatus('success')
      } else if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
        setStatus('failed')
      } else {
        // Default to success if coming from Tripay (Tripay doesn't always send status)
        setStatus('success')
      }

      setPaymentDetails({
        transactionId,
        orderId,
        invoiceNumber
      })
    }, 1000)
  }, [searchParams])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Memeriksa status pembayaran...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center text-center">
            {status === 'success' ? (
              <>
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-2xl text-slate-800 dark:text-slate-200">
                  Pembayaran Berhasil!
                </CardTitle>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                  Terima kasih telah melakukan pembayaran
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                  <XCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-2xl text-slate-800 dark:text-slate-200">
                  Pembayaran Gagal
                </CardTitle>
                <p className="text-slate-600 dark:text-slate-400 mt-2">
                  Maaf, pembayaran Anda tidak dapat diproses
                </p>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {paymentDetails && (
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">No. Invoice</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {paymentDetails.invoiceNumber || '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Order ID</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {paymentDetails.orderId || '-'}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-4">
            <Link href="/customer/billing" className="block">
              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                <Home className="w-4 h-4 mr-2" />
                Kembali ke Tagihan
              </Button>
            </Link>

            <Link href="/customer/portal" className="block">
              <Button variant="outline" className="w-full">
                <Receipt className="w-4 h-4 mr-2" />
                Dashboard Pelanggan
              </Button>
            </Link>
          </div>

          {status === 'failed' && (
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200 text-center">
                Jika pembayaran gagal, Anda dapat mencoba lagi atau menggunakan metode pembayaran lain.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
