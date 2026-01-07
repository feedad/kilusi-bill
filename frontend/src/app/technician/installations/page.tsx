'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Wrench } from 'lucide-react'

export default function InstallationsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Daily Installations</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wrench className="h-5 w-5" />
                        Scheduled Installations
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-10 text-muted-foreground">
                        <p>Installation list feature is currently being integrated with the new scheduling system.</p>
                        <p className="text-sm mt-2">Please check "My Tickets" for assigned installation tasks.</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
