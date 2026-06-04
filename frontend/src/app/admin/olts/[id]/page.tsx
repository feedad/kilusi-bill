'use client'

import React, { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ArrowLeft, RefreshCw, Signal, Search, Wifi, WifiOff, ChevronLeft, ChevronRight, Wand2 } from 'lucide-react'
import { SyncNameDialog } from '@/components/admin/olts/SyncNameDialog'
import { RebootOnuDialog } from '@/components/admin/olts/RebootOnuDialog'
import { useToast } from '@/components/ui/use-toast'
import { toast } from 'react-hot-toast'

export default function OltMonitorPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(25)
    const [syncing, setSyncing] = useState(false)

    // Fetch OLT Details
    const { data: olt, isLoading: oltLoading } = useQuery({
        queryKey: ['olt', id],
        queryFn: async () => {
            const res = await api.get(`/api/v1/olts/${id}`)
            return res.data.data
        }
    })

    // Fetch ONU List with pagination
    const fetchKey = ['olt-onus', id, page, pageSize, search]
    const { data: onusData, isLoading: onusLoading, refetch, isRefetching } = useQuery({
        queryKey: fetchKey,
        queryFn: async () => {
            const params = new URLSearchParams({ page: String(page), limit: String(pageSize) })
            if (search) params.set('search', search)
            const res = await api.get(`/api/v1/olts/${id}/onus?${params}`)
            return res.data
        },
        enabled: !!id
    })

    const onus = onusData?.data || []
    const pagination = onusData?.pagination || { page: 1, limit: pageSize, total: 0, totalPages: 0 }

    const handleSearch = (val: string) => {
        setSearch(val)
        setPage(1)
    }

    const handleAutoRename = async () => {
        if (!confirm(`Rename semua ONU di OLT ini ke nama pelanggan berdasarkan data RADIUS?`)) return
        setSyncing(true)
        try {
            const res = await api.post('/api/v1/realtime/olt-onus/rename', { olt_id: id, dry_run: false })
            if (res.data?.success) {
                toast.success(`Renamed ${res.data.renamed || 0} ONUs, ${res.data.skipped || 0} skipped, ${res.data.errors || 0} errors`)
                refetch()
            } else {
                toast.error(res.data?.message || 'Gagal')
            }
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Gagal')
        } finally { setSyncing(false) }
    }

    const getSignalColor = (rx: any) => {
        if (rx === '-' || rx === -Infinity) return 'text-gray-400'
        const val = parseFloat(rx)
        if (val < -27) return 'text-red-600'
        if (val < -25) return 'text-yellow-600'
        return 'text-green-600'
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {oltLoading ? 'Loading...' : `Monitor OLT: ${olt?.name}`}
                        </h1>
                        <p className="text-muted-foreground">
                            {olt?.host} ({olt?.type?.toUpperCase()})
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handleAutoRename} disabled={syncing}>
                        <Wand2 className={`mr-1 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync All Names'}
                    </Button>
                    <Button onClick={() => refetch()} disabled={isRefetching}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                        Refresh Data
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Daftar ONU Terhubung</CardTitle>
                        <div className="flex items-center gap-2">
                            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
                                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}/page</option>)}
                            </select>
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Cari SN, Name..."
                                    className="pl-8"
                                    value={search}
                                    onChange={(e) => handleSearch(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>ONT ID</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>SN</TableHead>
                                    <TableHead>Redaman (Rx)</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Distance</TableHead>
                                    <TableHead>Temperature</TableHead>
                                    <TableHead className="w-[80px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {onusLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8">
                                            <div className="flex flex-col items-center gap-2">
                                                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                                                <p>Mengambil data dari OLT (SNMP Walk)...</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : onus.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8">
                                            Tidak ada data ONU ditemukan.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    onus.map((onu: any, i: number) => (
                                        <TableRow key={onu.index}>
                                            <TableCell>{(pagination.page - 1) * pagination.limit + i + 1}</TableCell>
                                            <TableCell className="font-mono">{onu.index}</TableCell>
                                            <TableCell>{onu.name}</TableCell>
                                            <TableCell className="font-mono text-xs">{onu.sn}</TableCell>
                                            <TableCell>
                                                <div className={`flex items-center gap-1 font-medium ${getSignalColor(onu.rxPower)}`}>
                                                    <Signal className="h-4 w-4" />
                                                    {onu.rxPower} dBm
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className={`flex items-center gap-1 ${onu.status === 'online' ? 'text-green-600' : 'text-gray-500'}`}>
                                                    {onu.status === 'online' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                                                    <span className="capitalize">{onu.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{onu.distance || '-'}</TableCell>
                                            <TableCell>{onu.temperature || '-'}</TableCell>

                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <SyncNameDialog
                                                        oltId={params.id}
                                                        onuIndex={onu.rawIndex || onu.index}
                                                        currentName={onu.name}
                                                        onuSn={onu.sn}
                                                        onSuccess={refetch}
                                                        triggerText=""
                                                        variant="ghost"
                                                        size="icon"
                                                    />
                                                    <RebootOnuDialog
                                                        oltId={params.id as string}
                                                        onuIndex={onu.rawIndex || onu.index}
                                                        onuSn={onu.sn}
                                                        onSuccess={() => {}}
                                                        triggerVariant="ghost"
                                                        triggerSize="icon"
                                                    />
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination Controls */}
                    {pagination.total > 0 && (
                        <div className="flex items-center justify-between pt-4">
                            <span className="text-sm text-muted-foreground">
                                Menampilkan {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} dari {pagination.total} ONU
                            </span>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pagination.page <= 1}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="text-sm text-muted-foreground px-2">
                                    Page {pagination.page} of {pagination.totalPages || 1}
                                </span>
                                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={pagination.page >= pagination.totalPages}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
