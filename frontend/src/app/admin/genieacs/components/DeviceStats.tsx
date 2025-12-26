import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
    Router,
    Wifi,
    WifiOff,
    AlertCircle,
    Activity
} from 'lucide-react'

interface DeviceStatsProps {
    stats: {
        total_devices: number
        online_devices: number
        offline_devices: number
        warning_devices: number
        total_customers: number
    }
}

export function DeviceStats({ stats }: DeviceStatsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
                    <Router className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.total_devices}</div>
                    <p className="text-xs text-muted-foreground">Registered ONUs</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Online</CardTitle>
                    <Wifi className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.online_devices}</div>
                    <p className="text-xs text-muted-foreground">Connected devices</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Offline</CardTitle>
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-muted-foreground">{stats.offline_devices}</div>
                    <p className="text-xs text-muted-foreground">Disconnected devices</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Warning</CardTitle>
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{stats.warning_devices}</div>
                    <p className="text-xs text-muted-foreground">Need attention</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Customers</CardTitle>
                    <Activity className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-600">{stats.total_customers}</div>
                    <p className="text-xs text-muted-foreground">Assigned to customer</p>
                </CardContent>
            </Card>
        </div>
    )
}
