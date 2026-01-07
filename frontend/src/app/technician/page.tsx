'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Activity, TicketCheck, Wrench, CheckCircle2, AlertTriangle, Radio, Server, Globe } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { adminApi as api, endpoints } from '@/lib/api-clients'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrafficMonitor } from '@/components/dashboard/TrafficMonitor'

export default function TechnicianDashboard() {
    // 1. Fetch Consolidated Stats
    const { data: stats, isLoading } = useQuery({
        queryKey: ['technician-dashboard-full'],
        queryFn: async () => {
            // We can fetch parallel or use the new /monitoring/stats if permitted for technician?
            // Or combine existing endpoints. 
            // Let's assume we use /monitoring/stats for widgets and /technician/dashboard for tickets.
            const [dashRes, monRes] = await Promise.all([
                api.get(endpoints.admin.technician.dashboard),
                api.get(endpoints.admin.monitoring.stats).catch(() => ({ data: { data: {} } })) // Graceful fail
            ])
            return {
                ...dashRes.data.data,
                monitoring: monRes.data.data
            }
        },
        refetchInterval: 30000 // Refresh every 30s
    })

    const monitoring = stats?.monitoring || {};

    // Helper for Uptime Color
    const getStatusColor = (status: string) => {
        if (status === 'up') return 'bg-green-500';
        if (status === 'down') return 'bg-red-500';
        return 'bg-gray-300';
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Technician Dashboard</h1>

            {/* Top Stats Cards (Existing) */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
                        <TicketCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats?.openTickets || 0}</div>
                        <p className="text-xs text-muted-foreground">Assigned to you</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Today's Installations</CardTitle>
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats?.todayInstallations || 0}</div>
                        <p className="text-xs text-muted-foreground">Scheduled for today</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : stats?.completedToday || 0}</div>
                        <p className="text-xs text-muted-foreground">Tickets & Installations</p>
                    </CardContent>
                </Card>
            </div>

            {/* Monitoring Widgets Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

                {/* 1. Data Warning (OLT Signal Stats) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Radio className="h-4 w-4 text-orange-500" />
                            Data Warning
                        </CardTitle>
                        <CardDescription>Optical Signal Quality</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Stats Summary */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-green-100 dark:bg-green-900/20 p-2 rounded text-center">
                                <div className="text-xl font-bold text-green-700 dark:text-green-500">{monitoring.signalStats?.normal || 0}</div>
                                <div className="text-xs text-green-800 dark:text-green-400">Normal</div>
                            </div>
                            <div className="bg-yellow-100 dark:bg-yellow-900/20 p-2 rounded text-center">
                                <div className="text-xl font-bold text-yellow-700 dark:text-yellow-500">{monitoring.signalStats?.warning || 0}</div>
                                <div className="text-xs text-yellow-800 dark:text-yellow-400">Warning</div>
                            </div>
                            <div className="bg-red-100 dark:bg-red-900/20 p-2 rounded text-center">
                                <div className="text-xl font-bold text-red-700 dark:text-red-500">{monitoring.signalStats?.critical || 0}</div>
                                <div className="text-xs text-red-800 dark:text-red-400">Critical</div>
                            </div>
                        </div>

                        {/* Critical List (Only if needed) */}
                        {monitoring.warnings?.length > 0 ? (
                            <div className="space-y-3">
                                <div className="text-xs font-medium text-muted-foreground uppercase">Needs Attention</div>
                                {monitoring.warnings.slice(0, 3).map((w: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-sm border-b pb-1 last:border-0">
                                        <div>
                                            <div className="font-medium truncate max-w-[120px]" title={w.name}>{w.name}</div>
                                        </div>
                                        <div className="text-red-600 font-bold">{w.rxPower} dBm</div>
                                    </div>
                                ))}
                                <Button variant="link" className="w-full text-xs h-auto p-0" asChild>
                                    <Link href="/technician/olts">View All Assets</Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="text-xs text-muted-foreground text-center">
                                All monitored devices are healthy.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 2. Active Alert (Connectivity) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Active Alerts
                        </CardTitle>
                        <CardDescription>Authentication & Services</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Connectivity Stats */}
                        <div className="flex gap-3 mb-4">
                            <div className="flex-1 bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-100 dark:border-green-900/50 text-center">
                                <div className="text-lg font-bold text-green-700 dark:text-green-500">
                                    {monitoring.connectivity?.online || 0}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">/{monitoring.connectivity?.total || 0}</span>
                                </div>
                                <div className="text-xs text-green-800 dark:text-green-400 font-medium">Online</div>
                            </div>
                            <div className="flex-1 bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-100 dark:border-red-900/50 text-center">
                                <div className="text-lg font-bold text-red-700 dark:text-red-500">
                                    {monitoring.connectivity?.offline || 0}
                                    <span className="text-xs font-normal text-muted-foreground ml-1">/{monitoring.connectivity?.total || 0}</span>
                                </div>
                                <div className="text-xs text-red-800 dark:text-red-400 font-medium">Offline</div>
                            </div>
                        </div>

                        {/* Radius Alerts List */}
                        {monitoring.alerts?.length > 0 ? (
                            <div className="space-y-3">
                                {monitoring.alerts.slice(0, 3).map((a: any, i: number) => (
                                    <div key={i} className="flex gap-2 text-xs bg-red-50 dark:bg-red-950/20 p-2 rounded">
                                        <div className="mt-0.5"><AlertTriangle className="h-3 w-3 text-red-500" /></div>
                                        <div>
                                            <div className="font-semibold text-red-700 dark:text-red-400">{a.type}</div>
                                            <div className="text-muted-foreground">{a.message} {a.detail ? `(${a.detail})` : ''}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-green-600 text-center flex items-center justify-center gap-2 mt-4">
                                <CheckCircle2 className="h-3 w-3" /> System Healthy
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 4. System Alert (Uptime Monitors) */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Globe className="h-4 w-4 text-blue-500" />
                            Uptime Status
                        </CardTitle>
                        <CardDescription>External Connectivity</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {monitoring.uptime?.map((m: any) => (
                            <div key={m.id} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium">{m.name}</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${m.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {m.status?.toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 h-3">
                                    {/* Visualization of history bar */}
                                    {m.history?.map((h: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className={`flex-1 h-full rounded-sm ${getStatusColor(h.status)}`}
                                            title={`${h.ts}: ${h.latency}ms`}
                                        />
                                    ))}
                                    {(!m.history || m.history.length === 0) && (
                                        <div className="w-full h-full bg-gray-100 text-[10px] text-center text-muted-foreground">No History</div>
                                    )}
                                </div>
                                <div className="text-xs text-right text-muted-foreground">{m.response_time} ms</div>
                            </div>
                        ))}
                        {(!monitoring.uptime || monitoring.uptime.length === 0) && (
                            <div className="text-sm text-muted-foreground text-center">No active monitors</div>
                        )}
                    </CardContent>
                </Card>

                {/* 3. Network Traffic (Main Interface) - Wide */}
                <Card className="col-span-1 md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Activity className="h-4 w-4 text-purple-500" />
                            Network Traffic
                        </CardTitle>
                        <CardDescription>Main Interface Utilization</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <TrafficMonitor />
                    </CardContent>
                </Card>

                {/* 5. Recent Activity */}
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Server className="h-4 w-4 text-indigo-500" />
                            Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {monitoring.activity?.map((act: any, i: number) => (
                                <div key={i} className="flex items-start gap-3 border-l-2 border-indigo-200 pl-3">
                                    <div>
                                        <div className="text-sm font-medium">{act.username}</div>
                                        <div className="text-xs text-muted-foreground">Connected from {act.framedipaddress}</div>
                                        <div className="text-[10px] text-muted-foreground/60">{new Date(act.acctstarttime).toLocaleTimeString()}</div>
                                    </div>
                                </div>
                            ))}
                            {(!monitoring.activity || monitoring.activity.length === 0) && (
                                <div className="text-sm text-muted-foreground text-center">No recent activity</div>
                            )}
                        </div>
                        <Button variant="ghost" className="w-full mt-4 text-xs" asChild>
                            <Link href="/technician/online">View All Online Customers</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
