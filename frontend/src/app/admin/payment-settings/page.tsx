'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    CreditCard,
    Wallet,
    Building2,
    Smartphone,
    Plus,
    Trash2,
    Edit,
    Save,
    X,
    CheckCircle,
    XCircle,
    Loader2,
    Copy,
    Check
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import { toast } from 'react-hot-toast'

// Types
interface BankAccount {
    id: string
    bankName: string
    accountNumber: string
    accountName: string
    isActive: boolean
}

interface EWallet {
    id: string
    provider: string
    phoneNumber: string
    accountName: string
    isActive: boolean
}

interface PaymentGateway {
    active: string
    tripay: {
        enabled: boolean
        production: boolean
        apiKey: string
        privateKey: string
        merchantCode: string
    }
    midtrans: {
        enabled: boolean
        production: boolean
        serverKey: string
        clientKey: string
    }
    xendit: {
        enabled: boolean
        production: boolean
        apiKey: string
        callbackToken: string
    }
}

// E-Wallet providers
const EWALLET_PROVIDERS = [
    { value: 'gopay', label: 'GoPay' },
    { value: 'ovo', label: 'OVO' },
    { value: 'dana', label: 'DANA' },
    { value: 'shopeepay', label: 'ShopeePay' },
    { value: 'linkaja', label: 'LinkAja' },
    { value: 'qris', label: 'QRIS' },
]

// Bank list
const BANK_LIST = [
    'BCA', 'BNI', 'BRI', 'Mandiri', 'BSI', 'CIMB Niaga', 'BTN',
    'Permata', 'Danamon', 'Maybank', 'OCBC NISP', 'Panin', 'Bank Jago',
    'Jenius', 'SeaBank', 'Blu by BCA', 'Lainnya'
]

