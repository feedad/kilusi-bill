'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Plus,
    Search,
    RefreshCw,
    Trash2,
    Power,
    PowerOff
} from 'lucide-react'

interface Props {
    searchTerm: string
    onSearchChange: (value: string) => void
    selectedCount: number
    onRefresh: () => void
    onCreate: () => void
    onBulkDelete: () => void
    onBulkActivate: () => void
    onBulkDeactivate: () => void
    loading?: boolean
}

export function NASToolbar({
    searchTerm,
    onSearchChange,
    selectedCount,
    onRefresh,
    onCreate,
    onBulkDelete,
    onBulkActivate,
    onBulkDeactivate,
    loading
}: Props) {
    return (
        <div className="space-y-3 mb-4">
            {/* Mobile: Stack layout, Desktop: Flex */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                {/* Search - Full width on mobile */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search NAS..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10 w-full"
                    />
                </div>

                {/* Primary Actions */}
                <div className="flex items-center justify-between sm:justify-end space-x-2">
                    <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 sm:mr-1 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>

                    <Button onClick={onCreate} size="sm">
                        <Plus className="h-4 w-4 sm:mr-1" />
                        <span className="hidden sm:inline">Tambah NAS</span>
                        <span className="sm:hidden">Tambah</span>
                    </Button>
                </div>
            </div>

            {/* Bulk Actions - Show when selected */}
            {selectedCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {selectedCount} dipilih
                    </span>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={onBulkActivate}>
                            <Power className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Activate</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={onBulkDeactivate}>
                            <PowerOff className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Deactivate</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={onBulkDelete} className="text-red-500 hover:text-red-600">
                            <Trash2 className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Delete</span>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
