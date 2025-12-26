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
        <Card className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${nas.status === 'online' ? 'bg-green-500 text-white' :
                            nas.status === 'offline' ? 'bg-red-500 text-white' :
                                'bg-gray-500 text-white'
                            }`}>
                            <Server className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-base sm:text-lg truncate">{nas.shortname}</h3>
                            <p className="text-xs sm:text-sm text-muted-foreground font-mono truncate">{nas.nasname}</p>
                        </div>
                    </div>
                    <Badge className={`${status.color} shrink-0 text-xs`}>
                        <span className="flex items-center space-x-1">
                            <status.icon className="h-3 w-3" />
                            <span className="capitalize hidden sm:inline">{status.label}</span>
                        </span>
                    </Badge>
                </div>
                {nas.description && (
                    <CardDescription className="mt-2 text-xs sm:text-sm line-clamp-2">{nas.description}</CardDescription>
                )}
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
                {/* Info Grid - 2 columns on mobile */}
                <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                    {/* SNMP Status */}
                    <div className="flex items-center space-x-1.5">
                        <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">SNMP</span>
                    </div>
                    <div className="text-right">
                        {nas.snmp_enabled ? (
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-xs px-1.5 py-0">
                                <Activity className="h-2.5 w-2.5 mr-0.5" />
                                v{nas.snmp_version || '2c'}
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-muted-foreground text-xs px-1.5 py-0 border-muted-foreground/30">
                                <WifiOff className="h-2.5 w-2.5 mr-0.5" />
                                Off
                            </Badge>
                        )}
                    </div>

                    {/* Last Seen */}
                    <div className="flex items-center space-x-1.5">
                        <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Last Seen</span>
                    </div>
                    <div className="text-right text-muted-foreground truncate">
                        {formatDate(nas.last_seen) || 'Never'}
                    </div>

                    {/* Server Type */}
                    <div className="flex items-center space-x-1.5">
                        <Monitor className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Type</span>
                    </div>
                    <div className="text-right text-muted-foreground capitalize">
                        {nas.type || 'Unknown'}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 pt-2">
                    {nas.snmp_enabled && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onTest(nas.id)}
                            disabled={testLoading}
                            className="flex-1 h-8 text-xs px-2"
                            title="Test Connection"
                        >
                            {testLoading ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                                <>
                                    <TestTube className="h-3 w-3 sm:mr-1" />
                                    <span className="hidden sm:inline">Test</span>
                                </>
                            )}
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEdit(nas)}
                        className="flex-1 h-8 text-xs px-2"
                    >
                        <Edit className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDownloadScript(nas)}
                        className="h-8 w-8 p-0"
                        title="Download MikroTik Script"
                    >
                        <Download className="h-3 w-3" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(nas)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        title="Delete NAS"
                    >
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>

                {/* View Details Link for Online Servers */}
                {nas.status === 'online' && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onView(nas)}
                        className="w-full text-primary hover:text-primary/80 h-8 text-xs"
                    >
                        <Eye className="h-3 w-3 mr-1" />
                        View Server Details
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
