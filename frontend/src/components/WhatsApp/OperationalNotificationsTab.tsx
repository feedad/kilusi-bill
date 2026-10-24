'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { adminApi } from '@/lib/api-clients'
import {
  Activity,
  Bell,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  Server,
  Radio,
  Wrench,
  Users,
  Shield,
  FileSpreadsheet,
  Save,
  HelpCircle,
  MessageSquare
} from 'lucide-react'

interface OperationalSettings {
  notif_ticket_new_enabled: boolean
  notif_ticket_resolved_enabled: boolean
  notif_installation_new_enabled: boolean
  notif_installation_completed_enabled: boolean
  notif_daily_recap_enabled: boolean
  daily_recap_time: string
  nas_monitoring_enabled: boolean
  olt_monitoring_enabled: boolean
  admin_phone_number: string
}

interface AdminUser {
  id: number
  username: string
  name: string
  email: string
  phone: string
  role: string
}

interface Mitra {
  id: string
  name: string
  phone: string
  email: string
  address: string
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    if ('response' in err && err.response && typeof err.response === 'object') {
      const resp = err.response
      if ('data' in resp && resp.data && typeof resp.data === 'object') {
        const data = resp.data
        if ('message' in data && typeof data.message === 'string') {
          return data.message
        }
      }
    }
  }
  if (err instanceof Error) return err.message
  return String(err)
}

interface OperationalNotificationsTabProps {
  onSwitchToTemplates?: () => void
}

