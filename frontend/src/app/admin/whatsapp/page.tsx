'use client'

import { useEffect, useState } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Smartphone,
  QrCode,
  Settings,
  Send,
  BarChart3,
  MessageSquare,
  Users,
  Clock,
  Zap,
  TrendingUp,
  Activity,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Wifi,
  Battery,
  Play,
  Pause,
  RotateCcw,
  TestTube,
  FileText,
  Download,
  Upload,
  Power,
  PowerOff
} from 'lucide-react'

// Import components
import QRCodeModal from '@/components/WhatsApp/QRCodeModal'
import SettingsModal from '@/components/WhatsApp/SettingsModal'

export default function WhatsAppDashboard() {
  const {
    status,
    settings,
    loading,
    connecting,
    queueStatus,
    queueLength,
    error,
    success,
    fetchStatus,
    connect,
    disconnect,
    restart,
    pauseQueue,
    resumeQueue,
    clearQueue,
    showQRCodeModal,
    showSettingsModal,
    clearMessages
  } = useWhatsAppStore()

  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        clearMessages()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success, clearMessages])

  const getConnectionStatus = () => {
    if (status?.connected) {
      return { text: 'Connected', color: 'bg-green-500', badge: 'default' }
    } else if (connecting) {
      return { text: 'Connecting', color: 'bg-yellow-500', badge: 'secondary' }
    } else {
      return { text: 'Disconnected', color: 'bg-red-500', badge: 'destructive' }
    }
  }

  const getQueueStatus = () => {
    switch (queueStatus) {
      case 'processing':
        return { text: 'Processing', color: 'bg-blue-500', badge: 'default' }
      case 'paused':
        return { text: 'Paused', color: 'bg-orange-500', badge: 'secondary' }
      default:
        return { text: 'Idle', color: 'bg-gray-500', badge: 'outline' }
    }
  }

  const connectionStatus = getConnectionStatus()
  const queueStatusInfo = getQueueStatus()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Smartphone className="w-8 h-8 text-green-500" />
            WhatsApp Notifications
          </h1>
          <p className="text-gray-600">
            Manage WhatsApp notification system, templates, and message delivery
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <SettingsModal>
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </SettingsModal>
        </div>
      </div>

      {/* Alert Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Smartphone className="w-4 h-4" />
              Connection Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${connectionStatus.color}`} />
              <span className="text-2xl font-bold">{connectionStatus.text}</span>
            </div>
            {status?.phoneNumber && (
              <p className="text-sm text-gray-500 mt-1">{status.phoneNumber}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Daily Messages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.dailyCount || 0}</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              <span className="text-xs text-gray-500">12% from yesterday</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Queue Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${queueStatusInfo.color}`} />
              <span className="text-lg font-bold">{queueStatusInfo.text}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{queueLength} messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.successRate || 0}%</div>
            <Progress value={status?.successRate || 0} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard">
            <BarChart3 className="w-4 h-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="templates">
            <MessageSquare className="w-4 h-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="send">
            <Send className="w-4 h-4 mr-2" />
            Send
          </TabsTrigger>
          <TabsTrigger value="queue">
            <Clock className="w-4 h-4 mr-2" />
            Queue
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <TrendingUp className="w-4 h-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="test">
            <TestTube className="w-4 h-4 mr-2" />
            Test
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Connection Control */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Connection Control
                </CardTitle>
                <CardDescription>
                  Manage WhatsApp connection status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {status?.connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="font-medium">Connected to WhatsApp</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Phone:</span>
                        <p className="text-gray-600">{status.phoneNumber}</p>
                      </div>
                      <div>
                        <span className="font-medium">Profile:</span>
                        <p className="text-gray-600">{status.profileName || 'Loading...'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Battery:</span>
                        <p className="text-gray-600">{status.battery ? `${status.battery}%` : 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium">Uptime:</span>
                        <p className="text-gray-600">
                          {status.uptime ? `${Math.floor(status.uptime / 3600)}h ${Math.floor((status.uptime % 3600) / 60)}m` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={restart} disabled={loading}>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restart
                      </Button>
                      <Button variant="destructive" size="sm" onClick={disconnect} disabled={loading}>
                        <PowerOff className="w-4 h-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <span className="font-medium">Not Connected</span>
                    </div>

                    <p className="text-sm text-gray-600">
                      Connect your WhatsApp account to enable notifications.
                    </p>

                    <Button onClick={connect} disabled={connecting} className="w-full">
                      <QrCode className="w-4 h-4 mr-2" />
                      {connecting ? 'Connecting...' : 'Connect WhatsApp'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Common WhatsApp management tasks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" size="sm" className="h-auto p-3 flex-col" disabled={!status?.connected}>
                    <Send className="w-5 h-5 mb-1" />
                    <span className="text-xs">Send Test</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-auto p-3 flex-col" disabled={!status?.connected}>
                    <Users className="w-5 h-5 mb-1" />
                    <span className="text-xs">Broadcast</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-auto p-3 flex-col" disabled={!status?.connected}>
                    <FileText className="w-5 h-5 mb-1" />
                    <span className="text-xs">Templates</span>
                  </Button>
                  <Button variant="outline" size="sm" className="h-auto p-3 flex-col" disabled={!status?.connected}>
                    <Download className="w-5 h-5 mb-1" />
                    <span className="text-xs">Export</span>
                  </Button>
                </div>

                <div className="pt-2 border-t">
                  <h4 className="font-medium text-sm mb-2">Queue Management</h4>
                  <div className="flex gap-2">
                    {queueStatus === 'processing' ? (
                      <Button variant="outline" size="sm" onClick={pauseQueue}>
                        <Pause className="w-4 h-4 mr-2" />
                        Pause
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={resumeQueue}>
                        <Play className="w-4 h-4 mr-2" />
                        Resume
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={clearQueue}>
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Latest WhatsApp message delivery activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { time: '2 min ago', action: 'Invoice sent', recipient: '+6281234567890', status: 'success' },
                  { time: '5 min ago', action: 'Payment reminder', recipient: '+6281234567891', status: 'success' },
                  { time: '10 min ago', action: 'Welcome message', recipient: '+6281234567892', status: 'success' },
                  { time: '15 min ago', action: 'Service disruption', recipient: '234 customers', status: 'success' },
                ].map((activity, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <div className="flex items-center gap-3">
                      <Badge variant={activity.status === 'success' ? 'default' : 'destructive'} className="w-2 h-2 rounded-full p-0" />
                      <div>
                        <p className="font-medium text-sm">{activity.action}</p>
                        <p className="text-xs text-gray-500">{activity.recipient}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{activity.time}</p>
                      {activity.status === 'success' ? (
                        <CheckCircle className="w-3 h-3 text-green-500 ml-auto" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-red-500 ml-auto" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Message Templates</h3>
            <Button>
              <MessageSquare className="w-4 h-4 mr-2" />
              New Template
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[
              {
                key: 'invoice_created',
                title: 'Invoice Created',
                description: 'Sent when new invoice is generated',
                usage: 145,
                enabled: true,
                category: 'billing'
              },
              {
                key: 'due_date_reminder',
                title: 'Due Date Reminder',
                description: 'Sent before payment due date',
                usage: 89,
                enabled: true,
                category: 'billing'
              },
              {
                key: 'payment_received',
                title: 'Payment Confirmation',
                description: 'Sent when payment is confirmed',
                usage: 34,
                enabled: true,
                category: 'billing'
              },
              {
                key: 'service_disruption',
                title: 'Service Disruption',
                description: 'Sent during service interruptions',
                usage: 2,
                enabled: false,
                category: 'service'
              }
            ].map((template) => (
              <Card key={template.key} className={template.enabled ? '' : 'opacity-60'}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{template.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={template.enabled ? 'default' : 'secondary'}>
                        {template.enabled ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Used {template.usage} times today
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">Edit</Button>
                      <Button variant="ghost" size="sm">Test</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Send Message Tab */}
        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Send WhatsApp Message</CardTitle>
              <CardDescription>Send individual or bulk messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Send className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Message Composer</h3>
                <p className="text-gray-500 mb-4">
                  Compose and send WhatsApp messages to customers
                </p>
                <Button disabled={!status?.connected}>
                  <Send className="w-4 h-4 mr-2" />
                  Compose Message
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Queue Management Tab */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Message Queue
              </CardTitle>
              <CardDescription>
                Monitor and manage message delivery queue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">{queueLength}</div>
                      <div className="text-sm text-gray-600">Queued Messages</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-green-600">{status?.dailyCount || 0}</div>
                      <div className="text-sm text-gray-600">Sent Today</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-purple-600">{status?.successRate || 0}%</div>
                      <div className="text-sm text-gray-600">Success Rate</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex justify-center gap-2">
                  {queueStatus === 'processing' ? (
                    <Button variant="outline" onClick={pauseQueue}>
                      <Pause className="w-4 h-4 mr-2" />
                      Pause Queue
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={resumeQueue}>
                      <Play className="w-4 h-4 mr-2" />
                      Resume Queue
                    </Button>
                  )}
                  <Button variant="outline" onClick={clearQueue}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Clear Queue
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics & Reports</CardTitle>
              <CardDescription>Detailed analytics and reporting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">WhatsApp Analytics</h3>
                <p className="text-gray-500 mb-4">
                  View detailed analytics and export reports
                </p>
                <Button>
                  <Download className="w-4 h-4 mr-2" />
                  View Analytics
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Lab Tab */}
        <TabsContent value="test" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5" />
                Test Laboratory
              </CardTitle>
              <CardDescription>
                Test WhatsApp templates and connection
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <Smartphone className="w-8 h-8 mx-auto text-green-500 mb-2" />
                        <h4 className="font-medium">Connection Test</h4>
                        <p className="text-sm text-gray-500 mb-3">Test WhatsApp connection</p>
                        <Button variant="outline" size="sm">Test Connection</Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <MessageSquare className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                        <h4 className="font-medium">Template Test</h4>
                        <p className="text-sm text-gray-500 mb-3">Test message templates</p>
                        <Button variant="outline" size="sm">Test Template</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* QR Code Modal */}
      <QRCodeModal />
    </div>
  )
}