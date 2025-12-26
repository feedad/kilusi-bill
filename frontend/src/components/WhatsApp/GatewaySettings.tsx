'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    MessageSquare,
    Radio,
    CheckCircle,
    XCircle,
    Loader2,
    RefreshCw,
    TestTube,
    Send,
    Save,
    Eye,
    EyeOff
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import { toast } from 'react-hot-toast'

interface GatewayStatus {
    notificationGateway: string
    gateways: {
        baileys: { enabled: boolean; connected: boolean; type: string; description: string }
        fonnte: { enabled: boolean; configured: boolean; type: string; description: string }
        cloud_api: { enabled: boolean; configured: boolean; type: string; description: string }
    }
    availableTypes: string[]
}

interface GatewaySettings {
    whatsapp_gateway?: {
        notification_gateway: string
        fonnte: {
            enabled: boolean
            api_token: string
            country_code: string
        }
        cloud_api: {
            enabled: boolean
            access_token: string
            phone_number_id: string
            api_version: string
        }
    }
}

export default function WhatsAppGatewaySettings() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null)
    const [testPhone, setTestPhone] = useState('')
    const [testing, setTesting] = useState<string | null>(null)
    const [showTokens, setShowTokens] = useState<Record<string, boolean>>({})

    // Configuration state
    const [config, setConfig] = useState({
        notification_gateway: 'baileys',
        fonnte: {
            enabled: false,
            api_token: '',
            country_code: '62'
        },
        cloud_api: {
            enabled: false,
            access_token: '',
            phone_number_id: '',
            api_version: 'v18.0'
        }
    })
    const [hasChanges, setHasChanges] = useState(false)

    const fetchGatewayStatus = async () => {
        setLoading(true)
        try {
            const response = await adminApi.get('/api/v1/whatsapp/gateways')
            if (response.data.success) {
                setGatewayStatus(response.data.data)
            }
        } catch (error) {
            console.error('Error fetching gateway status:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchSettings = async () => {
        try {
            const response = await adminApi.get('/api/v1/settings')
            if (response.data.success && response.data.data?.settings?.whatsapp_gateway) {
                const waGateway = response.data.data.settings.whatsapp_gateway
                setConfig({
                    notification_gateway: waGateway.notification_gateway || 'baileys',
                    fonnte: {
                        enabled: waGateway.fonnte?.enabled || false,
                        api_token: waGateway.fonnte?.api_token || '',
                        country_code: waGateway.fonnte?.country_code || '62'
                    },
                    cloud_api: {
                        enabled: waGateway.cloud_api?.enabled || false,
                        access_token: waGateway.cloud_api?.access_token || '',
                        phone_number_id: waGateway.cloud_api?.phone_number_id || '',
                        api_version: waGateway.cloud_api?.api_version || 'v18.0'
                    }
                })
            }
        } catch (error) {
            console.error('Error fetching settings:', error)
        }
    }

    const saveSettings = async () => {
        setSaving(true)
        try {
            const response = await adminApi.post('/api/v1/settings', {
                settings: {
                    whatsapp_gateway: config
                }
            })

            if (response.data.success) {
                toast.success('Pengaturan gateway berhasil disimpan')
                setHasChanges(false)
                // Reload gateways to apply new config
                await reloadGateways()
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

    const reloadGateways = async () => {
        try {
            const response = await adminApi.post('/api/v1/whatsapp/gateways/reload')
            if (response.data.success) {
                setGatewayStatus(response.data.data)
                toast.success('Gateway berhasil di-reload')
            }
        } catch (error) {
            console.error('Error reloading gateways:', error)
        }
    }

    const testGateway = async (gateway: string) => {
        if (!testPhone) {
            toast.error('Masukkan nomor telepon untuk test')
            return
        }

        setTesting(gateway)
        try {
            const response = await adminApi.post('/api/v1/whatsapp/gateways/test', {
                gateway,
                phone: testPhone
            })

            if (response.data.success) {
                toast.success(`Test berhasil via ${gateway}`)
            } else {
                toast.error(response.data.message || `Test gagal via ${gateway}`)
            }
        } catch (error: any) {
            console.error('Error testing gateway:', error)
            toast.error(error.response?.data?.message || 'Gagal mengirim test')
        } finally {
            setTesting(null)
        }
    }

    const toggleShowToken = (key: string) => {
        setShowTokens(prev => ({ ...prev, [key]: !prev[key] }))
    }

    useEffect(() => {
        fetchGatewayStatus()
        fetchSettings()
    }, [])

    if (loading && !gatewayStatus) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Gateway Status Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Radio className="h-5 w-5" />
                            <CardTitle>Status Gateway</CardTitle>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={reloadGateways}
                            disabled={loading}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                            Reload
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Active Notification Gateway */}
                    <div className="p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Gateway Notifikasi Aktif:</span>
                            <Badge variant="default" className="uppercase">
                                {gatewayStatus?.notificationGateway || 'baileys'}
                            </Badge>
                        </div>
                    </div>

                    {/* Gateways Status List */}
                    <div className="grid gap-3">
                        {/* Baileys */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                                <MessageSquare className="h-6 w-6 text-green-600" />
                                <div>
                                    <span className="font-medium">Baileys</span>
                                    <p className="text-xs text-muted-foreground">Chat interaktif</p>
                                </div>
                            </div>
                            {gatewayStatus?.gateways.baileys.connected ? (
                                <Badge variant="default" className="bg-green-600">Connected</Badge>
                            ) : (
                                <Badge variant="secondary">Disconnected</Badge>
                            )}
                        </div>

                        {/* Fonnte */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                                <Send className="h-6 w-6 text-blue-600" />
                                <div>
                                    <span className="font-medium">Fonnte</span>
                                    <p className="text-xs text-muted-foreground">API notifikasi</p>
                                </div>
                            </div>
                            {config.fonnte.enabled && config.fonnte.api_token ? (
                                <Badge variant="default" className="bg-blue-600">Configured</Badge>
                            ) : (
                                <Badge variant="secondary">Not Configured</Badge>
                            )}
                        </div>

                        {/* Cloud API */}
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                                <MessageSquare className="h-6 w-6 text-purple-600" />
                                <div>
                                    <span className="font-medium">Cloud API</span>
                                    <p className="text-xs text-muted-foreground">Official Meta API</p>
                                </div>
                            </div>
                            {config.cloud_api.enabled && config.cloud_api.access_token ? (
                                <Badge variant="default" className="bg-purple-600">Configured</Badge>
                            ) : (
                                <Badge variant="secondary">Not Configured</Badge>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Gateway Selection */}
            <Card>
                <CardHeader>
                    <CardTitle>Gateway Notifikasi</CardTitle>
                </CardHeader>
                <CardContent>
                    <div>
                        <label className="text-sm font-medium">Gateway untuk Notifikasi Otomatis</label>
                        <select
                            value={config.notification_gateway}
                            onChange={(e) => {
                                setConfig({ ...config, notification_gateway: e.target.value })
                                setHasChanges(true)
                            }}
                            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="baileys">Baileys (Default)</option>
                            <option value="fonnte">Fonnte</option>
                            <option value="cloud_api">WhatsApp Cloud API</option>
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                            Gateway ini akan digunakan untuk mengirim notifikasi billing, payment, dll.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Fonnte Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Send className="h-5 w-5 text-blue-600" />
                            Fonnte Configuration
                        </span>
                        {config.fonnte.enabled ? (
                            <Badge variant="default" className="bg-blue-600">Aktif</Badge>
                        ) : (
                            <Badge variant="secondary">Nonaktif</Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={config.fonnte.enabled}
                            onChange={(e) => {
                                setConfig({
                                    ...config,
                                    fonnte: { ...config.fonnte, enabled: e.target.checked }
                                })
                                setHasChanges(true)
                            }}
                        />
                        <label className="text-sm font-medium">Aktifkan Fonnte</label>
                    </div>

                    {config.fonnte.enabled && (
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                            <div>
                                <label className="text-sm font-medium">API Token</label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        type={showTokens.fonnte ? 'text' : 'password'}
                                        value={config.fonnte.api_token}
                                        onChange={(e) => {
                                            setConfig({
                                                ...config,
                                                fonnte: { ...config.fonnte, api_token: e.target.value }
                                            })
                                            setHasChanges(true)
                                        }}
                                        placeholder="Token dari dashboard Fonnte"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => toggleShowToken('fonnte')}
                                    >
                                        {showTokens.fonnte ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Country Code</label>
                                <Input
                                    value={config.fonnte.country_code}
                                    onChange={(e) => {
                                        setConfig({
                                            ...config,
                                            fonnte: { ...config.fonnte, country_code: e.target.value }
                                        })
                                        setHasChanges(true)
                                    }}
                                    placeholder="62"
                                    className="w-24"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Dapatkan API Token di <a href="https://fonnte.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">fonnte.com</a>
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cloud API Configuration */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <MessageSquare className="h-5 w-5 text-purple-600" />
                            WhatsApp Cloud API
                        </span>
                        {config.cloud_api.enabled ? (
                            <Badge variant="default" className="bg-purple-600">Aktif</Badge>
                        ) : (
                            <Badge variant="secondary">Nonaktif</Badge>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={config.cloud_api.enabled}
                            onChange={(e) => {
                                setConfig({
                                    ...config,
                                    cloud_api: { ...config.cloud_api, enabled: e.target.checked }
                                })
                                setHasChanges(true)
                            }}
                        />
                        <label className="text-sm font-medium">Aktifkan Cloud API</label>
                    </div>

                    {config.cloud_api.enabled && (
                        <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                            <div>
                                <label className="text-sm font-medium">Access Token</label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        type={showTokens.cloud_api ? 'text' : 'password'}
                                        value={config.cloud_api.access_token}
                                        onChange={(e) => {
                                            setConfig({
                                                ...config,
                                                cloud_api: { ...config.cloud_api, access_token: e.target.value }
                                            })
                                            setHasChanges(true)
                                        }}
                                        placeholder="Access token dari Meta Developer"
                                    />
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => toggleShowToken('cloud_api')}
                                    >
                                        {showTokens.cloud_api ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Phone Number ID</label>
                                <Input
                                    value={config.cloud_api.phone_number_id}
                                    onChange={(e) => {
                                        setConfig({
                                            ...config,
                                            cloud_api: { ...config.cloud_api, phone_number_id: e.target.value }
                                        })
                                        setHasChanges(true)
                                    }}
                                    placeholder="ID Phone Number dari Meta"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">API Version</label>
                                <Input
                                    value={config.cloud_api.api_version}
                                    onChange={(e) => {
                                        setConfig({
                                            ...config,
                                            cloud_api: { ...config.cloud_api, api_version: e.target.value }
                                        })
                                        setHasChanges(true)
                                    }}
                                    placeholder="v18.0"
                                    className="w-24"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Dapatkan credentials di <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Meta Developer Portal</a>
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Save Button */}
            {hasChanges && (
                <Card className="border-primary">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                Ada perubahan yang belum disimpan
                            </p>
                            <Button onClick={saveSettings} disabled={saving}>
                                {saving ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                )}
                                Simpan Pengaturan
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Test Gateway */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TestTube className="h-5 w-5" />
                        Test Gateway
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Nomor Telepon Test</label>
                        <Input
                            placeholder="628xxxxxxxxxx"
                            value={testPhone}
                            onChange={(e) => setTestPhone(e.target.value)}
                            className="mt-1"
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testGateway('baileys')}
                            disabled={testing === 'baileys' || !gatewayStatus?.gateways.baileys.connected}
                        >
                            {testing === 'baileys' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Test Baileys
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testGateway('fonnte')}
                            disabled={testing === 'fonnte' || !config.fonnte.enabled || !config.fonnte.api_token}
                        >
                            {testing === 'fonnte' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Test Fonnte
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => testGateway('cloud_api')}
                            disabled={testing === 'cloud_api' || !config.cloud_api.enabled || !config.cloud_api.access_token}
                        >
                            {testing === 'cloud_api' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Test Cloud API
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
