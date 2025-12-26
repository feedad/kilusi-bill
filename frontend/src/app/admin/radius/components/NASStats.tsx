'use client'

import { NAS } from '../types'
import { Card, CardContent } from '@/components/ui/card'
import { Server, CheckCircle, XCircle, Activity } from 'lucide-react'

interface Props {
    nasList: NAS[]
    snmpEnabledCount?: number
}

export function NASStats({ nasList, snmpEnabledCount }: Props) {
    const total = nasList.length
    const online = nasList.filter(n => n.status === 'online').length
    const offline = nasList.filter(n => n.status === 'offline').length
    const snmpEnabled = snmpEnabledCount ?? nasList.filter(n => n.snmp_enabled).length

    const stats = [
        { label: 'Total NAS', value: total, icon: Server, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
        { label: 'Online', value: online, icon: CheckCircle, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
        { label: 'Offline', value: offline, icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
        { label: 'SNMP', value: snmpEnabled, icon: Activity, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' }
    ]

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {stats.map((stat) => (
                <Card key={stat.label}>
                    <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                            <div className={`p-1.5 sm:p-2 rounded-lg ${stat.bg} shrink-0`}>
                                <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.color}`} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{stat.label}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
