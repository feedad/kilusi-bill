'use client'

import React, { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { adminApi as api } from '@/lib/api-clients'
import { useToast } from '@/components/ui/use-toast'
import { RefreshCw } from 'lucide-react'

interface SyncNameDialogProps {
    oltId: string
    onuIndex: string | number
    currentName: string
    onuSn?: string
    onSuccess: () => void
    triggerText?: string
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    size?: "default" | "sm" | "lg" | "icon"
    className?: string
}

export function SyncNameDialog({ oltId, onuIndex, currentName, onuSn, onSuccess, triggerText = "Sync Name", variant = "outline", size = "sm", className }: SyncNameDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [name, setName] = useState('')
    const [fetchingSuggestion, setFetchingSuggestion] = useState(false)
    const { toast } = useToast()

    // Fetch suggested customer name from MAC when dialog opens
    const handleOpen = async (isOpen: boolean) => {
        if (isOpen) {
            const current = currentName && currentName !== '-' ? currentName : ''
            setName(current)
            // Try to fetch suggested name from backend
            if (onuSn) {
                setFetchingSuggestion(true)
                try {
                    const res = await api.get(`/api/v1/technical-details/lookup-customer-by-mac/${encodeURIComponent(onuSn)}`)
                    if (res.data?.success && res.data?.data?.customer_name) {
                        setName(res.data.data.customer_name)
                    }
                } catch { /* ignore */ } finally { setFetchingSuggestion(false) }
            }
        }
        setOpen(isOpen)
    }

    const handleSync = async () => {
        setLoading(true)
        try {
            await api.post(`/api/v1/olts/${oltId}/onus/${encodeURIComponent(onuIndex as string)}/sync-name`, {
                name
            })

            toast({
                title: "Berhasil",
                description: "Nama ONU berhasil disinkronkan ke OLT.",
            })
            setOpen(false)
            onSuccess()
        } catch (error: any) {
            console.error('Sync error:', error)
            toast({
                variant: "destructive",
                title: "Gagal",
                description: error.response?.data?.message || "Gagal menyinkronkan nama.",
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogTrigger asChild>
                <Button variant={variant} size={size} className={size === 'icon' ? className : `h-8 ${className}`}>
                    <RefreshCw className={size === 'icon' ? "h-4 w-4" : "mr-2 h-3 w-3"} />
                    {size !== 'icon' && triggerText}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Sinkronisasi Nama ONU</DialogTitle>
                    <DialogDescription>
                        Perbarui nama ONU ini di perangkat OLT.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="index" className="text-right">
                            INDEX
                        </Label>
                        <Input
                            id="index"
                            value={onuIndex}
                            disabled
                            className="col-span-3 font-mono"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="name" className="text-right">
                            Nama
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="col-span-3"
                            placeholder={fetchingSuggestion ? 'Mencari nama...' : 'Nama pelanggan'}
                            disabled={fetchingSuggestion}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                        Batal
                    </Button>
                    <Button onClick={handleSync} disabled={loading}>
                        {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                        Simpan ke OLT
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
