import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import {
    X,
    RefreshCw,
    Download,
    Settings,
    Activity,
    Loader2,
    AlertTriangle,
    Wifi
} from 'lucide-react'
import { GenieACSDevice } from '../types'

interface DeviceDetailModalProps {
    device: GenieACSDevice
    isOpen: boolean
    onClose: () => void
    onAction?: (deviceId: string, action: string) => Promise<void>
    onEditSSID?: (device: GenieACSDevice) => void
    actionLoading?: string | null
}

export function DeviceDetailModal({ device, isOpen, onClose, onAction, onEditSSID, actionLoading }: DeviceDetailModalProps) {
    const [confirmAction, setConfirmAction] = useState<string | null>(null)

    if (!isOpen || !device) return null

    const getStatusColor = (status: string | undefined) => {
        if (!status) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
        switch (status.toLowerCase()) {
            case 'connected':
            case 'up':
            case 'online':
                return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            case 'disconnected':
            case 'down':
            case 'offline':
                return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            case 'warning':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
        }
    }

    const modelName = device.model || device.productClass || '-';
    const hardwareVersion = device.hardware_version || '-';
    const softwareVersion = device.software_version || '-';

    const deviceId = device._id || device.id || ''

    const handleAction = (action: string) => {
        if (action === 'reboot' || action === 'resync') {
            setConfirmAction(action)
        } else {
            onAction?.(deviceId, action)
        }
    }

    const executeConfirmedAction = () => {
        if (confirmAction) {
            onAction?.(deviceId, confirmAction)
            setConfirmAction(null)
        }
    }

    const handleEditSSID = () => {
        onEditSSID?.(device)
    }

    const isActionBusy = (action: string) => actionLoading === action

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
            <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Device Details: {device.serialNumber || device.serial || 'Unknown'}</CardTitle>
                    <Button variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <h3 className="font-semibold mb-3">Device Information</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Serial:</span>
                                    <span className="font-mono">{device.serialNumber || device.serial || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Manufacturer:</span>
                                    <span>{device.manufacturer || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Product Class:</span>
                                    <span>{device.productClass || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">OUI:</span>
                                    <span>{device.oui || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Model:</span>
                                    <span>{modelName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Hardware:</span>
                                    <span>{hardwareVersion}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Software:</span>
                                    <span>{softwareVersion}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Customer Information</h3>
                            {device.customer ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Name:</span>
                                        <span>{device.customer.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Username:</span>
                                        <span>{device.customer.pppoe_username}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Phone:</span>
                                        <span>{device.customer.phone}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-muted-foreground text-sm">No customer assigned</p>
                            )}
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">WiFi Information</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">SSID:</span>
                                    <span className="font-medium">{device.ssid || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Password:</span>
                                    <span className="font-mono text-xs">{device.password || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Connected Clients:</span>
                                    <span>{device.userKonek || 0}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">PPPoE Information</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">PPPoE Username:</span>
                                    <span className="font-mono">{device.pppoeUsername || device.customer?.pppoe_username || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Customer Tag:</span>
                                    <span>{device.tag || '-'}</span>
                                </div>
                                {device.rxPower && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">RX Power:</span>
                                        <span>{device.rxPower} dBm</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Connection Status</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">State:</span>
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(device.connectionState)}`}>
                                        {device.connectionState}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Last Inform:</span>
                                    <span>{new Date(device.lastInform).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Tags:</span>
                                    <div className="flex gap-1 flex-wrap justify-end">
                                        {device.tags?.map((tag, index) => (
                                            <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                {tag}
                                            </span>
                                        )) || <span className="text-muted-foreground">No tags</span>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Network Information</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">IP TR-069:</span>
                                    <span className="font-mono">{device.ip_address || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">MAC:</span>
                                    <span className="font-mono">{device.mac_address || device.oui || '-'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-2 lg:col-span-3">
                            <h3 className="font-semibold mb-3">Actions</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleAction('reboot')}
                                    disabled={isActionBusy('reboot')}
                                >
                                    {isActionBusy('reboot') ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                    )}
                                    Reboot
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleAction('resync')}
                                    disabled={isActionBusy('resync')}
                                >
                                    {isActionBusy('resync') ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Download className="h-4 w-4 mr-2" />
                                    )}
                                    Resync
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={handleEditSSID}
                                >
                                    <Wifi className="h-4 w-4 mr-2" />
                                    Edit WiFi
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleAction('diagnostics')}
                                    disabled={isActionBusy('diagnostics')}
                                >
                                    {isActionBusy('diagnostics') ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Activity className="h-4 w-4 mr-2" />
                                    )}
                                    Diagnostics
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>

                {confirmAction && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg z-10" onClick={() => setConfirmAction(null)}>
                        <Card className="max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                            <CardContent className="pt-6">
                                <div className="text-center space-y-4">
                                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30">
                                        <AlertTriangle className="h-6 w-6 text-amber-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold">Konfirmasi</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {confirmAction === 'reboot'
                                                ? 'Yakin ingin me-reboot ONU ini? Koneksi internet akan terputus sementara.'
                                                : 'Refresh parameter dari ONU? Proses membutuhkan waktu beberapa detik.'}
                                        </p>
                                    </div>
                                    <div className="flex space-x-3">
                                        <Button
                                            variant="outline"
                                            className="flex-1"
                                            onClick={() => setConfirmAction(null)}
                                        >
                                            Batal
                                        </Button>
                                        <Button
                                            className="flex-1"
                                            onClick={executeConfirmedAction}
                                            disabled={isActionBusy(confirmAction)}
                                        >
                                            {isActionBusy(confirmAction) ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    Memproses...
                                                </>
                                            ) : (
                                                confirmAction === 'reboot' ? 'Reboot' : 'Resync'
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </Card>
        </div>
    )
}
