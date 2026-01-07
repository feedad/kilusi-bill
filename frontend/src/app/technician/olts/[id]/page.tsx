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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowLeft, RefreshCw, Signal, Search, Wifi, WifiOff, MoreHorizontal, Settings2 } from 'lucide-react'
import { SyncNameDialog } from '@/components/admin/olts/SyncNameDialog'
import { RebootOnuDialog } from '@/components/admin/olts/RebootOnuDialog'

export default function OltMonitorPage() {
    const params = useParams()
    const router = useRouter()
    const id = params.id as string

    const [search, setSearch] = useState('')

    // Fetch OLT Details
    const { data: olt, isLoading: oltLoading } = useQuery({
        queryKey: ['olt', id],
        queryFn: async () => {
            const res = await api.get(`/api/v1/olts/${id}`)
            return res.data.data
        }
    })

    // Fetch ONU List
    const { data: onus, isLoading: onusLoading, refetch, isRefetching } = useQuery({
        queryKey: ['olt-onus', id],
        queryFn: async () => {
            const res = await api.get(`/api/v1/olts/${id}/onus`)
            return res.data.data
        },
        enabled: !!id
    })

    const filteredOnus = onus?.filter((onu: any) =>
        search === '' ||
        onu.sn?.toLowerCase().includes(search.toLowerCase()) ||
        onu.name?.toLowerCase().includes(search.toLowerCase()) ||
        onu.status?.toLowerCase().includes(search.toLowerCase())
    ) || []

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
                <Button onClick={() => refetch()} disabled={isRefetching}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    Refresh Data
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Daftar ONU Terhubung</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari SN, Name..."
                                className="pl-8"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
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
                                ) : filteredOnus.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8">
                                            Tidak ada data ONU ditemukan.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOnus.map((onu: any, i: number) => (
                                        <TableRow key={onu.index}>
                                            <TableCell>{i + 1}</TableCell>
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
                                                    <RebootOnuDialog
                                                        oltId={id}
                                                        onuIndex={onu.rawIndex || onu.index}
                                                        onuSn={onu.sn}
                                                        onSuccess={() => { }}
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
                </CardContent>
            </Card>
        </div >
    )
}
