'use client'

import { useState, useEffect, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NAS } from '../types'
import { useNASDetail } from '../hooks/useNASDetail'
import { getStatusColor, formatDate } from '../utils'
import { SystemInfoTab } from './NASDetailTabs/SystemInfoTab'
import { ResourcesTab } from './NASDetailTabs/ResourcesTab'
import { InterfacesTab } from './NASDetailTabs/InterfacesTab'
import {
    Server,
    Cpu,
    Network,
    CheckCircle,
    XCircle,
    AlertCircle,
    Edit
} from 'lucide-react'

interface Props {
    nas: NAS | null
    open: boolean
    onClose: () => void
    onEdit?: (nas: NAS) => void
}

type TabType = 'system' | 'resources' | 'interfaces'

const AUTO_REFRESH_INTERVAL = 5000 // 5 seconds for realtime traffic

export function NASDetailModal({ nas, open, onClose, onEdit }: Props) {
    const [activeTab, setActiveTab] = useState<TabType>('system')
    const { detail, loading, silentRefresh } = useNASDetail(nas?.id || null)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    // Auto-refresh for interfaces tab
    useEffect(() => {
        if (open && activeTab === 'interfaces') {
            intervalRef.current = setInterval(() => {
                silentRefresh()
            }, AUTO_REFRESH_INTERVAL)
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
        }
    }, [open, activeTab, silentRefresh])

    const getStatusIcon = (status: NAS['status']) => {
        switch (status) {
            case 'online':
                return <CheckCircle className="h-4 w-4 text-green-500" />
            case 'offline':
                return <XCircle className="h-4 w-4 text-red-500" />
            default:
                return <AlertCircle className="h-4 w-4 text-gray-500" />
        }
    }

    const tabs = [
        { id: 'system' as TabType, label: 'System Info', icon: Server },
        { id: 'resources' as TabType, label: 'Resources', icon: Cpu },
        { id: 'interfaces' as TabType, label: 'Interfaces', icon: Network }
    ]

    if (!nas) return null

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={`Detail - ${nas.shortname}`}
            size="xl"
        >
            <div className="space-y-4">
                {/* Header with status */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <Server className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{nas.shortname}</h3>
                                <Badge className={getStatusColor(nas.status)}>
                                    <span className="flex items-center space-x-1">
                                        {getStatusIcon(nas.status)}
                                        <span className="capitalize">{nas.status}</span>
                                    </span>
                                </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{nas.nasname}</p>
                        </div>
                    </div>
                </div>

                {/* SNMP Not Enabled Warning */}
                {detail && !detail.enabled && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <div className="flex items-center space-x-2">
                            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                            <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                {detail.message || 'SNMP is not enabled for this NAS'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                {(!detail || detail.enabled) && (
                    <>
                        <div className="flex space-x-1 border-b border-gray-200 dark:border-gray-700">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                        }`}
                                >
                                    <tab.icon className="h-4 w-4" />
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[300px]">
                            {activeTab === 'system' && (
                                <SystemInfoTab data={detail?.system} loading={loading} />
                            )}
                            {activeTab === 'resources' && (
                                <ResourcesTab data={detail?.resources} loading={loading} />
                            )}
                            {activeTab === 'interfaces' && (
                                <InterfacesTab data={detail?.interfaces} loading={loading} />
                            )}
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                        Last seen: {formatDate(nas.last_seen)}
                    </div>
                    <div className="flex space-x-2">
                        <Button variant="outline" onClick={onClose}>
                            Close
                        </Button>
                        {onEdit && (
                            <Button onClick={() => { onClose(); onEdit(nas); }}>
                                <Edit className="h-4 w-4 mr-1" />
                                Edit NAS
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    )
}
