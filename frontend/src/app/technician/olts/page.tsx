'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Server, Activity, Wifi } from 'lucide-react'

import { useRouter } from 'next/navigation'

export default function TechnicianOLTPage() {
    const router = useRouter()
    const { data: olts, isLoading } = useQuery({
        queryKey: ['technician-olts'],
        queryFn: async () => {
            const res = await api.get('/api/v1/technician/olts')
            return res.data.data
        }
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Data OLT</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        OLT Server List
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>IP Address</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-4">Loading...</TableCell>
                                    </TableRow>
                                ) : olts?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-4">No OLTs found.</TableCell>
                                    </TableRow>
                                ) : (
                                    olts?.map((olt: any) => (
                                        <TableRow
                                            key={olt.id}
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => router.push(`/technician/olts/${olt.id}`)}
                                        >
                                            <TableCell className="font-medium">{olt.shortname}</TableCell>
                                            <TableCell>{olt.nasname}</TableCell>
                                            <TableCell className="uppercase">{olt.type || 'Generic'}</TableCell>
                                            <TableCell>{olt.description || '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={`flex items-center w-fit gap-1 ${olt.status === 'active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                                                    {olt.status === 'active' ? <Wifi className="h-3 w-3 text-green-500" /> : <Activity className="h-3 w-3" />}
                                                    <span className="capitalize">{olt.status || 'unknown'}</span>
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
