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
import { adminApi as api } from '@/lib/api-clients'
import { useToast } from '@/components/ui/use-toast'
import { Power, Timer } from 'lucide-react'

interface RebootOnuDialogProps {
    oltId: string
    onuIndex: string | number
    onuSn?: string
    onSuccess: () => void
    triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    triggerSize?: "default" | "sm" | "lg" | "icon"
    className?: string
}

export function RebootOnuDialog({ oltId, onuIndex, onuSn, onSuccess, triggerVariant = "ghost", triggerSize = "default", className }: RebootOnuDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()

    const handleReboot = async () => {
        setLoading(true)
        try {
            await api.post(`/api/v1/olts/${oltId}/onus/${encodeURIComponent(onuIndex)}/reboot`, {
                sn: onuSn
            })

            toast({
                title: "Perintah Terkirim",
                description: "Perintah reboot telah dikirim ke ONU.",
            })
            setOpen(false)
            onSuccess()
        } catch (error: any) {
            console.error('Reboot error:', error)
            toast({
                variant: "destructive",
                title: "Gagal",
                description: error.response?.data?.message || "Gagal melakukan reboot.",
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant={triggerVariant} size={triggerSize} className={triggerSize === 'icon' ? className : `w-full justify-start ${className}`}>
                    <Power className={triggerSize === 'icon' ? "h-4 w-4" : "mr-2 h-4 w-4"} />
                    {triggerSize !== 'icon' && <span>Reboot ONU</span>}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Power className="h-5 w-5 text-red-500" />
                        Reboot ONU
                    </DialogTitle>
                    <DialogDescription>
                        Apakah Anda yakin ingin me-restart ONU ini?
                        <br />
                        <span className="font-mono text-xs">{onuSn ? `SN: ${onuSn}` : `Index: ${onuIndex}`}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md text-sm text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800">
                    <p className="flex gap-2">
                        <Timer className="h-4 w-4 shrink-0 mt-0.5" />
                        Koneksi internet pelanggan akan terputus selama proses restart (sekitar 1-2 menit).
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                        Batal
                    </Button>
                    <Button variant="destructive" onClick={handleReboot} disabled={loading}>
                        {loading ? 'Processing...' : 'Ya, Reboot Sekarang'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
