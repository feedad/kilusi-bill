import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import {
    X,
    RefreshCw,
    Download,
    Settings,
    Activity
} from 'lucide-react'
import { GenieACSDevice } from '../types'

interface DeviceDetailModalProps {
    device: GenieACSDevice
    isOpen: boolean
    onClose: () => void
}

export function DeviceDetailModal({ device, isOpen, onClose }: DeviceDetailModalProps) {
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

    // Safety helpers for optional chaining with potential 'never' or '_value' types
    const getParam = (path: any) => {
        if (typeof path === 'string') return path;
        if (path && typeof path === 'object' && '_value' in path) return path._value;
        return '-';
    }

    const modelName = getParam((device.parameters?.InternetGatewayDevice?.DeviceInfo as any)?.ModelName);
    const hardwareVersion = getParam((device.parameters?.InternetGatewayDevice?.DeviceInfo as any)?.HardwareVersion);
    const softwareVersion = getParam((device.parameters?.InternetGatewayDevice?.DeviceInfo as any)?.SoftwareVersion);
    const wanIp = getParam((device.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1'] as any)?.ExternalIPAddress);
    const wanMac = getParam((device.parameters?.InternetGatewayDevice?.WANDevice?.['1']?.WANConnectionDevice?.['1'] as any)?.MACAddress);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
                                    <span className="text-muted-foreground">WAN IP:</span>
                                    <span className="font-mono">{wanIp}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">WAN MAC:</span>
                                    <span className="font-mono">{wanMac}</span>
                                </div>
                            </div>
                        </div>

                        <div className="md:col-span-2 lg:col-span-3">
                            <h3 className="font-semibold mb-3">Actions</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <Button variant="outline" size="sm" className="w-full">
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Reboot
                                </Button>
                                <Button variant="outline" size="sm" className="w-full">
                                    <Download className="h-4 w-4 mr-2" />
                                    Resync
                                </Button>
                                <Button variant="outline" size="sm" className="w-full">
                                    <Settings className="h-4 w-4 mr-2" />
                                    Configure
                                </Button>
                                <Button variant="outline" size="sm" className="w-full">
                                    <Activity className="h-4 w-4 mr-2" />
                                    Diagnostics
                                </Button>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
