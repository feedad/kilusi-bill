'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { adminApi as api } from '@/lib/api-clients'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, RefreshCw, Replace } from 'lucide-react'

type OnuChangeItem = {
    action: 'rename_new' | 'mark_old' | 'sync_mac' | 'skip'
    status?: string
    olt_id?: string | null
    olt_name?: string | null
    olt_ip?: string | null
    onu_index?: string | null
    onu_sn?: string | null
    current_name?: string | null
    new_name?: string | null
    customer_id?: string | null
    customer_name?: string | null
    service_number?: string | null
    pppoe_username?: string | null
    old_mac?: string | null
    new_mac?: string | null
    message?: string | null
}

interface OnuChangeDialogProps {
    oltId?: string
    onApplied?: () => void
    triggerText?: string
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
    size?: 'default' | 'sm' | 'lg' | 'icon'
    className?: string
}

const ACTION_LABEL: Record<string, string> = {
    rename_new: 'Rename ONU baru',
    mark_old: 'Tandai ONU lama',
    sync_mac: 'Sinkron MAC billing',
    skip: 'Lewati',
}

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    rename_new: 'default',
    mark_old: 'destructive',
    sync_mac: 'secondary',
    skip: 'outline',
}

export function OnuChangeDialog({
    oltId,
    onApplied,
    triggerText = 'Cek Ganti ONU',
    variant = 'outline',
    size = 'sm',
    className,
}: OnuChangeDialogProps) {
    const [open, setOpen] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [applying, setApplying] = useState(false)
    const [items, setItems] = useState<OnuChangeItem[]>([])
    const [summary, setSummary] = useState<any>(null)
    const [selected, setSelected] = useState<Record<string, boolean>>({})
    const { toast } = useToast()

    const itemKey = (item: OnuChangeItem, index: number) =>
        `${item.action}|${item.olt_id || '-'}|${item.onu_index || '-'}|${item.customer_id || '-'}|${index}`

    const actionable = useMemo(
        () => items.filter((item) => item.action !== 'skip'),
        [items]
    )

    const runScan = useCallback(async () => {
        setScanning(true)
        try {
            const params = oltId ? `?olt_id=${encodeURIComponent(oltId)}` : ''
            const res = await api.get(`/api/v1/onu-lifecycle/scan${params}`)
            const data = res.data?.data || {}
            const list: OnuChangeItem[] = data.items || []
            setItems(list)
            setSummary(data.summary || null)

            const nextSelected: Record<string, boolean> = {}
            list.forEach((item, index) => {
                nextSelected[itemKey(item, index)] = item.action !== 'skip'
            })
            setSelected(nextSelected)
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Gagal scan',
                description: error.response?.data?.message || 'Tidak dapat memindai perubahan ONU.',
            })
        } finally {
            setScanning(false)
        }
    }, [oltId, toast])

    useEffect(() => {
        if (open) runScan()
    }, [open, runScan])

    const toggle = (key: string) => {
        setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const allSelected = actionable.length > 0 && actionable.every((item) => {
        const index = items.indexOf(item)
        return selected[itemKey(item, index)]
    })

    const toggleAll = () => {
        const next: Record<string, boolean> = {}
        items.forEach((item, index) => {
            next[itemKey(item, index)] = item.action !== 'skip' ? !allSelected : false
        })
        setSelected(next)
    }

    const handleApply = async () => {
        const chosen = items.filter((item, index) => item.action !== 'skip' && selected[itemKey(item, index)])
        if (chosen.length === 0) {
            toast({ variant: 'destructive', title: 'Tidak ada item', description: 'Pilih minimal satu perubahan.' })
            return
        }

        if (!confirm(`Terapkan ${chosen.length} perubahan nama ONU ke OLT? ONU lama hanya di-rename, tidak dihapus.`)) return

        setApplying(true)
        try {
            const res = await api.post('/api/v1/onu-lifecycle/apply', {
                items: chosen,
                mark_old: true,
            })
            const data = res.data?.data || {}
            const failed = data.failed || 0
            toast({
                variant: failed > 0 ? 'destructive' : 'default',
                title: failed > 0 ? 'Selesai dengan kegagalan' : 'Berhasil',
                description: `${data.applied || 0} diterapkan, ${failed} gagal, ${data.skipped || 0} dilewati.`,
            })
            onApplied?.()
            await runScan()
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Gagal menerapkan',
                description: error.response?.data?.message || 'Perubahan ONU gagal diterapkan.',
            })
        } finally {
            setApplying(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant={variant} size={size} className={className}>
                    <Replace className="mr-1 h-4 w-4" />
                    {triggerText}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[900px]">
                <DialogHeader>
                    <DialogTitle>Deteksi Pergantian ONU</DialogTitle>
                    <DialogDescription>
                        Membandingkan MAC yang online di RADIUS dengan daftar ONU di OLT.
                        ONU baru diberi nama pelanggan, ONU lama di-rename menjadi OLD-&lt;NAMA&gt;-&lt;TANGGAL&gt;
                        (tidak dihapus). Perubahan dicatat di riwayat ONU.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-between gap-2 py-2">
                    <div className="text-sm text-muted-foreground">
                        {summary ? (
                            <>
                                {summary.total} temuan: {summary.rename_new} ONU baru, {summary.mark_old} ONU lama, {summary.sync_mac} sinkron MAC
                                {summary.olt_errors?.length ? ` · ${summary.olt_errors.length} OLT tidak terbaca` : ''}
                            </>
                        ) : 'Memindai...'}
                    </div>
                    <Button variant="outline" size="sm" onClick={runScan} disabled={scanning}>
                        <RefreshCw className={`mr-2 h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
                        Scan Ulang
                    </Button>
                </div>

                {summary?.olt_errors?.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                        {summary.olt_errors.map((entry: any) => (
                            <div key={entry.olt_name}>OLT {entry.olt_name}: {entry.error}</div>
                        ))}
                    </div>
                )}

                <ScrollArea className="max-h-[420px] rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">
                                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Pilih semua" />
                                </TableHead>
                                <TableHead>Pelanggan</TableHead>
                                <TableHead>Aksi</TableHead>
                                <TableHead>OLT / ONU</TableHead>
                                <TableHead>Nama</TableHead>
                                <TableHead>Keterangan</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {scanning && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                        Memindai OLT (bisa 30 detik untuk OLT Hioso)...
                                    </TableCell>
                                </TableRow>
                            )}
                            {!scanning && items.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                        Tidak ada pergantian ONU terdeteksi.
                                    </TableCell>
                                </TableRow>
                            )}
                            {!scanning && items.map((item, index) => {
                                const key = itemKey(item, index)
                                return (
                                    <TableRow key={key}>
                                        <TableCell>
                                            <Checkbox
                                                checked={Boolean(selected[key])}
                                                disabled={item.action === 'skip'}
                                                onCheckedChange={() => toggle(key)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{item.customer_name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {item.service_number || '-'} · {item.pppoe_username || '-'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={ACTION_VARIANT[item.action] || 'outline'}>
                                                {ACTION_LABEL[item.action] || item.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div>{item.olt_name || '-'}</div>
                                            <div className="text-muted-foreground">ONU {item.onu_index || '-'}</div>
                                            <div className="font-mono text-[10px] text-muted-foreground">{item.onu_sn || '-'}</div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div className="text-muted-foreground">{item.current_name || '-'}</div>
                                            <div className="font-medium">{item.new_name || '-'}</div>
                                        </TableCell>
                                        <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                                            {item.message || '-'}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={applying}>
                        Tutup
                    </Button>
                    <Button onClick={handleApply} disabled={applying || scanning || actionable.length === 0}>
                        {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Terapkan Terpilih
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