export default function OperationalNotificationsTab({ onSwitchToTemplates }: OperationalNotificationsTabProps = {}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingRecap, setTestingRecap] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [settings, setSettings] = useState<OperationalSettings>({
    notif_ticket_new_enabled: true,
    notif_ticket_resolved_enabled: true,
    notif_installation_new_enabled: true,
    notif_installation_completed_enabled: true,
    notif_daily_recap_enabled: true,
    daily_recap_time: '07:00',
    nas_monitoring_enabled: true,
    olt_monitoring_enabled: true,
    admin_phone_number: ''
  })

  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [mitras, setMitras] = useState<Mitra[]>([])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const res = await adminApi.get('/api/v1/whatsapp/operational-settings')
      if (res.data.success && res.data.data) {
        setSettings(res.data.data.settings)
        setAdmins(res.data.data.admins || [])
        setMitras(res.data.data.mitras || [])
      }
    } catch (err: unknown) {
      console.error('Failed to load operational settings:', err)
      setMessage({
        type: 'error',
        text: 'Gagal memuat pengaturan operasional: ' + getErrorMessage(err)
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)
      const res = await adminApi.put('/api/v1/whatsapp/operational-settings', settings)
      if (res.data.success) {
        setMessage({
          type: 'success',
          text: res.data.message || 'Pengaturan operasional berhasil disimpan'
        })
      }
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: 'Gagal menyimpan pengaturan: ' + getErrorMessage(err)
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestDailyRecap = async () => {
    try {
      setTestingRecap(true)
      setMessage(null)
      const res = await adminApi.post('/api/v1/whatsapp/test-daily-recap')
      if (res.data.success) {
        const d = res.data.data
        setMessage({
          type: 'success',
          text: `Rekap berhasil diuji! Tanggal: ${d?.date || 'Kemarin'}, Total: ${d?.total_transactions || 0} transaksi (Rp ${(d?.total_amount || 0).toLocaleString('id-ID')}). Status kirim: ${d?.sent ? 'Terkirim via WhatsApp' : 'Dilewati/Dimatikan'}`
        })
      } else {
        setMessage({
          type: 'error',
          text: res.data.message || 'Gagal menjalankan rekap harian'
        })
      }
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: 'Gagal menjalankan uji coba rekap: ' + getErrorMessage(err)
      })
    } finally {
      setTestingRecap(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mr-3" />
          <span className="text-muted-foreground">Memuat pengaturan notifikasi operasional...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={message.type === 'success' ? 'bg-green-50 border-green-200 text-green-900 dark:bg-green-950 dark:border-green-800 dark:text-green-100' : ''}>
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <AlertDescription className="ml-2 font-medium">{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/40 p-4 rounded-lg border">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Notifikasi Operasional WhatsApp
          </h3>
          <p className="text-sm text-muted-foreground">
            Kirimkan pembaruan real-time ke Admin dan Mitra saat tiket dibuat, instalasi selesai, atau perangkat down.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestDailyRecap}
            disabled={testingRecap}
            className="flex items-center gap-1.5"
          >
            {testingRecap ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            )}
            Uji Rekap Kemarin Sekarang
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Perubahan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Support Tickets Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-500" />
              Notifikasi Tiket Bantuan & Gangguan
            </CardTitle>
            <CardDescription>
              Pemberitahuan instan saat tiket dibuat oleh pelanggan, chatbot AI, atau staf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="notif_ticket_new">
                  Tiket Baru Masuk
                </Label>
                <p className="text-xs text-muted-foreground">
                  Kirim rincian kendala ke WhatsApp Admin dan Mitra yang menaungi area pelanggan.
                </p>
              </div>
              <Switch
                id="notif_ticket_new"
                checked={settings.notif_ticket_new_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, notif_ticket_new_enabled: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="notif_ticket_resolved">
                  Tiket Terselesaikan (Resolved)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Kirim konfirmasi penyelesaian tiket ke Admin dan Mitra terkait.
                </p>
              </div>
              <Switch
                id="notif_ticket_resolved"
                checked={settings.notif_ticket_resolved_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, notif_ticket_resolved_enabled: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Installation Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-500" />
              Notifikasi Pemasangan & Aktivasi
            </CardTitle>
            <CardDescription>
              Pemberitahuan alur instalasi pelanggan baru dari persetujuan hingga online.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="notif_installation_new">
                  Jadwal Instalasi Baru
                </Label>
                <p className="text-xs text-muted-foreground">
                  Kirim detail pelanggan & paket ke Admin, Mitra, dan nomor WhatsApp Teknisi.
                </p>
              </div>
              <Switch
                id="notif_installation_new"
                checked={settings.notif_installation_new_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, notif_installation_new_enabled: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="notif_installation_completed">
                  Instalasi Selesai & Pelanggan Aktif
                </Label>
                <p className="text-xs text-muted-foreground">
                  Kirim notifikasi saat pendaftaran selesai diinstal dan layanan internet online.
                </p>
              </div>
              <Switch
                id="notif_installation_completed"
                checked={settings.notif_installation_completed_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, notif_installation_completed_enabled: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Daily Recap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
              Rekap Transaksi Harian (Kemarin)
            </CardTitle>
            <CardDescription>
              Laporan ringkas otomatis setiap pagi ke Superadmin & Mitra mengenai pembayaran lunas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="notif_daily_recap">
                  Kirim Rekap Transaksi Harian
                </Label>
                <p className="text-xs text-muted-foreground">
                  Merangkum total pendapatan, rincian Tunai/Transfer/Tripay/Autopay, dan pelanggan baru.
                </p>
              </div>
              <Switch
                id="notif_daily_recap"
                checked={settings.notif_daily_recap_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, notif_daily_recap_enabled: checked }))
                }
              />
            </div>

            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-1.5" htmlFor="daily_recap_time">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Waktu Pengiriman (WIB)
                </Label>
                <Input
                  id="daily_recap_time"
                  type="time"
                  value={settings.daily_recap_time}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, daily_recap_time: e.target.value }))
                  }
                  className="w-32 text-center font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Jadwal cron dijalankan sesuai zona waktu Asia/Jakarta (WIB).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Network Uptime Monitoring */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="w-5 h-5 text-rose-500" />
              Monitoring Perangkat Jaringan (NMS)
            </CardTitle>
            <CardDescription>
              Deteksi otomatis ping interval (180 detik) dan kirim peringatan darurat saat perangkat putus / pulih.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="nas_monitoring_enabled">
                  Alert Router / NAS MikroTik
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pantau ketersediaan seluruh router NAS aktif. Peringatan merah saat DOWN, hijau saat UP.
                </p>
              </div>
              <Switch
                id="nas_monitoring_enabled"
                checked={settings.nas_monitoring_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, nas_monitoring_enabled: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
              <div className="space-y-0.5 pr-4">
                <Label className="text-sm font-semibold cursor-pointer" htmlFor="olt_monitoring_enabled">
                  Alert OLT (Optical Line Terminal)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Pantau konektivitas OLT fiber optik utama dan kirim notifikasi saat status berubah.
                </p>
              </div>
              <Switch
                id="olt_monitoring_enabled"
                checked={settings.olt_monitoring_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, olt_monitoring_enabled: checked }))
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dynamic Templates Reference */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-sky-500" />
                Template Notifikasi Dinamis (Tersedia di Database)
              </CardTitle>
              <CardDescription>
                Format pesan tanpa icon, tersusun rapi, ringkas, dan sopan seperti notifikasi pelanggan. Teks dan variabel dapat disesuaikan di tab Templates.
              </CardDescription>
            </div>
            {onSwitchToTemplates && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSwitchToTemplates}
                className="flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4 text-sky-600" />
                Buka Tab Templates
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                id: 'admin_new_ticket',
                title: 'Pemberitahuan Tiket Baru',
                vars: ['ticketNumber', 'customerName', 'mitraName', 'category', 'description']
              },
              {
                id: 'admin_ticket_resolved',
                title: 'Pemberitahuan Tiket Selesai',
                vars: ['ticketNumber', 'customerName', 'technicianName', 'resolutionNotes']
              },
              {
                id: 'admin_new_installation',
                title: 'Jadwal Instalasi Baru',
                vars: ['jobNumber', 'customerName', 'packageName', 'scheduleDate', 'technicianName']
              },
              {
                id: 'admin_installation_completed',
                title: 'Instalasi Selesai & Aktif',
                vars: ['jobNumber', 'serviceNumber', 'customerName', 'packageName', 'technicianName']
              },
              {
                id: 'admin_daily_recap',
                title: 'Rekap Transaksi Harian (Kemarin)',
                vars: ['recapDate', 'totalRevenue', 'totalTransactions', 'mitraBreakdown']
              },
              {
                id: 'network_device_alert',
                title: 'Status Perangkat (Down / Pulih)',
                vars: ['statusTitle', 'deviceType', 'deviceName', 'deviceIp', 'eventTime']
              },
              {
                id: 'mitra_payment_received',
                title: 'Pembayaran Pelanggan Area (Mitra)',
                vars: ['mitraName', 'customerName', 'packageName', 'amount', 'destinationBank']
              },
              {
                id: 'voucher_delivered',
                title: 'Voucher Hotspot Dikirim',
                vars: ['customer_name', 'voucher_code', 'username', 'password', 'duration_hours']
              }
            ].map((tmpl) => (
              <div key={tmpl.id} className="border rounded-md p-3 space-y-1.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs text-foreground">{tmpl.title}</span>
                  <Badge variant="outline" className="font-mono text-[9px]">{tmpl.id}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Variabel: {tmpl.vars.map(v => `{{${v}}}`).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Target Recipients Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Target Penerima Notifikasi WhatsApp
          </CardTitle>
          <CardDescription>
            Notifikasi dikirimkan ke Superadmin utama, staf administrator, dan nomor Mitra pemilik wilayah pelanggan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="max-w-md space-y-2">
            <Label htmlFor="admin_phone_number" className="text-sm font-medium">
              Nomor WhatsApp Superadmin Utama
            </Label>
            <Input
              id="admin_phone_number"
              placeholder="Contoh: 628115345333"
              value={settings.admin_phone_number}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, admin_phone_number: e.target.value }))
              }
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Format internasional diawali 62 (contoh: 628115345333). Digunakan sebagai penerima rekap dan peringatan kritis.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Admin list */}
            <div className="border rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Daftar Administrator ({admins.length})</span>
                <Badge variant="outline" className="text-xs font-normal">Superadmin & Admin</Badge>
              </h4>
              <div className="divide-y max-h-48 overflow-y-auto">
                {admins.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Tidak ada admin terdaftar</p>
                ) : (
                  admins.map((adm) => (
                    <div key={adm.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-foreground">{adm.name || adm.username}</div>
                        <div className="text-muted-foreground">{adm.email}</div>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {adm.phone || 'Tanpa No HP'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Mitra list */}
            <div className="border rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Daftar Mitra Aktif ({mitras.length})</span>
                <Badge variant="outline" className="text-xs font-normal">Penerima Wilayah</Badge>
              </h4>
              <div className="divide-y max-h-48 overflow-y-auto">
                {mitras.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Tidak ada mitra terdaftar</p>
                ) : (
                  mitras.map((m) => (
                    <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-medium text-foreground">{m.name}</div>
                        <div className="text-muted-foreground truncate max-w-[180px]">{m.address || '-'}</div>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {m.phone || 'Tanpa No HP'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t pt-4">
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Pengaturan
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
