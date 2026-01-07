'use client'

import { NAS, SNMPStats } from '../types'
import { formatDate } from '../utils'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Server,
    Edit,
    Trash2,
    TestTube,
    Eye,
    Download,
    CheckCircle,
    XCircle,
    AlertCircle,
    Activity,
    WifiOff,
    RefreshCw,
    Monitor
} from 'lucide-react'

interface Props {
    nas: NAS
    snmpStats?: SNMPStats
    testLoading: boolean
    onView: (nas: NAS) => void
    onEdit: (nas: NAS) => void
    onDelete: (nas: NAS) => void
    onTest: (id: string) => void
    onDownloadScript: (nas: NAS) => void
}

export function NASCard({
    nas,
    snmpStats,
    testLoading,
    onView,
    onEdit,
    onDelete,
    onTest,
    onDownloadScript
}: Props) {
    const statusConfig = {
        online: { color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800', icon: CheckCircle, label: 'Online' },
        offline: { color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800', icon: XCircle, label: 'Offline' },
        unknown: { color: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700', icon: AlertCircle, label: 'Unknown' }
    }

    const status = statusConfig[nas.status] || statusConfig.unknown

    return (
        <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${nas.status === 'online' ? 'bg-green-500' : nas.status === 'offline' ? 'bg-red-500' : 'bg-slate-500'}`}>
                            <Server className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg max-w-[150px] truncate" title={nas.shortname}>{nas.shortname}</h3>
                            <p className="text-sm text-muted-foreground font-mono">{nas.nasname}</p>
                        </div>
                    </div>
                    <Badge variant={nas.status === 'online' ? 'default' : 'secondary'} className={nas.status === 'online' ? 'bg-green-500 hover:bg-green-600' : ''}>
                        {status.label}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="flex items-start space-x-2 text-sm">
                    <Activity className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <span className="text-muted-foreground line-clamp-2">
                        {nas.description || 'No description provided'}
                    </span>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span>SNMP Status</span>
                        <span>{nas.snmp_enabled ? `v${nas.snmp_version || '2c'}` : 'Disabled'}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${nas.snmp_enabled ? 'bg-blue-500' : 'bg-slate-300'}`}
                            style={{ width: nas.snmp_enabled ? '100%' : '0%' }}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Type: {nas.type || 'Unknown'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p className="text-2xl font-bold text-primary">{nas.ports || 0}</p>
                        <p className="text-xs text-muted-foreground">Ports</p>
                    </div>
                    <div>
                        <div className="flex items-center justify-center gap-1">
                            {/* Use mock value or real if available, assume 0 for now as it wasn't in original card explicitly as big number */}
                            <p className={`text-2xl font-bold ${nas.status === 'online' ? 'text-green-600' : 'text-slate-500'}`}>
                                {nas.status === 'online' ? 'UP' : 'DOWN'}
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground">State</p>
                    </div>
                </div>

                <div className="flex space-x-2 pt-2">
                    {nas.status === 'online' && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onView(nas)}
                            className="flex-1"
                        >
                            <Eye className="w-4 h-4 mr-1" /> View
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(nas)}
                        className="flex-1"
                    >
                        <Edit className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(nas)}
                        className="flex-shrink-0 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete NAS"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
