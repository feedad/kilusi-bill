'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Send, Clock, History } from 'lucide-react'
import MessageQueueMonitor from '../MessageQueueMonitor'
import MessageLogsTab from '../MessageLogsTab'

type MessagesSubTab = 'send' | 'queue' | 'logs'

export default function OmnichatMessages() {
  const [activeSubTab, setActiveSubTab] = useState<MessagesSubTab>('logs')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Send broadcast messages, monitor queue, and view message logs via Omnichat
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as MessagesSubTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="send">
                <Send className="w-4 h-4 mr-2" />
                Send Message
              </TabsTrigger>
              <TabsTrigger value="queue">
                <Clock className="w-4 h-4 mr-2" />
                Queue Monitor
              </TabsTrigger>
              <TabsTrigger value="logs">
                <History className="w-4 h-4 mr-2" />
                Message Logs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="send" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Send Broadcast Message</CardTitle>
                  <CardDescription>
                    Kirim pesan WhatsApp massal ke pelanggan via Omnichat API
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    <Send className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Broadcast Feature</h3>
                    <p>
                      Fitur broadcast akan diimplementasikan di tab Send utama.
                      Gunakan tab Send di menu utama untuk mengirim pesan broadcast.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="queue" className="space-y-4 mt-4">
              <MessageQueueMonitor />
            </TabsContent>

            <TabsContent value="logs" className="space-y-4 mt-4">
              <MessageLogsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
