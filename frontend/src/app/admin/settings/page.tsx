'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Settings,
  Building,
  CreditCard,
  Wifi,
  Mail,
  Smartphone,
  Shield,
  Database,
  Globe,
  Bell,
  Users,
  FileText,
  Save,
  RotateCcw,
  Download,
  Upload,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'
import { api, endpoints } from '@/lib/api'

interface SystemSettings {
  company: {
    name: string
    address: string
    phone: string
    email: string
    website: string
    logo: string
  }
  billing: {
    autoGenerateInvoices: boolean
    invoiceDueDays: number
    lateFee: number
    currency: string
    taxEnabled: boolean
    taxRate: number
  }
  payment: {
    methods: {
      transfer: { enabled: boolean; bankName: string; accountNumber: string; accountName: string }
      cash: { enabled: boolean }
      ewallet: { enabled: boolean; providers: string[] }
      virtualAccount: { enabled: boolean; enabled: boolean }
    }
  }
  network: {
    mikrotik: {
      enabled: boolean
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
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company')
  const [loading, setLoading] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [settings, setSettings] = useState<SystemSettings>({
    company: {
      name: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      logo: '',
    },
    billing: {
      autoGenerateInvoices: false,
      invoiceDueDays: 7,
      lateFee: 0,
      currency: 'IDR',
      taxEnabled: false,
      taxRate: 11,
    },
    payment: {
      methods: {
        transfer: { enabled: false, bankName: '', accountNumber: '', accountName: '' },
        cash: { enabled: false },
        ewallet: { enabled: false, providers: [] },
        virtualAccount: { enabled: false, enabled: false },
      },
    },
    network: {
      mikrotik: {
        enabled: false,
        host: '',
        port: 8728,
        username: '',
        password: '',
      },
      radius: {
        enabled: true,
        host: 'freeradius',
        port: 1812,
        secret: 'kilusiradius',
      },
      hotspot: {
        enabled: false,
        loginPage: '/hotspot/login.html',
        welcomePage: '/hotspot/welcome.html',
      },
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
    },
    security: {
      sessionTimeout: 3600,
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
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get(endpoints.settings.all)

      if (response.data.success) {
        // Merge fetched settings with defaults
        const fetchedSettings = response.data.data || {}
        setSettings(prevSettings => ({
          ...prevSettings,
          ...fetchedSettings,
          // Ensure nested objects are properly merged
          company: { ...prevSettings.company, ...fetchedSettings.company },
          billing: { ...prevSettings.billing, ...fetchedSettings.billing },
          network: {
            ...prevSettings.network,
            ...fetchedSettings.network,
            radius: { ...prevSettings.network.radius, ...fetchedSettings.network?.radius }
          },
          notifications: {
            ...prevSettings.notifications,
            ...fetchedSettings.notifications,
            email: { ...prevSettings.notifications.email, ...fetchedSettings.notifications?.email },
            sms: { ...prevSettings.notifications.sms, ...fetchedSettings.notifications?.sms }
          },
          security: { ...prevSettings.security, ...fetchedSettings.security },
          backup: { ...prevSettings.backup, ...fetchedSettings.backup },
        }))
      }
    } catch (err: any) {
      console.error('Error fetching settings:', err)
      setError(err.response?.data?.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'company', name: 'Perusahaan', icon: Building },
    { id: 'billing', name: 'Billing', icon: CreditCard },
    { id: 'payment', name: 'Pembayaran', icon: CreditCard },
    { id: 'network', name: 'Jaringan', icon: Wifi },
    { id: 'notifications', name: 'Notifikasi', icon: Bell },
    { id: 'security', name: 'Keamanan', icon: Shield },
    { id: 'backup', name: 'Backup', icon: Database },
  ]

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await api.post(endpoints.settings.update, settings)
      if (response.data.success) {
        setHasChanges(false)
        // Show success message
        console.log('Settings saved successfully')
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      setError(error.response?.data?.message || 'Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    // Reset to default settings
    setHasChanges(false)
  }

  const handleExport = () => {
    // Export settings
    const dataStr = JSON.stringify(settings, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    const exportFileDefaultName = 'kilusi-settings.json'
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const renderTabContent = () => {
    switch (activeTab) {
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
                    <label className="text-sm font-medium text-foreground">Nama Perusahaan</label>
                    <Input
                      value={settings.company.name}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          company: { ...settings.company, name: e.target.value }
                        })
                        setHasChanges(true)
                      }}
                      placeholder="Nama perusahaan"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Email</label>
                    <Input
                      value={settings.company.email}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          company: { ...settings.company, email: e.target.value }
                        })
                        setHasChanges(true)
                      }}
                      placeholder="Email perusahaan"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Telepon</label>
                    <Input
                      value={settings.company.phone}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          company: { ...settings.company, phone: e.target.value }
                        })
                        setHasChanges(true)
                      }}
                      placeholder="Telepon perusahaan"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Website</label>
                    <Input
                      value={settings.company.website}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          company: { ...settings.company, website: e.target.value }
                        })
                        setHasChanges(true)
                      }}
                      placeholder="Website perusahaan"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Alamat</label>
                  <Input
                    value={settings.company.address}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        company: { ...settings.company, address: e.target.value }
                      })
                      setHasChanges(true)
                    }}
                    placeholder="Alamat perusahaan"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'billing':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Pengaturan Billing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.billing.autoGenerateInvoices}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          billing: { ...settings.billing, autoGenerateInvoices: e.target.checked }
                        })
                        setHasChanges(true)
                      }}
                    />
                    <label className="text-sm font-medium text-foreground">Buat Invoice Otomatis</label>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Jatuh Tempo (hari)</label>
                    <Input
                      type="number"
                      value={settings.billing.invoiceDueDays}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          billing: { ...settings.billing, invoiceDueDays: parseInt(e.target.value) }
                        })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Denda Keterlambatan (%)</label>
                    <Input
                      type="number"
                      value={settings.billing.lateFee}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          billing: { ...settings.billing, lateFee: parseFloat(e.target.value) }
                        })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Mata Uang</label>
                    <Input
                      value={settings.billing.currency}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          billing: { ...settings.billing, currency: e.target.value }
                        })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={settings.billing.taxEnabled}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          billing: { ...settings.billing, taxEnabled: e.target.checked }
                        })
                        setHasChanges(true)
                      }}
                    />
                    <label className="text-sm font-medium text-foreground">Aktifkan Pajak</label>
                  </div>
                  {settings.billing.taxEnabled && (
                    <div>
                      <label className="text-sm font-medium text-foreground">Tarif Pajak (%)</label>
                      <Input
                        type="number"
                        value={settings.billing.taxRate}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            billing: { ...settings.billing, taxRate: parseFloat(e.target.value) }
                          })
                          setHasChanges(true)
                        }}
                        className="w-24"
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'payment':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Metode Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Transfer Bank */}
                <div>
                  <div className="flex items-center space-x-2 mb-4">
                    <input
                      type="checkbox"
                      checked={settings.payment.methods.transfer.enabled}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          payment: {
                            ...settings.payment,
                            methods: {
                              ...settings.payment.methods,
                              transfer: { ...settings.payment.methods.transfer, enabled: e.target.checked }
                            }
                          }
                        })
                        setHasChanges(true)
                      }}
                    />
                    <label className="text-sm font-medium text-foreground">Transfer Bank</label>
                  </div>
                  {settings.payment.methods.transfer.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                      <div>
                        <label className="text-sm font-medium text-foreground">Nama Bank</label>
                        <Input
                          value={settings.payment.methods.transfer.bankName}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              payment: {
                                ...settings.payment,
                                methods: {
                                  ...settings.payment.methods,
                                  transfer: { ...settings.payment.methods.transfer, bankName: e.target.value }
                                }
                              }
                            })
                            setHasChanges(true)
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">No. Rekening</label>
                        <Input
                          value={settings.payment.methods.transfer.accountNumber}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              payment: {
                                ...settings.payment,
                                methods: {
                                  ...settings.payment.methods,
                                  transfer: { ...settings.payment.methods.transfer, accountNumber: e.target.value }
                                }
                              }
                            })
                            setHasChanges(true)
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Atas Nama</label>
                        <Input
                          value={settings.payment.methods.transfer.accountName}
                          onChange={(e) => {
                            setSettings({
                              ...settings,
                              payment: {
                                ...settings.payment,
                                methods: {
                                  ...settings.payment.methods,
                                  transfer: { ...settings.payment.methods.transfer, accountName: e.target.value }
                                }
                              }
                            })
                            setHasChanges(true)
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Cash */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.payment.methods.cash.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        payment: {
                          ...settings.payment,
                          methods: {
                            ...settings.payment.methods,
                            cash: { enabled: e.target.checked }
                          }
                        }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Tunai</label>
                </div>

                {/* E-Wallet */}
                <div>
                  <div className="flex items-center space-x-2 mb-4">
                    <input
                      type="checkbox"
                      checked={settings.payment.methods.ewallet.enabled}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          payment: {
                            ...settings.payment,
                            methods: {
                              ...settings.payment.methods,
                              ewallet: { ...settings.payment.methods.ewallet, enabled: e.target.checked }
                            }
                          }
                        })
                        setHasChanges(true)
                      }}
                    />
                    <label className="text-sm font-medium text-foreground">E-Wallet</label>
                  </div>
                  {settings.payment.methods.ewallet.enabled && (
                    <div className="ml-6">
                      <label className="text-sm font-medium text-foreground">Provider</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja'].map((provider) => (
                          <label key={provider} className="flex items-center space-x-1">
                            <input
                              type="checkbox"
                              checked={settings.payment.methods.ewallet.providers.includes(provider)}
                              onChange={(e) => {
                                const providers = e.target.checked
                                  ? [...settings.payment.methods.ewallet.providers, provider]
                                  : settings.payment.methods.ewallet.providers.filter(p => p !== provider)
                                setSettings({
                                  ...settings,
                                  payment: {
                                    ...settings.payment,
                                    methods: {
                                      ...settings.payment.methods,
                                      ewallet: { ...settings.payment.methods.ewallet, providers }
                                    }
                                  }
                                })
                                setHasChanges(true)
                              }}
                            />
                            <span className="text-sm text-foreground">{provider}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Virtual Account */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.payment.methods.virtualAccount.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        payment: {
                          ...settings.payment,
                          methods: {
                            ...settings.payment.methods,
                            virtualAccount: { enabled: e.target.checked, enabled: e.target.checked }
                          }
                        }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Virtual Account</label>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'network':
        return (
          <div className="space-y-6">
            {/* Mikrotik Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Mikrotik Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.network.mikrotik.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        network: {
                          ...settings.network,
                          mikrotik: { ...settings.network.mikrotik, enabled: e.target.checked }
                        }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Aktifkan Mikrotik</label>
                </div>
                {settings.network.mikrotik.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                    <div>
                      <label className="text-sm font-medium text-foreground">Host</label>
                      <Input
                        value={settings.network.mikrotik.host}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              mikrotik: { ...settings.network.mikrotik, host: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Port</label>
                      <Input
                        type="number"
                        value={settings.network.mikrotik.port}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              mikrotik: { ...settings.network.mikrotik, port: parseInt(e.target.value) }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Username</label>
                      <Input
                        value={settings.network.mikrotik.username}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              mikrotik: { ...settings.network.mikrotik, username: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Password</label>
                      <Input
                        type="password"
                        value={settings.network.mikrotik.password}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              mikrotik: { ...settings.network.mikrotik, password: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* RADIUS Settings */}
            <Card>
              <CardHeader>
                <CardTitle>RADIUS Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.network.radius.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        network: {
                          ...settings.network,
                          radius: { ...settings.network.radius, enabled: e.target.checked }
                        }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Aktifkan RADIUS</label>
                </div>
                {settings.network.radius.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                    <div>
                      <label className="text-sm font-medium text-foreground">Host</label>
                      <Input
                        value={settings.network.radius.host}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              radius: { ...settings.network.radius, host: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Port</label>
                      <Input
                        type="number"
                        value={settings.network.radius.port}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              radius: { ...settings.network.radius, port: parseInt(e.target.value) }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Secret</label>
                      <Input
                        type="password"
                        value={settings.network.radius.secret}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            network: {
                              ...settings.network,
                              radius: { ...settings.network.radius, secret: e.target.value }
                            }
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
            {/* Email Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.notifications.email.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          email: { ...settings.notifications.email, enabled: e.target.checked }
                        }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Aktifkan Email</label>
                </div>
                {settings.notifications.email.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                    <div>
                      <label className="text-sm font-medium text-foreground">SMTP Host</label>
                      <Input
                        value={settings.notifications.email.smtpHost}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              email: { ...settings.notifications.email, smtpHost: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">SMTP Port</label>
                      <Input
                        type="number"
                        value={settings.notifications.email.smtpPort}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              email: { ...settings.notifications.email, smtpPort: parseInt(e.target.value) }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Username</label>
                      <Input
                        value={settings.notifications.email.smtpUsername}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              email: { ...settings.notifications.email, smtpUsername: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Password</label>
                      <Input
                        type="password"
                        value={settings.notifications.email.smtpPassword}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              email: { ...settings.notifications.email, smtpPassword: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SMS Settings */}
            <Card>
              <CardHeader>
                <CardTitle>SMS Notifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.notifications.sms.enabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          sms: { ...settings.notifications.sms, enabled: e.target.checked }
                        }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Aktifkan SMS</label>
                </div>
                {settings.notifications.sms.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                    <div>
                      <label className="text-sm font-medium text-foreground">Provider</label>
                      <Input
                        value={settings.notifications.sms.provider}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              sms: { ...settings.notifications.sms, provider: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">API Key</label>
                      <Input
                        type="password"
                        value={settings.notifications.sms.apiKey}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              sms: { ...settings.notifications.sms, apiKey: e.target.value }
                            }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Sender ID</label>
                      <Input
                        value={settings.notifications.sms.senderId}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            notifications: {
                              ...settings.notifications,
                              sms: { ...settings.notifications.sms, senderId: e.target.value }
                            }
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

      case 'security':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Session Timeout (detik)</label>
                    <Input
                      type="number"
                      value={settings.security.sessionTimeout}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          security: { ...settings.security, sessionTimeout: parseInt(e.target.value) }
                        })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Password Minimum Length</label>
                    <Input
                      type="number"
                      value={settings.security.passwordMinLength}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          security: { ...settings.security, passwordMinLength: parseInt(e.target.value) }
                        })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">Max Login Attempts</label>
                    <Input
                      type="number"
                      value={settings.security.loginAttempts}
                      onChange={(e) => {
                        setSettings({
                          ...settings,
                          security: { ...settings.security, loginAttempts: parseInt(e.target.value) }
                        })
                        setHasChanges(true)
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.security.twoFactorEnabled}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        security: { ...settings.security, twoFactorEnabled: e.target.checked }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Two-Factor Authentication</label>
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
                <CardTitle>Backup Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.backup.autoBackup}
                    onChange={(e) => {
                      setSettings({
                        ...settings,
                        backup: { ...settings.backup, autoBackup: e.target.checked }
                      })
                      setHasChanges(true)
                    }}
                  />
                  <label className="text-sm font-medium text-foreground">Auto Backup</label>
                </div>
                {settings.backup.autoBackup && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ml-6">
                    <div>
                      <label className="text-sm font-medium text-foreground">Frequency</label>
                      <select
                        value={settings.backup.backupFrequency}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            backup: { ...settings.backup, backupFrequency: e.target.value }
                          })
                          setHasChanges(true)
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Retention (hari)</label>
                      <Input
                        type="number"
                        value={settings.backup.backupRetention}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            backup: { ...settings.backup, backupRetention: parseInt(e.target.value) }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Backup Location</label>
                      <Input
                        value={settings.backup.backupLocation}
                        onChange={(e) => {
                          setSettings({
                            ...settings,
                            backup: { ...settings.backup, backupLocation: e.target.value }
                          })
                          setHasChanges(true)
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center space-x-2 pt-4 border-t">
                  <Button variant="outline" className="flex items-center space-x-2">
                    <Download className="h-4 w-4" />
                    Download Backup
                  </Button>
                  <Button variant="outline" className="flex items-center space-x-2">
                    <Upload className="h-4 w-4" />
                    Restore Backup
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Pengaturan</h1>
          <div className="flex items-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-2/3"></div>
                  <div className="h-4 bg-muted rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Pengaturan</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading settings</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={fetchSettings}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Pengaturan</h1>
        <div className="flex items-center space-x-2">
          {hasChanges && (
            <span className="text-sm text-warning">Ada perubahan belum disimpan</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="flex items-center space-x-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !hasChanges}
            className="flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            {loading ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </div>

      {/* Settings Navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-sm font-medium">{tab.name}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Settings Content */}
      <div>
        {renderTabContent()}
      </div>
    </div>
  )
}