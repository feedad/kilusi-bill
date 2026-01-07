'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useQuery } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { Wifi, User, Clock, ArrowUp, ArrowDown } from 'lucide-react'

export default function OnlineCustomersPage() {
    const { data: onlineUsers, isLoading } = useQuery({
        queryKey: ['technician-online-customers'],
        queryFn: async () => {
            // Re-using existing online customers route or creating new?
            // Existing route: /api/v1/technician/online-customers (from plan)
            // Wait, I planned to create it in technician.js but I haven't implemented it there yet.
            // I should use "active sessions" from radius.
            // Actually, I put "GET /online-customers - List active sessions from radacct" in the plan for backend, 
            // but I didn't actually edit technician.js yet!
            // I missed that step in backend execution. I will implement it now via replace or separate tool call.
            // For now, let's assume the endpoint is /api/v1/technician/online-customers
            const res = await api.get('/technician/online-customers')
            return res.data.data
        }
    })

    const formatBytes = (bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const main = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + main[i];
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Pelanggan Online</h1>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wifi className="h-5 w-5 text-green-500" />
                        Sesi Aktif ({onlineUsers?.length || 0})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-4">Loading...</div>
                    ) : (
                        <div className="relative overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase bg-muted/50">
                                    <tr>
                                        <th className="px-6 py-3">Username</th>
                                        <th className="px-6 py-3">IP Address</th>
                                        <th className="px-6 py-3">MAC Address</th>
                                        <th className="px-6 py-3">Durasi</th>
                                        <th className="px-6 py-3">Upload</th>
                                        <th className="px-6 py-3">Download</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {onlineUsers?.map((user: any, i: number) => (
                                        <tr key={i} className="border-b hover:bg-muted/10">
                                            <td className="px-6 py-4 font-medium flex items-center gap-2">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                {user.username}
                                            </td>
                                            <td className="px-6 py-4">{user.framedipaddress}</td>
                                            <td className="px-6 py-4">{user.callingstationid}</td>
                                            <td className="px-6 py-4 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {/* Calculate duration roughly if backend sends start time */}
                                                {user.duration || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-green-600">
                                                <div className="flex items-center gap-1">
                                                    <ArrowUp className="h-3 w-3" />
                                                    {formatBytes(user.acctinputoctets)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-blue-600">
                                                <div className="flex items-center gap-1">
                                                    <ArrowDown className="h-3 w-3" />
                                                    {formatBytes(user.acctoutputoctets)}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {(!onlineUsers || onlineUsers.length === 0) && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                                                Tidak ada pelanggan online saat ini
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
