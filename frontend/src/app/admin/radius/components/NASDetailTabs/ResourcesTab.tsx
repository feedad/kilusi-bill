'use client'

import { SNMPResources } from '../../types'
import { formatBytes, getProgressColor, clampPercentage } from '../../utils'
import { Cpu, HardDrive, MemoryStick } from 'lucide-react'

interface Props {
    data?: SNMPResources | null
    loading?: boolean
}

function ProgressBar({ value, label, icon: Icon }: { value: number; label: string; icon: any }) {
    const pct = clampPercentage(value)
    return (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                    <Icon className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</span>
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{pct.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                    className={`h-2.5 rounded-full ${getProgressColor(pct)}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}

export function ResourcesTab({ data, loading }: Props) {
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
                No resource information available
            </div>
        )
    }

    return (
        <div className="space-y-6 py-4">
            {/* CPU & Memory */}
            <div className="grid grid-cols-2 gap-4">
                <ProgressBar icon={Cpu} label="CPU Usage" value={data.cpuUsage} />
                <ProgressBar icon={MemoryStick} label="Memory Usage" value={data.memory.usedPct} />
            </div>

            {/* Memory Details */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Memory Details</h4>
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatBytes(data.memory.total)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Used</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatBytes(data.memory.used)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Free</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatBytes(data.memory.total - data.memory.used)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Storage */}
            {data.storage && data.storage.length > 0 && (
                <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Storage</h4>
                    <div className="space-y-3">
                        {data.storage.map((disk, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center space-x-2">
                                        <HardDrive className="h-4 w-4 text-gray-400" />
                                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                            {disk.name || `Disk ${index + 1}`}
                                        </span>
                                    </div>
                                    <span className="text-sm text-gray-900 dark:text-gray-100">
                                        {formatBytes(disk.used)} / {formatBytes(disk.total)}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${getProgressColor(disk.usedPct)}`}
                                        style={{ width: `${clampPercentage(disk.usedPct)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
