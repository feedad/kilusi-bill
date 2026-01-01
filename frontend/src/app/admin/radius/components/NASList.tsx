'use client'

import { NAS, SNMPStats } from '../types'
import { NASCard } from './NASCard'
import { Server, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
    nasList: NAS[]
    snmpStats: { [key: string]: SNMPStats }
    loading: boolean
    error: string | null
    testLoading: { [key: string]: boolean }
    searchTerm: string
    onView: (nas: NAS) => void
    onEdit: (nas: NAS) => void
    onDelete: (nas: NAS) => void
    onTest: (id: string) => void
    onDownloadScript: (nas: NAS) => void
    onRetry: () => void
}

export function NASList({
    nasList,
    snmpStats,
    loading,
    error,
    testLoading,
    searchTerm,
    onView,
    onEdit,
    onDelete,
    onTest,
    onDownloadScript,
    onRetry
}: Props) {
    // Filter NAS based on search term
    const filteredNAS = nasList.filter(nas => {
        if (!searchTerm) return true
        const search = searchTerm.toLowerCase()
        return (
            nas.shortname.toLowerCase().includes(search) ||
            nas.nasname.toLowerCase().includes(search) ||
            (nas.description && nas.description.toLowerCase().includes(search))
        )
    })

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-semibold mb-2">Error Loading Data</h3>
                <p className="text-muted-foreground mb-4">{error}</p>
                <Button onClick={onRetry}>Try Again</Button>
            </div>
        )
    }

    if (filteredNAS.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <Server className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                    {searchTerm ? 'No NAS Found' : 'No NAS Servers'}
                </h3>
                <p className="text-muted-foreground">
                    {searchTerm
                        ? `No NAS matching "${searchTerm}"`
                        : 'Add your first Network Access Server to get started with RADIUS management'
                    }
                </p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {filteredNAS.map((nas) => (
                <NASCard
                    key={nas.id}
                    nas={nas}
                    snmpStats={snmpStats[nas.id]}
                    testLoading={testLoading[nas.id] || false}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onTest={onTest}
                    onDownloadScript={onDownloadScript}
                />
            ))}
        </div>
    )
}
