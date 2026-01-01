'use client'

import { SNMPSystemInfo } from '../../types'
import {
    Server,
    Clock,
    MapPin,
    User,
    Cpu,
    Layers,
    Award,
    Thermometer,
    Zap,
    Activity,
    Network,
    Users
} from 'lucide-react'

interface Props {
    data?: SNMPSystemInfo | null
    loading?: boolean
}

export function SystemInfoTab({ data, loading }: Props) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                No system information available
            </div>
        )
    }

    const InfoItem = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | number | null | undefined }) => (
        <div className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <Icon className="h-5 w-5 text-gray-400 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{value ?? 'N/A'}</p>
            </div>
        </div>
    )

    const MetricCard = ({ icon: Icon, label, value, unit, color }: {
        icon: any;
        label: string;
        value: number | null | undefined;
        unit?: string;
        color: string
    }) => (
        <div className={`p-4 rounded-lg border ${color}`}>
            <div className="flex items-center space-x-2 mb-2">
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold">
                {value !== null && value !== undefined ? `${value}${unit || ''}` : 'N/A'}
            </p>
        </div>
    )

    return (
        <div className="space-y-6 py-4">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                    icon={Cpu}
                    label="CPU"
                    value={data.cpuUsage}
                    unit="%"
                    color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                />
                <MetricCard
                    icon={Activity}
                    label="Memory"
                    value={data.memoryUsage}
                    unit="%"
                    color="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                />
                <MetricCard
                    icon={Network}
                    label="Interfaces"
                    value={data.interfaceCount}
                    color="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300"
                />
                <MetricCard
                    icon={Users}
                    label="PPPoE Active"
                    value={data.activeConnections}
                    color="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300"
                />
            </div>

            {/* Basic Information */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Basic Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <InfoItem icon={Server} label="System Name" value={data.name} />
                    <InfoItem icon={Clock} label="Uptime" value={data.uptimeFormatted} />
                    <InfoItem icon={MapPin} label="Location" value={data.location} />
                    <InfoItem icon={User} label="Contact" value={data.contact} />
                </div>
            </div>

            {/* System Description */}
            {data.description && data.description !== 'N/A' && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">System Description</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg break-words">
                        {data.description}
                    </p>
                </div>
            )}

            {/* RouterOS/Device Information */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Device Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <InfoItem icon={Layers} label="RouterOS Version" value={data.routerOsVersion} />
                    <InfoItem icon={Server} label="Board/Model" value={data.boardName} />
                    <InfoItem icon={Cpu} label="Architecture" value={data.architecture} />
                    <InfoItem icon={Award} label="License Level" value={data.licenseLevel} />
                </div>
            </div>

            {/* Hardware Information */}
            {(data.cpuCount > 1 || data.cpuTemperature || data.boardTemperature || data.systemVoltage) && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Hardware</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <InfoItem icon={Cpu} label="CPU Count" value={data.cpuCount} />
                        {data.cpuTemperature && (
                            <InfoItem
                                icon={Thermometer}
                                label="CPU Temperature"
                                value={`${data.cpuTemperature}°C`}
                            />
                        )}
                        {data.boardTemperature && (
                            <InfoItem
                                icon={Thermometer}
                                label="Board Temperature"
                                value={`${data.boardTemperature}°C`}
                            />
                        )}
                        {data.systemVoltage && (
                            <InfoItem
                                icon={Zap}
                                label="System Voltage"
                                value={`${data.systemVoltage}V`}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
