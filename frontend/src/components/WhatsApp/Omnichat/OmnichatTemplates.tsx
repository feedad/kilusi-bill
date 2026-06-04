'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileText, Layers } from 'lucide-react'
import MetaTemplatesTab from '@/app/admin/whatsapp/page'

// Import MetaTemplatesTab - it's defined in the main page.tsx file
// For now, we'll create a placeholder that references it

export default function OmnichatTemplates() {
  const [activeSubTab, setActiveSubTab] = useState<'local' | 'meta'>('local')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>
            Manage local notification templates and Omnichat Meta templates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'local' | 'meta')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="local">
                <FileText className="w-4 h-4 mr-2" />
                Local Templates
              </TabsTrigger>
              <TabsTrigger value="meta">
                <Layers className="w-4 h-4 mr-2" />
                Meta Templates (Omnichat)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="local" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Local Templates</CardTitle>
                  <CardDescription>
                    Template pesan lokal untuk notifikasi billing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Local Templates</h3>
                    <p>
                      Template lokal akan ditampilkan di tab Templates utama.
                      Gunakan tab Templates di menu utama untuk mengelola template lokal.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="meta" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Meta Templates (Omnichat)</CardTitle>
                  <CardDescription>
                    Kelola template WhatsApp Business API untuk persetujuan Meta
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <Layers className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Meta Templates</h3>
                    <p>
                      Template Meta akan ditampilkan di tab Meta Templates utama.
                      Gunakan tab Meta Templates di menu utama untuk mengelola template Meta.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
