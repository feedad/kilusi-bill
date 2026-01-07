'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from '@/components/ui/dialog'
import { Server, Plus, Edit, Trash, Activity } from 'lucide-react'
import { toast } from 'react-hot-toast'

import { useRouter } from 'next/navigation'

export default function OltManagementPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [isCreateOpen, setIsCreateOpen] = useState(false)
    const [editingOlt, setEditingOlt] = useState<any>(null)
    const [testStatus, setTestStatus] = useState<Record<string, 'success' | 'error' | null>>({})

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        host: '',
        type: 'zte',
        snmp_community: 'public',
        snmp_write_community: 'private',
        snmp_version: '2c',
        snmp_port: 161,
        description: ''
    })

    const { data: olts, isLoading } = useQuery({
        queryKey: ['olts'],
        queryFn: async () => {
            const res = await api.get('/api/v1/olts')
            return res.data.data
        }
    })

    const createMutation = useMutation({
        mutationFn: async (data: any) => api.post('/api/v1/olts', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] })
            setIsCreateOpen(false)
            resetForm()
            toast.success('OLT berhasil ditambahkan')
        },
        onError: () => toast.error('Gagal menambahkan OLT')
    })

    const updateMutation = useMutation({
        mutationFn: async (data: any) => api.put(`/api/v1/olts/${data.id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] })
            setIsCreateOpen(false)
            setEditingOlt(null)
            resetForm()
            toast.success('OLT berhasil diupdate')
        },
        onError: () => toast.error('Gagal update OLT')
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => api.delete(`/api/v1/olts/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['olts'] })
            toast.success('OLT berhasil dihapus')
        },
        onError: () => toast.error('Gagal menghapus OLT')
    })

    const testMutation = useMutation({
        mutationFn: async (id: string) => api.post(`/api/v1/olts/${id}/test`),
        onSuccess: (res, variables) => {
            toast.success(res.data.message)
            setTestStatus(prev => ({ ...prev, [variables]: 'success' }))
            setTimeout(() => setTestStatus(prev => ({ ...prev, [variables]: null })), 3000)
        },
        onError: (err: any, variables) => {
            toast.error(err.response?.data?.message || 'Test Failed')
            setTestStatus(prev => ({ ...prev, [variables]: 'error' }))
            setTimeout(() => setTestStatus(prev => ({ ...prev, [variables]: null })), 3000)
        }
    })

    const resetForm = () => {
        setFormData({
            name: '',
            host: '',
            type: 'zte',
            snmp_community: 'public',
            snmp_write_community: 'private',
            snmp_version: '2c',
            snmp_port: 161,
            description: ''
        })
    }

    const handleEdit = (olt: any) => {
        setEditingOlt(olt)
        setFormData({
            name: olt.name,
            host: olt.host,
            type: olt.type,
            snmp_community: olt.snmp_community,
            snmp_write_community: olt.snmp_write_community || 'private',
            snmp_version: olt.snmp_version,
            snmp_port: olt.snmp_port,
            description: olt.description
        })
        setIsCreateOpen(true)
    }

    const handleSubmit = () => {
        if (editingOlt) {
            updateMutation.mutate({ ...formData, id: editingOlt.id })
        } else {
            createMutation.mutate(formData)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Manajemen OLT</h1>
                    <p className="text-muted-foreground">Kelola perangkat OLT dan konfigurasi SNMP</p>
                </div>
                <Button onClick={() => { setEditingOlt(null); resetForm(); setIsCreateOpen(true) }}>
                    <Plus className="mr-2 h-4 w-4" /> Tambah OLT
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Daftar OLT
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nama</TableHead>
                                    <TableHead>IP Address</TableHead>
                                    <TableHead>Tipe</TableHead>
                                    <TableHead>Community</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-4">Loading...</TableCell></TableRow>
                                ) : olts?.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-4">Belum ada data OLT</TableCell></TableRow>
                                ) : (
                                    olts?.map((olt: any) => (
                                        <TableRow
                                            key={olt.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => router.push(`/admin/olts/${olt.id}`)}
                                        >
                                            <TableCell className="font-medium">{olt.name}</TableCell>
                                            <TableCell>{olt.host}</TableCell>
                                            <TableCell className="uppercase">{olt.type}</TableCell>
                                            <TableCell className="font-mono text-xs">{olt.snmp_community}</TableCell>
                                            <TableCell>
                                                <Badge variant={olt.status === 'active' ? 'default' : 'secondary'}>
                                                    {olt.status || 'unknown'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className={
                                                            testStatus[olt.id] === 'success' ? 'text-green-600 hover:text-green-700 hover:bg-green-50' :
                                                                testStatus[olt.id] === 'error' ? 'text-red-600 hover:text-red-700 hover:bg-red-50' :
                                                                    ''
                                                        }
                                                        onClick={() => testMutation.mutate(olt.id)}
                                                        title="Test Connection"
                                                    >
                                                        <Activity className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" onClick={() => handleEdit(olt)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => {
                                                        if (confirm('Hapus OLT ini?')) deleteMutation.mutate(olt.id)
                                                    }}>
                                                        <Trash className="h-4 w-4" />
                                                    </Button>
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

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingOlt ? 'Edit OLT' : 'Tambah OLT Baru'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Nama OLT</Label>
                                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Main ZTE OLT" />
                            </div>
                            <div className="space-y-2">
                                <Label>IP Address</Label>
                                <Input value={formData.host} onChange={(e) => setFormData({ ...formData, host: e.target.value })} placeholder="192.168.100.1" />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipe Vendor</Label>
                                <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="zte">ZTE</SelectItem>
                                        <SelectItem value="huawei">Huawei</SelectItem>
                                        <SelectItem value="hsgq">HSGQ</SelectItem>
                                        <SelectItem value="cdata">C-Data</SelectItem>
                                        <SelectItem value="hioso">Hioso</SelectItem>
                                        <SelectItem value="vsol">V-Sol</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Location..." />
                            </div>
                            <div className="space-y-2">
                                <Label>SNMP Read Community</Label>
                                <Input value={formData.snmp_community} onChange={(e) => setFormData({ ...formData, snmp_community: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>SNMP Write Community</Label>
                                <Input value={formData.snmp_write_community} onChange={(e) => setFormData({ ...formData, snmp_write_community: e.target.value })} placeholder="private" />
                            </div>
                            <div className="space-y-2">
                                <Label>SNMP Version</Label>
                                <Select value={formData.snmp_version} onValueChange={(val) => setFormData({ ...formData, snmp_version: val })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">v1</SelectItem>
                                        <SelectItem value="2c">v2c</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>SNMP Port</Label>
                                <Input type="number" value={formData.snmp_port} onChange={(e) => setFormData({ ...formData, snmp_port: parseInt(e.target.value) })} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
                        <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
                            Simpan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