export default function PaymentSettingsPage() {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)
    const [activeTab, setActiveTab] = useState('accounts')
    const [copied, setCopied] = useState<string | null>(null)

    // State for bank accounts
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
    const [editingBank, setEditingBank] = useState<BankAccount | null>(null)
    const [showBankForm, setShowBankForm] = useState(false)
    const [bankForm, setBankForm] = useState<Partial<BankAccount>>({
        bankName: '',
        accountNumber: '',
        accountName: '',
        isActive: true
    })

    // State for e-wallets
    const [eWallets, setEWallets] = useState<EWallet[]>([])
    const [editingWallet, setEditingWallet] = useState<EWallet | null>(null)
    const [showWalletForm, setShowWalletForm] = useState(false)
    const [walletForm, setWalletForm] = useState<Partial<EWallet>>({
        provider: '',
        phoneNumber: '',
        accountName: '',
        isActive: true
    })

    // State for payment gateway
    const [gateway, setGateway] = useState<PaymentGateway>({
        active: '',
        tripay: { enabled: false, production: false, apiKey: '', privateKey: '', merchantCode: '' },
        midtrans: { enabled: false, production: false, serverKey: '', clientKey: '' },
        xendit: { enabled: false, production: false, apiKey: '', callbackToken: '' }
    })

    // Fetch settings
    const fetchSettings = async () => {
        setLoading(true)
        try {
            const response = await adminApi.get('/api/v1/settings')
            if (response.data.success) {
                const settings = response.data.data?.settings || {}

                // Load payment settings
                if (settings.payment_settings) {
                    setBankAccounts(settings.payment_settings.bank_accounts || [])
                    setEWallets(settings.payment_settings.ewallets || [])
                }

                // Load gateway settings
                if (settings.paymentGateway || settings.payment_gateway) {
                    const gw = settings.paymentGateway || settings.payment_gateway
                    setGateway({
                        active: gw.active || '',
                        tripay: { ...gateway.tripay, ...gw.tripay },
                        midtrans: { ...gateway.midtrans, ...gw.midtrans },
                        xendit: { ...gateway.xendit, ...gw.xendit }
                    })
                }
            }
        } catch (error) {
            console.error('Error fetching settings:', error)
            toast.error('Gagal memuat pengaturan')
        } finally {
            setLoading(false)
        }
    }

    // Save all settings
    const saveSettings = async () => {
        setSaving(true)
        try {
            const response = await adminApi.post('/api/v1/settings', {
                settings: {
                    payment_settings: {
                        bank_accounts: bankAccounts,
                        ewallets: eWallets
                    },
                    paymentGateway: gateway
                }
            })

            if (response.data.success) {
                toast.success('Pengaturan pembayaran berhasil disimpan')
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

    // Bank Account CRUD
    const addBankAccount = () => {
        if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.accountName) {
            toast.error('Lengkapi semua field')
            return
        }

        const newAccount: BankAccount = {
            id: editingBank?.id || Date.now().toString(),
            bankName: bankForm.bankName,
            accountNumber: bankForm.accountNumber,
            accountName: bankForm.accountName,
            isActive: bankForm.isActive ?? true
        }

        if (editingBank) {
            setBankAccounts(prev => prev.map(a => a.id === editingBank.id ? newAccount : a))
        } else {
            setBankAccounts(prev => [...prev, newAccount])
        }

        setBankForm({ bankName: '', accountNumber: '', accountName: '', isActive: true })
        setShowBankForm(false)
        setEditingBank(null)
        setHasChanges(true)
    }

    const deleteBankAccount = (id: string) => {
        if (confirm('Hapus akun bank ini?')) {
            setBankAccounts(prev => prev.filter(a => a.id !== id))
            setHasChanges(true)
        }
    }

    const editBankAccount = (account: BankAccount) => {
        setEditingBank(account)
        setBankForm(account)
        setShowBankForm(true)
    }

    // E-Wallet CRUD
    const addEWallet = () => {
        if (!walletForm.provider || !walletForm.phoneNumber || !walletForm.accountName) {
            toast.error('Lengkapi semua field')
            return
        }

        const newWallet: EWallet = {
            id: editingWallet?.id || Date.now().toString(),
            provider: walletForm.provider,
            phoneNumber: walletForm.phoneNumber,
            accountName: walletForm.accountName,
            isActive: walletForm.isActive ?? true
        }

        if (editingWallet) {
            setEWallets(prev => prev.map(w => w.id === editingWallet.id ? newWallet : w))
        } else {
            setEWallets(prev => [...prev, newWallet])
        }

        setWalletForm({ provider: '', phoneNumber: '', accountName: '', isActive: true })
        setShowWalletForm(false)
        setEditingWallet(null)
        setHasChanges(true)
    }

    const deleteEWallet = (id: string) => {
        if (confirm('Hapus e-wallet ini?')) {
            setEWallets(prev => prev.filter(w => w.id !== id))
            setHasChanges(true)
        }
    }

    const editEWallet = (wallet: EWallet) => {
        setEditingWallet(wallet)
        setWalletForm(wallet)
        setShowWalletForm(true)
    }

    // Copy to clipboard
    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text)
        setCopied(id)
        setTimeout(() => setCopied(null), 2000)
    }

    useEffect(() => {
        fetchSettings()
    }, [])

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
                        <CreditCard className="h-8 w-8" />
                        Setting Pembayaran
                    </h1>
                    <p className="text-muted-foreground">
                        Kelola akun bank, e-wallet, dan payment gateway
                    </p>
                </div>
                {hasChanges && (
                    <Button onClick={saveSettings} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Simpan Perubahan
                    </Button>
                )}
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="accounts" className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Akun Bank
                    </TabsTrigger>
                    <TabsTrigger value="ewallet" className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        E-Wallet
                    </TabsTrigger>
                    <TabsTrigger value="gateway" className="flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        Payment Gateway
                    </TabsTrigger>
                </TabsList>

                {/* Bank Accounts Tab */}
                <TabsContent value="accounts" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2">
                                    <Building2 className="h-5 w-5" />
                                    Akun Bank
                                </CardTitle>
                                <Button size="sm" onClick={() => { setShowBankForm(true); setEditingBank(null); setBankForm({ bankName: '', accountNumber: '', accountName: '', isActive: true }); }}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Tambah Akun
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Bank Form */}
                            {showBankForm && (
                                <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                                    <h4 className="font-medium">{editingBank ? 'Edit' : 'Tambah'} Akun Bank</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-sm font-medium">Nama Bank</label>
                                            <select
                                                value={bankForm.bankName}
                                                onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                                                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            >
                                                <option value="">Pilih Bank</option>
                                                {BANK_LIST.map(bank => (
                                                    <option key={bank} value={bank}>{bank}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium">Nomor Rekening</label>
                                            <Input
                                                value={bankForm.accountNumber}
                                                onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                                                placeholder="1234567890"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium">Atas Nama</label>
                                            <Input
                                                value={bankForm.accountName}
                                                onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                                                placeholder="Nama pemilik rekening"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={bankForm.isActive}
                                            onChange={(e) => setBankForm({ ...bankForm, isActive: e.target.checked })}
                                        />
                                        <label className="text-sm">Aktif</label>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={addBankAccount}>
                                            <Save className="h-4 w-4 mr-2" />
                                            Simpan
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => { setShowBankForm(false); setEditingBank(null); }}>
                                            <X className="h-4 w-4 mr-2" />
                                            Batal
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Bank List */}
                            {bankAccounts.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Belum ada akun bank. Klik &quot;Tambah Akun&quot; untuk menambahkan.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {bankAccounts.map((account) => (
                                        <div key={account.id} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="flex items-center gap-4">
                                                <Building2 className="h-8 w-8 text-blue-600" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{account.bankName}</span>
                                                        {account.isActive ? (
                                                            <Badge variant="default" className="bg-green-600">Aktif</Badge>
                                                        ) : (
                                                            <Badge variant="secondary">Nonaktif</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {account.accountNumber} • a.n {account.accountName}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button size="icon" variant="ghost" onClick={() => copyToClipboard(account.accountNumber, account.id)}>
                                                    {copied === account.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => editBankAccount(account)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => deleteBankAccount(account.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* E-Wallet Tab */}
                <TabsContent value="ewallet" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2">
                                    <Smartphone className="h-5 w-5" />
                                    E-Wallet
                                </CardTitle>
                                <Button size="sm" onClick={() => { setShowWalletForm(true); setEditingWallet(null); setWalletForm({ provider: '', phoneNumber: '', accountName: '', isActive: true }); }}>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Tambah E-Wallet
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* E-Wallet Form */}
                            {showWalletForm && (
                                <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                                    <h4 className="font-medium">{editingWallet ? 'Edit' : 'Tambah'} E-Wallet</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-sm font-medium">Provider</label>
                                            <select
                                                value={walletForm.provider}
                                                onChange={(e) => setWalletForm({ ...walletForm, provider: e.target.value })}
                                                className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            >
                                                <option value="">Pilih Provider</option>
                                                {EWALLET_PROVIDERS.map(p => (
                                                    <option key={p.value} value={p.value}>{p.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium">Nomor HP/ID</label>
                                            <Input
                                                value={walletForm.phoneNumber}
                                                onChange={(e) => setWalletForm({ ...walletForm, phoneNumber: e.target.value })}
                                                placeholder="08xxxxxxxxxx"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium">Atas Nama</label>
                                            <Input
                                                value={walletForm.accountName}
                                                onChange={(e) => setWalletForm({ ...walletForm, accountName: e.target.value })}
                                                placeholder="Nama akun"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={walletForm.isActive}
                                            onChange={(e) => setWalletForm({ ...walletForm, isActive: e.target.checked })}
                                        />
                                        <label className="text-sm">Aktif</label>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={addEWallet}>
                                            <Save className="h-4 w-4 mr-2" />
                                            Simpan
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => { setShowWalletForm(false); setEditingWallet(null); }}>
                                            <X className="h-4 w-4 mr-2" />
                                            Batal
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* E-Wallet List */}
                            {eWallets.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Belum ada e-wallet. Klik &quot;Tambah E-Wallet&quot; untuk menambahkan.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {eWallets.map((wallet) => (
                                        <div key={wallet.id} className="flex items-center justify-between p-4 border rounded-lg">
                                            <div className="flex items-center gap-4">
                                                <Smartphone className="h-8 w-8 text-green-600" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">
                                                            {EWALLET_PROVIDERS.find(p => p.value === wallet.provider)?.label || wallet.provider}
                                                        </span>
                                                        {wallet.isActive ? (
                                                            <Badge variant="default" className="bg-green-600">Aktif</Badge>
                                                        ) : (
                                                            <Badge variant="secondary">Nonaktif</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        {wallet.phoneNumber} • a.n {wallet.accountName}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button size="icon" variant="ghost" onClick={() => copyToClipboard(wallet.phoneNumber, wallet.id)}>
                                                    {copied === wallet.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => editEWallet(wallet)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => deleteEWallet(wallet.id)}>
                                                    <Trash2 className="h-4 w-4 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Payment Gateway Tab */}
                <TabsContent value="gateway" className="space-y-4">
                    {/* Active Gateway Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wallet className you="h-5 w-5" />
                                Gateway Aktif
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div>
                                <label className="text-sm font-medium">Pilih Payment Gateway</label>
                                <select
                                    value={gateway.active}
                                    onChange={(e) => { setGateway({ ...gateway, active: e.target.value }); setHasChanges(true); }}
                                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="">Tidak Ada (Manual)</option>
                                    <option value="tripay">Tripay</option>
                                    <option value="midtrans">Midtrans</option>
                                    <option value="xendit">Xendit</option>
                                </select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Tripay */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Tripay</span>
                                {gateway.tripay.enabled ? (
                                    <Badge variant="default" className="bg-green-600">Aktif</Badge>
                                ) : (
                                    <Badge variant="secondary">Nonaktif</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={gateway.tripay.enabled}
                                        onChange={(e) => { setGateway({ ...gateway, tripay: { ...gateway.tripay, enabled: e.target.checked } }); setHasChanges(true); }}
                                    />
                                    <label className="text-sm font-medium">Aktifkan Tripay</label>
                                </div>
                                <select
                                    value={gateway.tripay.production ? 'production' : 'sandbox'}
                                    onChange={(e) => { setGateway({ ...gateway, tripay: { ...gateway.tripay, production: e.target.value === 'production' } }); setHasChanges(true); }}
                                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                                >
                                    <option value="sandbox">Sandbox</option>
                                    <option value="production">Production</option>
                                </select>
                            </div>
                            {gateway.tripay.enabled && (
                                <div className="grid grid-cols-1 gap-4 p-4 bg-muted/30 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium">Merchant Code</label>
                                        <Input value={gateway.tripay.merchantCode} onChange={(e) => { setGateway({ ...gateway, tripay: { ...gateway.tripay, merchantCode: e.target.value } }); setHasChanges(true); }} placeholder="T12345" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">API Key</label>
                                        <Input type="password" value={gateway.tripay.apiKey} onChange={(e) => { setGateway({ ...gateway, tripay: { ...gateway.tripay, apiKey: e.target.value } }); setHasChanges(true); }} placeholder="DEV-xxx atau PROD-xxx" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Private Key</label>
                                        <Input type="password" value={gateway.tripay.privateKey} onChange={(e) => { setGateway({ ...gateway, tripay: { ...gateway.tripay, privateKey: e.target.value } }); setHasChanges(true); }} placeholder="xxxxxx-xxxxx-xxxxx" />
                                    </div>
                                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">📌 Callback URL</p>
                                        <code className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded block break-all mt-1">
                                            {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/payments/callback/tripay` : '/api/v1/payments/callback/tripay'}
                                        </code>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Midtrans */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Midtrans</span>
                                {gateway.midtrans.enabled ? (
                                    <Badge variant="default" className="bg-green-600">Aktif</Badge>
                                ) : (
                                    <Badge variant="secondary">Nonaktif</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={gateway.midtrans.enabled}
                                        onChange={(e) => { setGateway({ ...gateway, midtrans: { ...gateway.midtrans, enabled: e.target.checked } }); setHasChanges(true); }}
                                    />
                                    <label className="text-sm font-medium">Aktifkan Midtrans</label>
                                </div>
                                <select
                                    value={gateway.midtrans.production ? 'production' : 'sandbox'}
                                    onChange={(e) => { setGateway({ ...gateway, midtrans: { ...gateway.midtrans, production: e.target.value === 'production' } }); setHasChanges(true); }}
                                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                                >
                                    <option value="sandbox">Sandbox</option>
                                    <option value="production">Production</option>
                                </select>
                            </div>
                            {gateway.midtrans.enabled && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium">Server Key</label>
                                        <Input type="password" value={gateway.midtrans.serverKey} onChange={(e) => { setGateway({ ...gateway, midtrans: { ...gateway.midtrans, serverKey: e.target.value } }); setHasChanges(true); }} placeholder="SB-Mid-server-xxx" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Client Key</label>
                                        <Input type="password" value={gateway.midtrans.clientKey} onChange={(e) => { setGateway({ ...gateway, midtrans: { ...gateway.midtrans, clientKey: e.target.value } }); setHasChanges(true); }} placeholder="SB-Mid-client-xxx" />
                                    </div>
                                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg col-span-2">
                                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">📌 Callback URL</p>
                                        <code className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded block break-all mt-1">
                                            {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/payments/callback/midtrans` : '/api/v1/payments/callback/midtrans'}
                                        </code>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Xendit */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Xendit</span>
                                {gateway.xendit.enabled ? (
                                    <Badge variant="default" className="bg-green-600">Aktif</Badge>
                                ) : (
                                    <Badge variant="secondary">Nonaktif</Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={gateway.xendit.enabled}
                                        onChange={(e) => { setGateway({ ...gateway, xendit: { ...gateway.xendit, enabled: e.target.checked } }); setHasChanges(true); }}
                                    />
                                    <label className="text-sm font-medium">Aktifkan Xendit</label>
                                </div>
                                <select
                                    value={gateway.xendit.production ? 'production' : 'sandbox'}
                                    onChange={(e) => { setGateway({ ...gateway, xendit: { ...gateway.xendit, production: e.target.value === 'production' } }); setHasChanges(true); }}
                                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                                >
                                    <option value="sandbox">Sandbox</option>
                                    <option value="production">Production</option>
                                </select>
                            </div>
                            {gateway.xendit.enabled && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                                    <div>
                                        <label className="text-sm font-medium">API Key</label>
                                        <Input type="password" value={gateway.xendit.apiKey} onChange={(e) => { setGateway({ ...gateway, xendit: { ...gateway.xendit, apiKey: e.target.value } }); setHasChanges(true); }} placeholder="xnd_development_xxx" />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium">Callback Token</label>
                                        <Input type="password" value={gateway.xendit.callbackToken} onChange={(e) => { setGateway({ ...gateway, xendit: { ...gateway.xendit, callbackToken: e.target.value } }); setHasChanges(true); }} placeholder="Verification token" />
                                    </div>
                                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg col-span-2">
                                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">📌 Callback URL</p>
                                        <code className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded block break-all mt-1">
                                            {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/payments/callback/xendit` : '/api/v1/payments/callback/xendit'}
                                        </code>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    )
}
