'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gift, Users, TrendingUp, Target } from 'lucide-react'
import ReferralHistory from '@/components/ReferralHistory'

export default function CustomerReferralsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Program Referral</h1>
        <p className="text-muted-foreground">
          Dapatkan reward dengan mengajak teman-teman Anda bergabung dengan layanan kami
        </p>
      </div>

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

      {/* Customer-specific referral content */}
      {/* Note: This would require customer authentication to get the actual customer ID */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Akses Referral Saya</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center py-8">
                <Gift className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Reward Referral</h3>

                <div className="mb-6">
                  <h4 className="text-sm font-medium text-green-700 mb-3">🎉 Untuk Pengajak (Yang Mereferensikan)</h4>
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <div className="p-4 border-2 border-green-200 rounded-lg bg-green-50">
                      <div className="text-2xl font-bold text-green-600">Rp 25.000</div>
                      <div className="text-sm text-green-700">Potongan Tagihan</div>
                    </div>
                    <div className="p-4 border-2 border-green-200 rounded-lg bg-green-50">
                      <div className="text-2xl font-bold text-green-600">Rp 30.000</div>
                      <div className="text-sm text-green-700">Cash Reward</div>
                    </div>
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

                <p className="text-muted-foreground">
                  Login untuk mulai mendapatkan kode referral Anda
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Cara Menggunakan Referral</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Gift className="h-5 w-5" />
                  Untuk Pengajak (Yang Mereferensikan)
                </h4>
                <ol className="space-y-2 text-sm">
                  <li>1. <strong>Dapatkan kode referral</strong> unik Anda</li>
                  <li>2. <strong>Bagikan kode</strong> kepada teman atau kerabat</li>
                  <li>3. <strong>Teman masukkan kode</strong> saat registrasi</li>
                  <li>4. <strong>Anda dapat reward</strong>: Rp 25.000 (potongan) atau Rp 30.000 (cash)</li>
                  <li>5. <strong>Reward diberikan</strong> setelah teman aktif 1 bulan</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Untuk Diajak (Yang Direferensikan)
                </h4>
                <ol className="space-y-2 text-sm">
                  <li>1. <strong>Terima kode referral</strong> dari teman</li>
                  <li>2. <strong>Masukkan kode</strong> saat registrasi</li>
                  <li>3. <strong>Dapatkan diskon</strong>: Rp 50.000 (instalasi) atau Rp 25.000 (tagihan pertama)</li>
                  <li>4. <strong>Nikmati layanan</strong> internet kami</li>
                  <li>5. <strong>Teman Anda dapat reward</strong> setelah Anda aktif</li>
                </ol>
              </div>
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
                Reward fixed sudah ditentukan: <strong>Rp 25.000 untuk potongan tagihan</strong> atau
                <strong> Rp 30.000 untuk cash reward</strong>. Anda bisa memilih salah satu sesuai kebutuhan.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Kapan saya mendapatkan reward?</h4>
              <p className="text-sm text-muted-foreground">
                Reward akan diberikan setelah pelanggan yang direferensikan aktif selama 1 bulan dan melakukan pembayaran pertama.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Apakah ada batas penggunaan kode referral?</h4>
              <p className="text-sm text-muted-foreground">
                Setiap kode referral memiliki batas penggunaan dan masa berlaku tertentu. Defaultnya adalah 50 penggunaan dalam 1 tahun.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Bisakah saya memilih jenis reward?</h4>
              <p className="text-sm text-muted-foreground">
                Ya, Anda bisa memilih antara potongan tagihan bulanan atau cash reward langsung sesuai preferensi Anda.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}