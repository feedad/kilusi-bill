import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, ArrowDown, ArrowUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { adminApi } from '@/lib/api-clients'

interface TrafficPoint {
    time: string
    download: number // Mbps
    upload: number // Mbps
    timestamp: number
}

interface TrafficMonitorProps {
    refreshInterval?: number // ms
}

export function TrafficMonitor({ refreshInterval = 2000 }: TrafficMonitorProps) {
    const [data, setData] = useState<TrafficPoint[]>([])
    const [current, setCurrent] = useState({ rx: 0, tx: 0 }) // Mbps
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    // Keep data buffer size
    const MAX_POINTS = 60 // 2 minutes history at 2s interval

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await adminApi.get('/api/v1/monitoring/traffic/live')
                if (res.data.success) {
                    const stats = res.data.data
                    // Convert bps to Mbps
                    const rxMbps = (stats.in_bps || 0) / 1000000
                    const txMbps = (stats.out_bps || 0) / 1000000

                    setCurrent({ rx: rxMbps, tx: txMbps })
                    setError(null)

                    setData(prev => {
                        const now = new Date()
                        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        const newPoint = {
                            time: timeStr,
                            timestamp: now.getTime(),
                            download: parseFloat(rxMbps.toFixed(2)),
                            upload: parseFloat(txMbps.toFixed(2))
                        }

                        const newData = [...prev, newPoint]
                        if (newData.length > MAX_POINTS) {
                            return newData.slice(newData.length - MAX_POINTS)
                        }
                        return newData
                    })
                } else {
                    // Handle "Interface not configured" or "Router not found" gracefully
                    if (res.data.message.includes("configured")) {
                        setError("Interface belum dikonfigurasi di Settings")
                    } else {
                        setError(res.data.message)
                    }
                }
            } catch (err: any) {
                // Ignore timeouts occasionally
                console.warn('Traffic fetch error:', err)
            } finally {
                setLoading(false)
            }
        }

        fetchData() // Initial call
        const interval = setInterval(fetchData, refreshInterval)

        return () => clearInterval(interval)
    }, [refreshInterval])

    if (error) {
        return (
            <div className="h-[250px] flex items-center justify-center border-dashed border-2 rounded-lg bg-muted/50">
                <div className="text-center text-muted-foreground p-4">
                    <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="font-medium">Traffic Monitor Unavailable</p>
                    <p className="text-xs mt-1">{error}</p>
                </div>
            </div>
        )
    }

    if (loading && data.length === 0) {
        return (
            <div className="h-[250px] flex items-center justify-center bg-muted/20 rounded-lg">
                <div className="text-sm text-muted-foreground animate-pulse">Initializing Traffic Monitor...</div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Current Stats */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900">
                    <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400 mb-1">
                        <ArrowDown className="h-4 w-4" /> Download
                    </div>
                    <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {current.rx.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Mbps</span>
                    </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 p-3 rounded-lg border border-purple-100 dark:border-purple-900">
                    <div className="flex items-center gap-2 text-sm text-purple-700 dark:text-purple-400 mb-1">
                        <ArrowUp className="h-4 w-4" /> Upload
                    </div>
                    <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                        {current.tx.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">Mbps</span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                        <XAxis
                            dataKey="time"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(value) => `${value} M`}
                            tickLine={false}
                            axisLine={false}
                            domain={[0, 'auto']}
                        />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ color: '#6b7280', fontSize: '12px' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="download"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorDownload)"
                            name="Download (Mbps)"
                            isAnimationActive={false} // Disable animation for smoother realtime updates
                        />
                        <Area
                            type="monotone"
                            dataKey="upload"
                            stroke="#a855f7"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorUpload)"
                            name="Upload (Mbps)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
