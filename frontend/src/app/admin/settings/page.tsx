'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Settings,
  Building,
  Wifi,
  Bell,
  Shield,
  Database,
  Save,
  Loader2,
  Mail,
  Smartphone,
  Server,
  Radio,
  Activity,
  HardDrive,
  Palette,
  Upload,
  Image,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { adminApi, endpoints } from '@/lib/api-clients'
import { toast } from 'react-hot-toast'

interface SupportContact {
  id: string
  label: string
  number: string
}

interface SystemSettings {
  company: {
    name: string
    address: string
    phone: string
    email: string
    website: string
    logo: string
    supportContacts: SupportContact[]
    operatingHours?: {
      weekday: string
      weekend: string
    }
  }
  network: {
    mikrotik: {
      enabled: boolean
      monitor_mode: 'api' | 'snmp'
      snmp: {
        host: string
        community: string
        version: string
        port: number
      }
      host: string
      port: number
      username: string
      password: string
    }
    radius: {
      enabled: boolean
      host: string
      port: number
      secret: string
    }
    hotspot: {
      enabled: boolean
      loginPage: string
      welcomePage: string
    }
    main_traffic?: {
      router_id: string
      interface_name: string
    }
  }
  notifications: {
    email: {
      enabled: boolean
      smtpHost: string
      smtpPort: number
      smtpUsername: string
      smtpPassword: string
      smtpSecure: boolean
    }
    sms: {
      enabled: boolean
      provider: string
      apiKey: string
      senderId: string
    }
    telegram: {
      enabled: boolean
      botToken: string
      chatId: string
    }
  }
  security: {
    sessionTimeout: number
    passwordMinLength: number
    twoFactorEnabled: boolean
    loginAttempts: number
    ipWhitelist: string[]
  }
  backup: {
    autoBackup: boolean
    backupFrequency: string
    backupRetention: number
    backupLocation: string
  }
  database: {
    host: string
    port: number
    name: string
    user: string
    password: string
    poolMax: number
    idleTimeout: number
    connectionTimeout: number
  }
  monitoring: {
    rxPowerWarning: number
    rxPowerCritical: number
    rxPowerNotificationEnable: boolean
    rxpowerRecapEnable: boolean
    rxpowerRecapInterval: number
    offlineNotificationEnable: boolean
    offlineNotificationInterval: number
  }
  branding: {
    siteTitle: string
    titleType: 'text' | 'logo'
    logoUrl: string
    faviconUrl: string
  }
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('branding')
  const [hasChanges, setHasChanges] = useState(false)
  const [settings, setSettings] = useState<SystemSettings>({
    company: {
      name: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      logo: '',
      logo: '',
      supportContacts: [],
      operatingHours: {
        weekday: '',
        weekend: ''
      }
    },
    network: {
      mikrotik: {
        enabled: false,
        monitor_mode: 'api',
        snmp: { host: '', community: 'public', version: '2c', port: 161 },
        host: '',
        port: 8728,
        username: '',
        password: '',
      },
      radius: {
        enabled: false,
        host: 'localhost',
        port: 1812,
        secret: '',
      },
      hotspot: {
        enabled: false,
        loginPage: '',
        welcomePage: '',
      },
      main_traffic: {
        router_id: '',
        interface_name: ''
      }
    },
    notifications: {
      email: {
        enabled: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUsername: '',
        smtpPassword: '',
        smtpSecure: true,
      },
      sms: {
        enabled: false,
        provider: '',
        apiKey: '',
        senderId: '',
      },
      telegram: {
        enabled: false,
        botToken: '',
        chatId: '',
      },
    },
    security: {
      sessionTimeout: 30,
      passwordMinLength: 8,
      twoFactorEnabled: false,
      loginAttempts: 5,
      ipWhitelist: [],
    },
    backup: {
      autoBackup: true,
      backupFrequency: 'daily',
      backupRetention: 30,
      backupLocation: '/backups',
    },
    database: {
      host: 'localhost',
      port: 5432,
      name: 'kilusi_bill',
      user: '',
      password: '',
      poolMax: 20,
      idleTimeout: 30000,
      connectionTimeout: 5000,
    },
    monitoring: {
      rxPowerWarning: -26,
      rxPowerCritical: -30,
      rxPowerNotificationEnable: true,
      rxpowerRecapEnable: true,
      rxpowerRecapInterval: 6,
      offlineNotificationEnable: true,
      offlineNotificationInterval: 12,
    },
    branding: {
      siteTitle: 'Kilusi Bill',
      titleType: 'text',
      logoUrl: '',
      faviconUrl: '/favicon.ico',
    },
  })

