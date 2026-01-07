'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'react-hot-toast'
import Link from 'next/link'
import { MapPin, Activity, Signal, Wifi } from 'lucide-react'

export default function TechnicianTicketsPage() {
    const [selectedTicket, setSelectedTicket] = useState<any>(null)
    const [isUpdateOpen, setIsUpdateOpen] = useState(false)
    const [updateStatus, setUpdateStatus] = useState('')
    const [updateResolution, setUpdateResolution] = useState('')

    // Status Check State
    const [statusResult, setStatusResult] = useState<any>(null)
    const [isStatusOpen, setIsStatusOpen] = useState(false)

    const queryClient = useQueryClient()

    const { data: tickets, isLoading } = useQuery({
        queryKey: ['technician-tickets'],
        queryFn: async () => {
            const res = await api.get('/technician/tickets')
            return res.data.data
        }
    })

    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            return api.put(`/technician/tickets/${data.id}`, {
                status: data.status,
                resolution: data.resolution
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['technician-tickets'] })
            setIsUpdateOpen(false)
            toast.success('Ticket updated successfully')
        },
        onError: (err) => {
            toast.error('Failed to update ticket')
            console.error(err)
        }
    })

    const checkStatusMutation = useMutation({
        mutationFn: async (customerId: string) => {
            setStatusResult(null)
            setIsStatusOpen(true)
            const res = await api.get(`/technician/customers/${customerId}/onu-status`)
            return res.data
        },
        onSuccess: (data) => {
            setStatusResult(data)
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to check status')
            setStatusResult({ success: false, message: err.response?.data?.message || 'Check failed' })
        }
    })

    const handleUpdate = () => {
        updateMutation.mutate({
            id: selectedTicket.id,
            status: updateStatus,
            resolution: updateResolution
        })
    }

    const openUpdateDialog = (ticket: any) => {
        setSelectedTicket(ticket)
        setUpdateStatus(ticket.status)
        setUpdateResolution('')
        setIsUpdateOpen(true)
    }

    const handleCheckStatus = (ticket: any) => {
        checkStatusMutation.mutate(ticket.customer_id)
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'open': return <Badge variant="destructive">Open</Badge>
            case 'in_progress': return <Badge variant="default" className="bg-blue-500">In Progress</Badge>
            case 'resolved': return <Badge variant="success" className="bg-green-500">Resolved</Badge>
            case 'closed': return <Badge variant="outline">Closed</Badge>
            default: return <Badge variant="secondary">{status}</Badge>
        }
    }

    const getSignalColor = (dbm: number) => {
        if (dbm > -25) return 'text-green-500'
        if (dbm > -27) return 'text-yellow-500'
        return 'text-red-500'
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">My Tickets</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Assigned Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Ticket ID</TableHead>
                                    <TableHead>Subject</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-4">Loading...</TableCell>
                                    </TableRow>
                                ) : tickets?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-4">No tickets assigned.</TableCell>
                                    </TableRow>
                                ) : (
                                    tickets?.map((ticket: any) => (
                                        <TableRow key={ticket.id}>
                                            <TableCell className="font-medium">#{ticket.id}</TableCell>
                                            <TableCell>
                                                <div className="font-semibold">{ticket.title}</div>
                                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">{ticket.description}</div>
                                            </TableCell>
                                            <TableCell>
                                                <div>{ticket.customer_name}</div>
                                                <div className="text-xs text-muted-foreground">{ticket.customer_address}</div>
                                                {ticket.customer_phone && (
                                                    <div className="text-xs text-muted-foreground">{ticket.customer_phone}</div>
                                                )}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                                            <TableCell>{new Date(ticket.created_at).toLocaleDateString()}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => handleCheckStatus(ticket)} title="Check Signal">
                                                        <Activity className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => openUpdateDialog(ticket)}>
                                                        Update
                                                    </Button>
                                                    <Link href={`/technician/customers/${ticket.customer_id}/activate`}>
                                                        <Button variant="secondary" size="sm">
                                                            Activate
                                                        </Button>
                                                    </Link>
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

            {/* Update Dialog */}
            <Dialog open={isUpdateOpen} onOpenChange={setIsUpdateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Update Ticket #{selectedTicket?.id}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={updateStatus} onValueChange={setUpdateStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Resolution / Notes</Label>
                            <Textarea
                                value={updateResolution}
                                onChange={(e) => setUpdateResolution(e.target.value)}
                                placeholder="Describe work done..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsUpdateOpen(false)}>Cancel</Button>
                        <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? 'Saving...' : 'Save Update'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Status Check Dialog */}
            <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>ONT / ODP Status Check</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {checkStatusMutation.isPending ? (
                            <div className="flex flex-col items-center justify-center space-y-3 py-6">
                                <Activity className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">Scanning OLTs for Customer ONT...</p>
                            </div>
                        ) : statusResult?.success ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        <div className={`p-2 rounded-full ${statusResult.data.status === 'online' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                            <Wifi className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">Status</p>
                                            <p className="text-lg font-bold capitalize">{statusResult.data.status}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium">Rx Power</p>
                                        <p className={`text-xl font-bold ${getSignalColor(parseFloat(statusResult.data.rxPower))}`}>
                                            {statusResult.data.rxPower} dBm
                                        </p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div className="p-3 border rounded-md">
                                        <span className="text-muted-foreground">OLT Name:</span>
                                        <div className="font-medium">{statusResult.data.oltParam.name}</div>
                                    </div>
                                    <div className="p-3 border rounded-md">
                                        <span className="text-muted-foreground">OLT IP:</span>
                                        <div className="font-medium">{statusResult.data.oltParam.ip}</div>
                                    </div>
                                    <div className="p-3 border rounded-md">
                                        <span className="text-muted-foreground">Quality:</span>
                                        <div className="font-medium capitalize">{statusResult.data.signalQuality}</div>
                                    </div>
                                </div>
                                <div className="pt-2">
                                    <Button
                                        className="w-full"
                                        variant="outline"
                                        onClick={() => {
                                            // Extract customer ID from closure or store?
                                            // The ticket structure is { customer_id: ... }
                                            // We need to pass the TICKET (or customer ID) to this dialog state.
                                            // Actually, the handleCheckStatus takes a ticket, we should store that ticket in state.
                                            // Current Implementation: handleCheckStatus(ticket) -> mutate(ticket.customer_id).
                                            // We need to store the current ticket ID to re-use for Sync.
                                            // HACK: We can use the customer_id from the last successful check?
                                            // Ideally we refactor `handleCheckStatus` to set `selectedStatusTicket`.
                                            // For now, let's assume we can get it from the parent context if we change state.
                                            // Let's modify handleCheckStatus to set a state.

                                            // Wait, we don't have the customer ID stored in the dialog state. 
                                            // IMPORTANT: I need to update the component to store selectedTicketForStatus.
                                            // Since I can't easily change the whole component in one block, I'll rely on a new state or prop.
                                            // But I'm only replacing this block. 
                                            // I will modify the `handleCheckStatus` function in a separate call if needed, 
                                            // OR I can use a simpler approach: Just add the button but it might fail if ID missing.

                                            // BETTER PLAN: I will update the entire component's return statement to include the mutation and state.
                                            // See next tool call.
                                        }}
                                        disabled={true} // Placeholder until full update
                                    >
                                        Sync Name to OLT (Click to Sync)
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6 text-destructive space-y-2">
                                <Signal className="h-8 w-8 mx-auto opacity-50" />
                                <p className="font-medium">Check Failed/Not Found</p>
                                <p className="text-sm text-muted-foreground">{statusResult?.message || 'Unknown error occurred'}</p>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStatusOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
