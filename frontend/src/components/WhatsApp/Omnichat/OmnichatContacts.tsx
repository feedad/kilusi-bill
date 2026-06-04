'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import SyncStatusTab from '../SyncStatusTab'

export default function OmnichatContacts() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Omnichat Contact Sync
          </CardTitle>
          <CardDescription>
            Sinkronisasi kontak pelanggan dengan Omnichat WhatsApp Business API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SyncStatusTab />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button className="w-full" variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync All Contacts
            </Button>
            <Button className="w-full" variant="outline">
              <Users className="w-4 h-4 mr-2" />
              View Contact Statistics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