  const tabs = [
    { id: 'branding', name: 'Branding', icon: Palette },
    { id: 'company', name: 'Perusahaan', icon: Building },
    { id: 'database', name: 'Database', icon: HardDrive },
    { id: 'monitoring', name: 'Monitoring', icon: Activity },
    { id: 'network', name: 'Jaringan', icon: Wifi },
    { id: 'notifications', name: 'Notifikasi', icon: Bell },
    { id: 'security', name: 'Keamanan', icon: Shield },
    { id: 'backup', name: 'Backup', icon: Database },
  ]

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await adminApi.get(endpoints.admin.settings)
      if (response.data.success) {
        const fetchedSettings = response.data.data?.settings || {}
        setSettings(prev => ({
          ...prev,
          company: { ...prev.company, ...fetchedSettings.company },
          network: {
            ...prev.network,
            ...fetchedSettings.network,
            mikrotik: { ...prev.network.mikrotik, ...fetchedSettings.network?.mikrotik },
            radius: { ...prev.network.radius, ...fetchedSettings.network?.radius },
            hotspot: { ...prev.network.hotspot, ...fetchedSettings.network?.hotspot },
          },
          notifications: {
            ...prev.notifications,
            ...fetchedSettings.notifications,
            email: { ...prev.notifications.email, ...fetchedSettings.notifications?.email },
            sms: { ...prev.notifications.sms, ...fetchedSettings.notifications?.sms },
            telegram: { ...prev.notifications.telegram, ...fetchedSettings.notifications?.telegram },
          },
          security: { ...prev.security, ...fetchedSettings.security },
          backup: { ...prev.backup, ...fetchedSettings.backup },
          monitoring: { ...prev.monitoring, ...fetchedSettings.monitoring },
          branding: { ...prev.branding, ...fetchedSettings.branding },
        }))
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Gagal memuat pengaturan')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const response = await adminApi.put(endpoints.admin.settings, { settings })
      if (response.data.success) {
        toast.success('Pengaturan berhasil disimpan')
        setHasChanges(false)
      } else {
        toast.error('Gagal menyimpan pengaturan')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Gagal menyimpan pengaturan')
    } finally {
      setSaving(false)
    }
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'branding':
        const handleFileUpload = async (type: 'logo' | 'favicon', file: File) => {
          try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await adminApi.post(`/api/v1/branding/upload/${type}`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            })

            if (response.data.success) {
              const url = response.data.data.url
              setSettings({
                ...settings,
                branding: {
                  ...settings.branding,
                  [type === 'logo' ? 'logoUrl' : 'faviconUrl']: url
                }
              })
              setHasChanges(true)
              toast.success(`${type === 'logo' ? 'Logo' : 'Favicon'} berhasil diupload`)
            }
          } catch (error: any) {
            toast.error(error.response?.data?.message || 'Gagal upload file')
          }
        }

        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Pengaturan Branding
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Site Title Type */}
                {/* Site Title Type - Now controlled via checkbox for display preference, but inputs are separate */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.branding.titleType === 'logo'}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          branding: { ...settings.branding, titleType: e.target.checked ? 'logo' : 'text' }
                        })
                        setHasChanges(true)
                      }}
                      id="useLogo"
                    />
                    <label htmlFor="useLogo" className="text-sm font-medium cursor-pointer">
                      Gunakan Logo di Header Sidebar
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Jika tidak dicentang, teks judul akan ditampilkan. Judul situs tetap digunakan untuk tab browser.
                  </p>
                </div>

                {/* Site Title - Always Visible */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Judul Situs / Nama Aplikasi</label>
                  <Input
                    value={settings.branding.siteTitle}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        branding: { ...settings.branding, siteTitle: e.target.value }
                      })
                      setHasChanges(true)
                    }}
                    placeholder="Kilusi Bill"
                  />
                  <p className="text-xs text-muted-foreground">
                    Judul ini akan ditampilkan di tab browser dan di header jika mode logo tidak aktif.
                  </p>
                </div>

                {/* Site Logo - Always Visible */}
                <div className="space-y-3 pt-4 border-t">

                  <div className="space-y-3">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Logo
                    </label>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-colors">
                        <Upload className="h-4 w-4" />
                        <span>Pilih File</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileUpload('logo', file)
                          }}
                        />
                      </label>
                      <span className="text-xs text-muted-foreground">
                        PNG, JPEG, SVG (Max 2MB)
                      </span>
                    </div>

                    {settings.branding.logoUrl && (
                      <div className="p-4 bg-muted/30 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-2">Logo saat ini:</p>
                        <div className="flex items-center gap-4">
                          <img
                            src={settings.branding.logoUrl.startsWith('/') ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${settings.branding.logoUrl}` : settings.branding.logoUrl}
                            alt="Logo Preview"
                            className="h-10 object-contain bg-white p-1 rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder-logo.png'
                            }}
                          />
                          <span className="text-xs text-muted-foreground">{settings.branding.logoUrl}</span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Rekomendasi: format PNG dengan tinggi 40px dan background transparan
                    </p>
                  </div>
                </div>

                {/* Favicon - Upload */}
                <div className="space-y-3 pt-4 border-t">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Favicon
                  </label>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg cursor-pointer hover:bg-primary/90 transition-colors">
                      <Upload className="h-4 w-4" />
                      <span>Pilih File</span>
                      <input
                        type="file"
                        accept="image/png,image/x-icon,image/ico,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleFileUpload('favicon', file)
                        }}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">
                      ICO, PNG, SVG (Max 2MB)
                    </span>
                  </div>

                  {settings.branding.faviconUrl && (
                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <span className="text-xs text-muted-foreground">Favicon saat ini:</span>
                      <img
                        src={settings.branding.faviconUrl.startsWith('/') ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${settings.branding.faviconUrl}` : settings.branding.faviconUrl}
                        alt="Favicon Preview"
                        className="h-6 w-6 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <span className="text-xs text-muted-foreground">{settings.branding.faviconUrl}</span>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Rekomendasi: format ICO atau PNG 32x32 atau 64x64 pixels
                  </p>
                </div>

                {/* Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>Catatan:</strong> Perubahan branding akan terlihat setelah refresh halaman. File akan disimpan di server lokal.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'company':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informasi Perusahaan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Nama Perusahaan</label>
                    <Input
                      value={settings.company.name}
                      onChange={(e) => {
                        setSettings({ ...settings, company: { ...settings.company, name: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="Nama perusahaan"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={settings.company.email}
                      onChange={(e) => {
                        setSettings({ ...settings, company: { ...settings.company, email: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="email@perusahaan.com"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Telepon</label>
                    <Input
                      value={settings.company.phone}
                      onChange={(e) => {
                        setSettings({ ...settings, company: { ...settings.company, phone: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="021-xxxxxxx"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Website</label>
                    <Input
                      value={settings.company.website}
                      onChange={(e) => {
                        setSettings({ ...settings, company: { ...settings.company, website: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="https://www.perusahaan.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Alamat</label>
                  <Input
                    value={settings.company.address}
                    onChange={(e) => {
                      setSettings({ ...settings, company: { ...settings.company, address: e.target.value } })
                      setHasChanges(true)
                    }}
                    placeholder="Alamat lengkap perusahaan"
                  />
                </div>

                {/* Operating Hours */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Jam Operasional (Senin - Jumat)</label>
                    <Input
                      value={settings.company.operatingHours?.weekday || ''}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          company: {
                            ...settings.company,
                            operatingHours: {
                              ...settings.company.operatingHours,
                              weekday: e.target.value
                            } as any
                          }
                        })
                        setHasChanges(true)
                      }}
                      placeholder="08:00 - 22:00 WIB"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Jam Operasional (Sabtu - Minggu / Libur)</label>
                    <Input
                      value={settings.company.operatingHours?.weekend || ''}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          company: {
                            ...settings.company,
                            operatingHours: {
                              ...settings.company.operatingHours,
                              weekend: e.target.value
                            } as any
                          }
                        })
                        setHasChanges(true)
                      }}
                      placeholder="09:00 - 18:00 WIB"
                    />
                  </div>
                </div>

                {/* Support Contacts */}
                <div className="pt-4 border-t space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Kontak Support (WhatsApp)
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newContact: SupportContact = {
                          id: Date.now().toString(),
                          label: '',
                          number: ''
                        }
                        setSettings({
                          ...settings,
                          company: {
                            ...settings.company,
                            supportContacts: [...(settings.company.supportContacts || []), newContact]
                          }
                        })
                        setHasChanges(true)
                      }}
                    >
                      <span className="mr-1">+</span> Tambah Kontak
                    </Button>
                  </div>

                  {(!settings.company.supportContacts || settings.company.supportContacts.length === 0) ? (
                    <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg">
                      <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Belum ada kontak support</p>
                      <p className="text-xs">Klik &quot;Tambah Kontak&quot; untuk menambahkan nomor CS, Technical Support, dll.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {settings.company.supportContacts.map((contact, index) => (
                        <div key={contact.id} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Label</label>
                              <select
                                value={contact.label}
                                onChange={(e) => {
                                  const updated = [...settings.company.supportContacts]
                                  updated[index] = { ...contact, label: e.target.value }
                                  setSettings({ ...settings, company: { ...settings.company, supportContacts: updated } })
                                  setHasChanges(true)
                                }}
                                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                              >
                                <option value="">Pilih Label</option>
                                <option value="Customer Service">Customer Service</option>
                                <option value="Technical Support">Technical Support</option>
                                <option value="Konfirmasi Pembayaran">Konfirmasi Pembayaran</option>
                                <option value="Sales">Sales</option>
                                <option value="Pengaduan">Pengaduan</option>
                                <option value="Lainnya">Lainnya</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">Nomor WhatsApp</label>
                              <Input
                                value={contact.number}
                                onChange={(e) => {
                                  const updated = [...settings.company.supportContacts]
                                  updated[index] = { ...contact, number: e.target.value }
                                  setSettings({ ...settings, company: { ...settings.company, supportContacts: updated } })
                                  setHasChanges(true)
                                }}
                                placeholder="628123456789"
                                className="mt-1"
                              />
                            </div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500 hover:text-red-700 hover:bg-red-100"
                            onClick={() => {
                              const updated = settings.company.supportContacts.filter(c => c.id !== contact.id)
                              setSettings({ ...settings, company: { ...settings.company, supportContacts: updated } })
                              setHasChanges(true)
                            }}
                          >
                            <span className="text-lg">×</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Format: internasional tanpa + (contoh: 628123456789). Akan ditampilkan sebagai link <code className="bg-muted px-1 rounded">wa.me/nomor</code>
                  </p>

                  {/* Payment Settings Link */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Rekening Bank & E-Wallet
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Kelola akun bank dan e-wallet di halaman <a href="/admin/payment-settings" className="underline font-medium">Setting Pembayaran</a>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'monitoring':
        return <MonitoringSettingsTab settings={settings} setSettings={setSettings} setHasChanges={setHasChanges} />

      case 'network':
        return (
          <div className="space-y-6">
            {/* Mikrotik */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Mikrotik Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.network.mikrotik.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        network: { ...settings.network, mikrotik: { ...settings.network.mikrotik, enabled: e.target.checked } }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium">Aktifkan Mikrotik</label>
                </div>
                {settings.network.mikrotik.enabled && (
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm font-medium">Mode Monitor</label>
                      <select
                        value={settings.network.mikrotik.monitor_mode}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: { ...settings.network, mikrotik: { ...settings.network.mikrotik, monitor_mode: e.target.value as 'api' | 'snmp' } }
                          })
                          setHasChanges(true)
                        }}
                        className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="api">API</option>
                        <option value="snmp">SNMP</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Host</label>
                        <Input
                          value={settings.network.mikrotik.host}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              network: { ...settings.network, mikrotik: { ...settings.network.mikrotik, host: e.target.value } }
                            })
                            setHasChanges(true)
                          }}
                          placeholder="192.168.1.1"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Port</label>
                        <Input
                          type="number"
                          value={settings.network.mikrotik.port}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              network: { ...settings.network, mikrotik: { ...settings.network.mikrotik, port: parseInt(e.target.value) } }
                            })
                            setHasChanges(true)
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Username</label>
                        <Input
                          value={settings.network.mikrotik.username}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              network: { ...settings.network, mikrotik: { ...settings.network.mikrotik, username: e.target.value } }
                            })
                            setHasChanges(true)
                          }}
                          placeholder="admin"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Password</label>
                        <Input
                          type="password"
                          value={settings.network.mikrotik.password}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              network: { ...settings.network, mikrotik: { ...settings.network.mikrotik, password: e.target.value } }
                            })
                            setHasChanges(true)
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RADIUS */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5" />
                  RADIUS Server
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.network.radius.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        network: { ...settings.network, radius: { ...settings.network.radius, enabled: e.target.checked } }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium">Aktifkan RADIUS</label>
                </div>
                {settings.network.radius.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm font-medium">Host</label>
                      <Input
                        value={settings.network.radius.host}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: { ...settings.network, radius: { ...settings.network.radius, host: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Port</label>
                      <Input
                        type="number"
                        value={settings.network.radius.port}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: { ...settings.network, radius: { ...settings.network.radius, port: parseInt(e.target.value) } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Secret</label>
                      <Input
                        type="password"
                        value={settings.network.radius.secret}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: { ...settings.network, radius: { ...settings.network.radius, secret: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )

      case 'notifications':
        return (
          <div className="space-y-6">
            {/* Email */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email (SMTP)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.notifications.email.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        notifications: { ...settings.notifications, email: { ...settings.notifications.email, enabled: e.target.checked } }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium">Aktifkan Email</label>
                </div>
                {settings.notifications.email.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm font-medium">SMTP Host</label>
                      <Input
                        value={settings.notifications.email.smtpHost}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, email: { ...settings.notifications.email, smtpHost: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Port</label>
                      <Input
                        type="number"
                        value={settings.notifications.email.smtpPort}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, email: { ...settings.notifications.email, smtpPort: parseInt(e.target.value) } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Username</label>
                      <Input
                        value={settings.notifications.email.smtpUsername}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, email: { ...settings.notifications.email, smtpUsername: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Password</label>
                      <Input
                        type="password"
                        value={settings.notifications.email.smtpPassword}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, email: { ...settings.notifications.email, smtpPassword: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SMS */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  SMS Gateway
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.notifications.sms.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        notifications: { ...settings.notifications, sms: { ...settings.notifications.sms, enabled: e.target.checked } }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium">Aktifkan SMS</label>
                </div>
                {settings.notifications.sms.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm font-medium">Provider</label>
                      <select
                        value={settings.notifications.sms.provider}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, sms: { ...settings.notifications.sms, provider: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                        className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Pilih Provider</option>
                        <option value="twilio">Twilio</option>
                        <option value="nexmo">Nexmo</option>
                        <option value="zenziva">Zenziva</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">API Key</label>
                      <Input
                        type="password"
                        value={settings.notifications.sms.apiKey}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, sms: { ...settings.notifications.sms, apiKey: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Sender ID</label>
                      <Input
                        value={settings.notifications.sms.senderId}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, sms: { ...settings.notifications.sms, senderId: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Telegram Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Pengaturan Telegram Notifikasi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.notifications.telegram?.enabled ?? false}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        notifications: { ...settings.notifications, telegram: { ...settings.notifications.telegram!, enabled: e.target.checked } }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium">Aktifkan Notifikasi Telegram</label>
                </div>
                {settings.notifications.telegram?.enabled && (
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm font-medium">Bot Token</label>
                      <Input
                        type="password"
                        value={settings.notifications.telegram?.botToken || ''}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, telegram: { ...settings.notifications.telegram!, botToken: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                        placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Dapatkan dari @BotFather</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Chat ID (Admin)</label>
                      <Input
                        value={settings.notifications.telegram?.chatId || ''}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: { ...settings.notifications, telegram: { ...settings.notifications.telegram!, chatId: e.target.value } }
                          })
                          setHasChanges(true)
                        }}
                        placeholder="-100xxxxxxxxx atau ID user"
                      />
                      <p className="text-xs text-muted-foreground mt-1">ID User atau Group tempat bot akan mengirim notifikasi</p>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Pastikan bot sudah dimasukkan ke dalam group dan dijadikan admin agar bisa mengirim pesan.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )

      case 'security':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pengaturan Keamanan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Session Timeout (menit)</label>
                    <Input
                      type="number"
                      value={settings.security.sessionTimeout}
                      onChange={(e) => {
                        setSettings({ ...settings, security: { ...settings.security, sessionTimeout: parseInt(e.target.value) } })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Min. Password Length</label>
                    <Input
                      type="number"
                      value={settings.security.passwordMinLength}
                      onChange={(e) => {
                        setSettings({ ...settings, security: { ...settings.security, passwordMinLength: parseInt(e.target.value) } })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Login Attempts</label>
                    <Input
                      type="number"
                      value={settings.security.loginAttempts}
                      onChange={(e) => {
                        setSettings({ ...settings, security: { ...settings.security, loginAttempts: parseInt(e.target.value) } })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <input
                      type="checkbox"
                      checked={settings.security.twoFactorEnabled}
                      onChange={(e) => {
                        setSettings({ ...settings, security: { ...settings.security, twoFactorEnabled: e.target.checked } })
                        setHasChanges(true)
                      }}
                    />
                    <label className="text-sm font-medium">Two-Factor Authentication</label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'backup':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pengaturan Backup</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.backup.autoBackup}
                    onChange={(e) => {
                      setSettings({ ...settings, backup: { ...settings.backup, autoBackup: e.target.checked } })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium">Auto Backup</label>
                </div>
                {settings.backup.autoBackup && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <label className="text-sm font-medium">Frekuensi</label>
                      <select
                        value={settings.backup.backupFrequency}
                        onChange={(e) => {
                          setSettings({ ...settings, backup: { ...settings.backup, backupFrequency: e.target.value } })
                          setHasChanges(true)
                        }}
                        className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Retention (hari)</label>
                      <Input
                        type="number"
                        value={settings.backup.backupRetention}
                        onChange={(e) => {
                          setSettings({ ...settings, backup: { ...settings.backup, backupRetention: parseInt(e.target.value) } })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Lokasi Backup</label>
                      <Input
                        value={settings.backup.backupLocation}
                        onChange={(e) => {
                          setSettings({ ...settings, backup: { ...settings.backup, backupLocation: e.target.value } })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )

      case 'database':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Pengaturan Database PostgreSQL
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">⚠️ Hati-hati</p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    Perubahan pada pengaturan database memerlukan restart aplikasi.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium">Host</label>
                    <Input
                      value={settings.database?.host || ''}
                      onChange={(e) => {
                        setSettings({ ...settings, database: { ...settings.database, host: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="localhost"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Port</label>
                    <Input
                      type="number"
                      value={settings.database?.port || 5432}
                      onChange={(e) => {
                        setSettings({ ...settings, database: { ...settings.database, port: parseInt(e.target.value) } })
                        setHasChanges(true)
                      }}
                      placeholder="5432"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Nama Database</label>
                    <Input
                      value={settings.database?.name || ''}
                      onChange={(e) => {
                        setSettings({ ...settings, database: { ...settings.database, name: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="kilusi_bill"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Username</label>
                    <Input
                      value={settings.database?.user || ''}
                      onChange={(e) => {
                        setSettings({ ...settings, database: { ...settings.database, user: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="postgres"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      type="password"
                      value={settings.database?.password || ''}
                      onChange={(e) => {
                        setSettings({ ...settings, database: { ...settings.database, password: e.target.value } })
                        setHasChanges(true)
                      }}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3">Connection Pool</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium">Max Connections</label>
                      <Input
                        type="number"
                        value={settings.database?.poolMax || 20}
                        onChange={(e) => {
                          setSettings({ ...settings, database: { ...settings.database, poolMax: parseInt(e.target.value) } })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Idle Timeout (ms)</label>
                      <Input
                        type="number"
                        value={settings.database?.idleTimeout || 30000}
                        onChange={(e) => {
                          setSettings({ ...settings, database: { ...settings.database, idleTimeout: parseInt(e.target.value) } })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Connection Timeout (ms)</label>
                      <Input
                        type="number"
                        value={settings.database?.connectionTimeout || 5000}
                        onChange={(e) => {
                          setSettings({ ...settings, database: { ...settings.database, connectionTimeout: parseInt(e.target.value) } })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'monitoring':
        return <MonitoringSettingsTab settings={settings} setSettings={setSettings} setHasChanges={setHasChanges} />

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Pengaturan Sistem
          </h1>
          <p className="text-muted-foreground">
            Kelola pengaturan sistem, jaringan, dan aplikasi
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Simpan Perubahan
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-4">
        {tabs.map((tab) => {
          const IconComponent = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted hover:bg-muted/80'
                }`}
            >
              <IconComponent className="h-4 w-4" />
              {tab.name}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {renderTabContent()}
    </div>
  )
}

function MonitoringSettingsTab({ settings, setSettings, setHasChanges }: any) {
  const [monitors, setMonitors] = useState<any[]>([])
  const [loadingMonitors, setLoadingMonitors] = useState(false)
  const [newMonitor, setNewMonitor] = useState({ name: '', target: '', type: 'icmp', interval: 60 })
  const [adding, setAdding] = useState(false)

  const [nasList, setNasList] = useState<any[]>([])
  const [nasInterfaces, setNasInterfaces] = useState<any[]>([])
  const [loadingInterfaces, setLoadingInterfaces] = useState(false)

  // Fetch Monitors on mount
  useEffect(() => {
    fetchMonitors()
    // Fetch NAS List
    adminApi.get(`${endpoints.admin.radius}/nas`)
      .then(res => {
        if (res.data.success) {
          // Backend returns { success: true, data: { nas: [...] } }
          // So the array is in res.data.data.nas
          const data = res.data.data
          const list = Array.isArray(data) ? data : (data?.nas || [])
          setNasList(Array.isArray(list) ? list : [])
        }
      })
      .catch((err) => {
        console.error("Failed to fetch NAS list", err)
      })
  }, [])

  // Fetch interfaces when Router ID changes
  useEffect(() => {
    const routerId = settings.network.main_traffic?.router_id
    if (!routerId) {
      setNasInterfaces([])
      return
    }

    const fetchInterfaces = async () => {
      setLoadingInterfaces(true)
      try {
        const res = await adminApi.get(`${endpoints.admin.radius}/nas/${routerId}/interfaces`)
        if (res.data.success) {
          setNasInterfaces(Array.isArray(res.data.data) ? res.data.data : [])
        }
      } catch (error) {
        console.error("Failed to fetch interfaces", error)
        toast.error("Gagal memuat interface dari NAS")
      } finally {
        setLoadingInterfaces(false)
      }
    }

    fetchInterfaces()
  }, [settings.network.main_traffic?.router_id])

  const fetchMonitors = async () => {
    try {
      setLoadingMonitors(true)
      const res = await adminApi.get(endpoints.admin.monitoring.monitors)
      if (res.data.success) {
        setMonitors(res.data.data)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMonitors(false)
    }
  }

  const addMonitor = async () => {
    if (!newMonitor.name || !newMonitor.target) return toast.error('Name & Target required')
    try {
      setAdding(true)
      const res = await adminApi.post(endpoints.admin.monitoring.monitors, newMonitor)
      if (res.data.success) {
        toast.success('Monitor Added')
        fetchMonitors()
        setNewMonitor({ name: '', target: '', type: 'icmp', interval: 60 })
      }
    } catch (e) {
      toast.error('Failed to add monitor')
    } finally {
      setAdding(false)
    }
  }

  const deleteMonitor = async (id: number) => {
    if (!confirm('Area you sure?')) return
    try {
      await adminApi.delete(`${endpoints.admin.monitoring.monitors}/${id}`)
      toast.success('Deleted')
      fetchMonitors()
    } catch (e) {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Traffic Interface Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Main Traffic Interface
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Select Router (NAS)</label>
              <select
                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={settings.network.main_traffic?.router_id || ''}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    network: {
                      ...settings.network,
                      main_traffic: { ...settings.network.main_traffic, router_id: e.target.value }
                    }
                  })
                  setHasChanges(true)
                }}
              >
                <option value="">-- Select Router --</option>
                {nasList.map((n: any) => (
                  <option key={n.id} value={n.id}>{n.shortname} ({n.nasname})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Interface Name</label>
              {loadingInterfaces ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading interfaces...
                </div>
              ) : (
                <select
                  className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={settings.network.main_traffic?.interface_name || ''}
                  onChange={(e) => {
                    setSettings({
                      ...settings,
                      network: {
                        ...settings.network,
                        main_traffic: { ...settings.network.main_traffic, interface_name: e.target.value }
                      }
                    })
                    setHasChanges(true)
                  }}
                  disabled={!settings.network.main_traffic?.router_id}
                >
                  <option value="">-- Select Interface --</option>
                  {nasInterfaces
                    .filter(iface => {
                      // Filter: Physical (6, 117, etc), VLAN (136), Bridge (209), Wireless (71)
                      // Or name matches common patterns.
                      const type = Number(iface.type)
                      const name = (iface.name || '').toLowerCase()
                      const isPhysical = [6, 136, 209, 71, 117].includes(type) || /(ether|sfp|vlan|wlan|bridge|bond|trunk)/.test(name)
                      return isPhysical // Show disabled too, maybe user wants to monitor a disabled interface that will be enabled? The "disabled" field is in iface.disabled
                    })
                    .map((iface: any) => (
                      <option key={iface.index} value={iface.name}>
                        {iface.name} {iface.type === 136 ? '(VLAN)' : ''} {iface.disabled ? '(Disabled)' : ''}
                      </option>
                    ))}
                </select>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Pilih interface fisik atau VLAN yang akan dimonitor trafiknya.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Uptime Monitors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Uptime Monitors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Add New */}
          <div className="flex gap-3 items-end bg-muted/20 p-4 rounded-lg">
            <div className="flex-1">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={newMonitor.name}
                onChange={(e) => setNewMonitor({ ...newMonitor, name: e.target.value })}
                placeholder="Google DNS"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium">Target (IP/URL)</label>
              <Input
                value={newMonitor.target}
                onChange={(e) => setNewMonitor({ ...newMonitor, target: e.target.value })}
                placeholder="8.8.8.8"
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-medium">Type</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={newMonitor.type}
                onChange={(e) => setNewMonitor({ ...newMonitor, type: e.target.value })}
              >
                <option value="icmp">Ping</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <Button onClick={addMonitor} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
          </div>

          {/* List */}
          <div className="border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Target</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-center">Interval</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingMonitors ? (
                  <tr><td colSpan={6} className="p-4 text-center">Loading...</td></tr>
                ) : monitors.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No monitors configured</td></tr>
                ) : (
                  monitors.map((m: any) => (
                    <tr key={m.id} className="border-t">
                      <td className="p-3 font-medium">{m.name}</td>
                      <td className="p-3 font-mono text-xs">{m.target}</td>
                      <td className="p-3 uppercase">{m.type}</td>
                      <td className="p-3 text-center">{m.interval}s</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${m.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {m.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="ghost" className="text-red-500 h-8 w-8 p-0" onClick={() => deleteMonitor(m.id)}>
                          &times;
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3. OLT Settings (Detailed) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            OLT Signal Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Warning Threshold (dBm)</label>
              <Input
                type="number"
                value={settings.monitoring.rxPowerWarning}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    monitoring: { ...settings.monitoring, rxPowerWarning: parseInt(e.target.value) }
                  })
                  setHasChanges(true)
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Critical Threshold (dBm)</label>
              <Input
                type="number"
                value={settings.monitoring.rxPowerCritical}
                onChange={(e) => {
                  setSettings({
                    ...settings,
                    monitoring: { ...settings.monitoring, rxPowerCritical: parseInt(e.target.value) }
                  })
                  setHasChanges(true)
                }}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              checked={settings.monitoring.rxPowerNotificationEnable}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  monitoring: { ...settings.monitoring, rxPowerNotificationEnable: e.target.checked }
                })
                setHasChanges(true)
              }}
            />
            <label className="text-sm">Enable WhatsApp Notifications for Critical Signal</label>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}