'use client'

import { SNMPInterface } from '../../types'
import { getInterfaceStatusColor } from '../../utils'
import { Badge } from '@/components/ui/badge'
import { Network, ArrowDownToLine, ArrowUpFromLine, Activity } from 'lucide-react'

interface Props {
    data?: SNMPInterface[] | null
    loading?: boolean
}

export function InterfacesTab({ data, loading }: Props) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (!data || data.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                No physical interfaces found
            </div>
        )
    }

    return (
        <div className="py-4">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border">
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Interface</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Status</th>
                            <th className="text-left py-3 px-2 font-medium text-muted-foreground">Speed</th>
                            <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                                <div className="flex items-center justify-end space-x-1">
                                    <ArrowDownToLine className="h-3 w-3 text-green-500" />
                                    <span>RX Rate</span>
                                </div>
                            </th>
                            <th className="text-right py-3 px-2 font-medium text-muted-foreground">
                                <div className="flex items-center justify-end space-x-1">
                                    <ArrowUpFromLine className="h-3 w-3 text-blue-500" />
                                    <span>TX Rate</span>
                                </div>
                            </th>
                            <th className="text-right py-3 px-2 font-medium text-muted-foreground">Total RX</th>
                            <th className="text-right py-3 px-2 font-medium text-muted-foreground">Total TX</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((iface) => (
                            <tr
                                key={iface.index}
                                className="border-b border-border hover:bg-muted/50"
                            >
                                <td className="py-3 px-2">
                                    <div className="flex items-center space-x-2">
                                        <Network className={`h-4 w-4 ${iface.status === 'up' ? 'text-green-500' : 'text-muted-foreground'}`} />
                                        <div>
                                            <p className="font-medium text-foreground">{iface.name}</p>
                                            {iface.mac && iface.mac !== 'N/A' && (
                                                <p className="text-xs text-muted-foreground font-mono">{iface.mac}</p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-2">
                                    <Badge className={getInterfaceStatusColor(iface.status)}>
                                        {iface.status.toUpperCase()}
                                    </Badge>
                                </td>
                                <td className="py-3 px-2 text-foreground">
                                    {iface.speedFormatted}
                                </td>
                                <td className="py-3 px-2 text-right">
                                    <span className={`font-mono ${iface.rxRate > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                                        {iface.rxRateFormatted || formatRate(iface.rxRate)}
                                    </span>
                                </td>
                                <td className="py-3 px-2 text-right">
                                    <span className={`font-mono ${iface.txRate > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`}>
                                        {iface.txRateFormatted || formatRate(iface.txRate)}
                                    </span>
                                </td>
                                <td className="py-3 px-2 text-right text-foreground">
                                    {iface.rxBytesFormatted}
                                </td>
                                <td className="py-3 px-2 text-right text-foreground">
                                    {iface.txBytesFormatted}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Summary */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-4">
                        <span className="text-muted-foreground">
                            Total: {data.length} interfaces
                        </span>
                        <span className="text-green-600 dark:text-green-400">
                            Up: {data.filter(i => i.status === 'up').length}
                        </span>
                        <span className="text-red-600 dark:text-red-400">
                            Down: {data.filter(i => i.status === 'down').length}
                        </span>
                    </div>
                    <div className="flex items-center space-x-2 text-muted-foreground text-xs">
                        <Activity className="h-3 w-3" />
                        <span>Click refresh to update traffic</span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Helper to format rate if backend doesn't provide formatted version
function formatRate(bps: number): string {
    if (!bps || bps === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    const val = parseFloat((bps / Math.pow(k, i)).toFixed(2));
    return val + ' ' + sizes[i];
}
