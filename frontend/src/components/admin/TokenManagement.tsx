'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Copy, RefreshCw, Trash2, Eye, Users, Link, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface TokenStats {
    totalCustomers: number
    activeTokens: number
    expiredTokens: number
    noTokens: number
    tokenCoverage: string
}

interface Customer {
    id: number
    name: string
    phone: string
    username?: string
    status: string
    hasToken: boolean
    isExpired: boolean
    tokenStatus: 'active' | 'expired' | 'none'
    loginUrl?: string
    daysUntilExpiry?: number
}

interface TokenData {
    token: string
    customerId: number
    expiresAt: Date
    loginUrl: string
    customer: {
        id: number
        name: string
        phone: string
        status: string
    }
}

export default function TokenManagement() {
    const [stats, setStats] = useState<TokenStats>({
        totalCustomers: 0,
        activeTokens: 0,
        expiredTokens: 0,
        noTokens: 0,
        tokenCoverage: '0'
    })

    const [customers, setCustomers] = useState<Customer[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [tokenDialog, setTokenDialog] = useState(false)
    const [generatingToken, setGeneratingToken] = useState(false)

    // Fetch initial data
    useEffect(() => {
        fetchStats()
        fetchCustomers()
    }, [])

    const fetchStats = async () => {
        try {
            const response = await fetch('/admin/token-management/api/stats')
            const data = await response.json()
            setStats(data)
        } catch (error) {
            toast.error('Failed to fetch token statistics')
            console.error('Stats fetch error:', error)
        }
    }

    const fetchCustomers = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                search: searchTerm,
                status: statusFilter
            })

            const response = await fetch(`/admin/token-management/api/customers?${params}`)
            const data = await response.json()

            setCustomers(data.customers)
            setTotalPages(data.pagination.totalPages)
        } catch (error) {
            toast.error('Failed to fetch customers')
            console.error('Customers fetch error:', error)
        } finally {
            setLoading(false)
        }
    }

    // Refresh data
    const handleRefresh = () => {
        fetchStats()
        fetchCustomers()
    }

    // Generate token for customer
    const handleGenerateToken = async (customerId: number, customerName: string, regenerate = false) => {
        setGeneratingToken(true)
        try {
            const response = await fetch(`/admin/token-management/api/customers/${customerId}/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    expiresIn: '30d',
                    regenerate
                })
            })

            const data = await response.json()

            if (data.success) {
                toast.success(`✅ Token berhasil ${regenerate ? 'diperbarui' : 'dibuat'} untuk ${customerName}`)
                showTokenModal(data.data)
                fetchCustomers()
                fetchStats()
            } else {
                toast.error(`❌ ${data.error}`)
            }
        } catch (error) {
            toast.error('❌ Terjadi kesalahan')
            console.error('Generate token error:', error)
        } finally {
            setGeneratingToken(false)
        }
    }

    // Deactivate token
    const handleDeactivateToken = async (customerId: number, customerName: string) => {
        if (!confirm(`Deactivate token untuk ${customerName}?`)) {
            return
        }

        try {
            const response = await fetch(`/admin/token-management/api/customers/${customerId}/deactivate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (data.success) {
                toast.success(`✅ Token berhasil dinonaktifkan untuk ${customerName}`)
                fetchCustomers()
                fetchStats()
            } else {
                toast.error(`❌ ${data.error}`)
            }
        } catch (error) {
            toast.error('❌ Terjadi kesalahan')
            console.error('Deactivate token error:', error)
        }
    }

    // Copy to clipboard
    const handleCopyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success('✅ Link berhasil disalin!')
        } catch (error) {
            toast.error('❌ Gagal menyalin link')
        }
    }

    // Show token modal
    const showTokenModal = (tokenData: TokenData) => {
        setSelectedCustomer({
            id: tokenData.customer.id,
            name: tokenData.customer.name,
            phone: tokenData.customer.phone,
            status: tokenData.customer.status,
            hasToken: true,
            isExpired: false,
            tokenStatus: 'active',
            loginUrl: tokenData.loginUrl
        })
        setTokenDialog(true)
    }

    // Send WhatsApp with token
    const handleSendWhatsApp = (customer: Customer) => {
        if (!customer.loginUrl) return

        const message = `🔑 *Akses Portal Pelanggan*\n\n` +
                       `Yth. Bapak/Ibu ${customer.name},\n\n` +
                       `Link akses dashboard:\n${customer.loginUrl}\n\n` +
                       `Fitur portal:\n✅ Lihat tagihan\n✅ Kelola WiFi\n✅ Restart perangkat\n✅ Lapor gangguan\n\n` +
                       `Link berlaku 30 hari.`

        const encodedMessage = encodeURIComponent(message)
        const adminNumber = '6281947215703' // Replace with actual admin number
        const whatsappUrl = `https://wa.me/${adminNumber}?text=${encodedMessage}`

        window.open(whatsappUrl, '_blank')
    }

    // Bulk operations
    const handleBulkGenerate = async () => {
        if (!confirm('Generate tokens untuk semua pelanggan?')) {
            return
        }

        try {
            const response = await fetch('/admin/token-management/api/bulk-generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (data.success) {
                toast.success(`✅ ${data.data.totalSuccess} token berhasil dibuat`)
                fetchCustomers()
                fetchStats()
            } else {
                toast.error(`❌ ${data.error}`)
            }
        } catch (error) {
            toast.error('❌ Terjadi kesalahan')
            console.error('Bulk generate error:', error)
        }
    }

    const handleCleanupTokens = async () => {
        if (!confirm('Hapus semua token kadaluarsa?')) {
            return
        }

        try {
            const response = await fetch('/admin/token-management/api/cleanup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            const data = await response.json()

            if (data.success) {
                toast.success(`✅ ${data.data.cleanedTokens} token kadaluarsa dibersihkan`)
                fetchCustomers()
                fetchStats()
            } else {
                toast.error(`❌ ${data.error}`)
            }
        } catch (error) {
            toast.error('❌ Terjadi kesalahan')
            console.error('Cleanup error:', error)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Aktif</Badge>
            case 'expired':
                return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />Kadaluarsa</Badge>
            case 'none':
                return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />None</Badge>
            default:
                return <Badge variant="secondary">{status}</Badge>
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">🔑 Token Management</h1>
                    <p className="text-muted-foreground">Kelola token akses portal pelanggan</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleRefresh} variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    <Button onClick={() => window.open('/admin/token-management/customers', '_blank')}>
                        <Users className="w-4 h-4 mr-2" />
                        Lihat Semua
                    </Button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{stats.totalCustomers}</div>
                        <p className="text-muted-foreground">Total Pelanggan</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-green-600">{stats.activeTokens}</div>
                        <p className="text-muted-foreground">Token Aktif</p>
                        <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                            <div
                                className="bg-green-600 h-1 rounded-full"
                                style={{ width: `${stats.tokenCoverage}%` }}
                            ></div>
                        </div>
                        <small className="text-muted-foreground">{stats.tokenCoverage}% coverage</small>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-orange-600">{stats.expiredTokens}</div>
                        <p className="text-muted-foreground">Token Kadaluarsa</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-2xl font-bold text-gray-600">{stats.noTokens}</div>
                        <p className="text-muted-foreground">Belum Ada Token</p>
                    </CardContent>
                </Card>
            </div>

            {/* Search and Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Cari Pelanggan</label>
                            <Input
                                placeholder="Nama, No. HP, atau Username"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">Status Token</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="">Semua</option>
                                <option value="active">Aktif</option>
                                <option value="expired">Kadaluarsa</option>
                                <option value="none">Belum Ada</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">&nbsp;</label>
                            <Button onClick={fetchCustomers} className="w-full">
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Filter
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
                <CardContent className="pt-6">
                    <h3 className="font-semibold mb-4">🚀 Aksi Cepat</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Button onClick={handleBulkGenerate} variant="default">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Bulk Generate
                        </Button>
                        <Button onClick={handleCleanupTokens} variant="outline">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Cleanup Token
                        </Button>
                        <Button
                            onClick={() => window.open('/admin/token-management/export', '_blank')}
                            variant="outline"
                        >
                            <Copy className="w-4 h-4 mr-2" />
                            Export CSV
                        </Button>
                        <Button
                            onClick={() => window.open('/admin/token-management/whatsapp-billing', '_blank')}
                            variant="outline"
                        >
                            <Link className="w-4 h-4 mr-2" />
                            WhatsApp Billing
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Customer Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Pelanggan dan Token</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8">
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
                            <p>Loading...</p>
                        </div>
                    ) : customers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p>Tidak ada pelanggan yang ditemukan</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Pelanggan</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Token Status</TableHead>
                                    <TableHead>Login URL</TableHead>
                                    <TableHead>Kadaluarsa</TableHead>
                                    <TableHead className="text-center">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customers.map((customer) => (
                                    <TableRow key={customer.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{customer.name || 'Tanpa Nama'}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {customer.phone}
                                                    {customer.username && ` • ${customer.username}`}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={customer.status === 'active' ? 'bg-green-500' : 'bg-gray-500'}>
                                                {customer.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(customer.tokenStatus)}
                                        </TableCell>
                                        <TableCell>
                                            {customer.loginUrl ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="text-xs font-mono truncate max-w-[200px]" title={customer.loginUrl}>
                                                        {customer.loginUrl}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleCopyToClipboard(customer.loginUrl!)}
                                                    >
                                                        <Copy className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {customer.daysUntilExpiry !== null ? (
                                                customer.daysUntilExpiry > 0 ? (
                                                    <span className="text-green-600">
                                                        {customer.daysUntilExpiry} hari lagi
                                                    </span>
                                                ) : (
                                                    <span className="text-red-600">
                                                        Kadaluarsa
                                                    </span>
                                                )
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-1">
                                                {customer.hasToken ? (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => showTokenModal({
                                                                token: '',
                                                                customerId: customer.id,
                                                                expiresAt: new Date(),
                                                                loginUrl: customer.loginUrl!,
                                                                customer: {
                                                                    id: customer.id,
                                                                    name: customer.name,
                                                                    phone: customer.phone,
                                                                    status: customer.status
                                                                }
                                                            })}
                                                        >
                                                            <Eye className="w-3 h-3" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleGenerateToken(customer.id, customer.name, true)}
                                                        >
                                                            <RefreshCw className="w-3 h-3" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleDeactivateToken(customer.id, customer.name)}
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleGenerateToken(customer.id, customer.name)}
                                                        disabled={generatingToken}
                                                    >
                                                        <RefreshCw className="w-3 h-3 mr-1" />
                                                        Generate
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-4">
                            <Button
                                variant="outline"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(currentPage - 1)}
                            >
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                Page {currentPage} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(currentPage + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Token Modal */}
            <Dialog open={tokenDialog} onOpenChange={setTokenDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Token Details</DialogTitle>
                    </DialogHeader>
                    {selectedCustomer && (
                        <div className="space-y-4">
                            <div className="text-center">
                                <h6 className="mb-2">Token untuk: <strong>{selectedCustomer.name}</strong></h6>
                            </div>

                            <div className="bg-blue-50 p-4 rounded-lg">
                                <h5 className="mb-3 text-center">Login URL</h5>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        className="flex-1 px-3 py-2 border rounded text-xs font-mono"
                                        value={selectedCustomer.loginUrl}
                                        readOnly
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => handleCopyToClipboard(selectedCustomer.loginUrl!)}
                                    >
                                        <Copy className="w-3 h-3" />
                                    </Button>
                                </div>
                                <div className="mt-2 text-center text-sm text-muted-foreground">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    Berlaku 30 hari
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    onClick={() => window.open(selectedCustomer.loginUrl, '_blank')}
                                    className="w-full"
                                >
                                    <Eye className="w-3 h-3 mr-2" />
                                    Buka Dashboard
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => selectedCustomer && handleSendWhatsApp(selectedCustomer)}
                                    className="w-full"
                                >
                                    WhatsApp
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}