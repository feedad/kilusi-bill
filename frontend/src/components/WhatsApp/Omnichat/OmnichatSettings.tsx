'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Settings, Server, Radio, TestTube } from 'lucide-react'
import ProviderTab from '@/app/admin/whatsapp/page'
import GatewaySettings from '../GatewaySettings'

type SettingsSubTab = 'provider' | 'gateway' | 'test'

export default function OmnichatSettings() {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('provider')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Omnichat Configuration</CardTitle>
          <CardDescription>
            Configure Omnichat API, manage gateway settings, and test connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as SettingsSubTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="provider">
                <Server className="w-4 h-4 mr-2" />
                Provider
              </TabsTrigger>
              <TabsTrigger value="gateway">
                <Settings className="w-4 h-4 mr-2" />
                Gateway
              </TabsTrigger>
              <TabsTrigger value="test">
                <TestTube className="w-4 h-4 mr-2" />
                Test
              </TabsTrigger>
            </TabsList>

            <TabsContent value="provider" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Provider Selection</CardTitle>
                  <CardDescription>
                    Pilih provider WhatsApp utama dan konfigurasi fallback
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <Radio className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Provider Settings</h3>
                    <p>
                      Pengaturan provider akan ditampilkan di tab Provider utama.
                      Gunakan tab Provider di menu utama untuk mengkonfigurasi Omnichat & Baileys.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gateway" className="space-y-4 mt-4">
              <GatewaySettings />
            </TabsContent>

            <TabsContent value="test" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Test Connection</CardTitle>
                  <CardDescription>
                    Test koneksi ke Omnichat API dan kirim pesan test
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <TestTube className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Test Features</h3>
                    <p>
                      Fitur test akan ditampilkan di tab Test utama.
                      Gunakan tab Test di menu utama untuk menguji koneksi dan kirim pesan test.
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
