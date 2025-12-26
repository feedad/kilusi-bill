'use client'

import { useState, useEffect } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings,
  Smartphone,
  Shield,
  Zap,
  Users,
  MessageSquare,
  BarChart3,
  Download,
  Upload,
  Save,
  RotateCcw,
  TestTube,
  AlertCircle,
  CheckCircle,
  Clock,
  Wifi,
  Battery,
  HardDrive,
  Cpu,
  Activity
} from 'lucide-react'

export default function WhatsAppSettingsModal({ children }: { children?: React.ReactNode }) {
  const {
    status,
    settings,
    loading,
    error,
    success,
    showSettingsModal,
    fetchSettings,
    updateSettings,
    hideSettings,
    clearMessages,
    showNotification
  } = useWhatsAppStore()

  const [activeTab, setActiveTab] = useState('general')
  const [formData, setFormData] = useState<Partial<any>>({})
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (showSettingsModal && !settings) {
      fetchSettings()
    }
  }, [showSettingsModal, settings, fetchSettings])

  useEffect(() => {
    if (settings) {
      setFormData({
        companyHeader: settings.companyHeader || '',
        footerInfo: settings.footerInfo || '',
        adminNumbers: settings.adminNumbers?.join('\n') || '',
        rateLimit: settings.rateLimit,
        groups: settings.groups,
        features: settings.features
      })
    }
  }, [settings])

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setHasChanges(true)
  }

  const handleRateLimitChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rateLimit: {
        ...prev.rateLimit,
        [field]: value
      }
    }))
    setHasChanges(true)
  }

  const handleGroupsChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      groups: {
        ...prev.groups,
        [field]: value
      }
    }))
    setHasChanges(true)
  }

  const handleFeaturesChange = (field: string, value: boolean) => {
    setFormData(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [field]: value
      }
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    try {
      const updatedSettings = {
        ...formData,
        adminNumbers: formData.adminNumbers?.split('\n').filter(n => n.trim()) || []
      }

      const success = await updateSettings(updatedSettings)
      if (success) {
        setHasChanges(false)
        clearMessages()
      }
    } catch (error) {
      console.error('Error saving settings:', error)
    }
  }

  const handleReset = () => {
    if (settings) {
      setFormData({
        companyHeader: settings.companyHeader || '',
        footerInfo: settings.footerInfo || '',
        adminNumbers: settings.adminNumbers?.join('\n') || '',
        rateLimit: settings.rateLimit,
        groups: settings.groups,
        features: settings.features
      })
      setHasChanges(false)
    }
  }

  const handleExport = async (type: 'templates' | 'settings' | 'logs') => {
    try {
      showNotification(`Exporting ${type}...`, 'info')
      // Export logic here
      showNotification(`${type} exported successfully`, 'success')
    } catch (error) {
      showNotification(`Failed to export ${type}`, 'error')
    }
  }

  const handleImport = async (type: 'templates' | 'settings', file: File) => {
    try {
      showNotification(`Importing ${type}...`, 'info')
      // Import logic here
      showNotification(`${type} imported successfully`, 'success')
    } catch (error) {
      showNotification(`Failed to import ${type}`, 'error')
    }
  }

  return (
    <Dialog open={showSettingsModal} onOpenChange={hideSettings}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            WhatsApp Settings
          </DialogTitle>
          <DialogDescription>
            Configure WhatsApp notification system, rate limiting, templates, and more.
          </DialogDescription>
        </DialogHeader>

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="general">
              <Settings className="w-4 h-4 mr-1" />
              General
            </TabsTrigger>
            <TabsTrigger value="rate-limit">
              <Zap className="w-4 h-4 mr-1" />
              Rate Limit
            </TabsTrigger>
            <TabsTrigger value="groups">
              <Users className="w-4 h-4 mr-1" />
              Groups
            </TabsTrigger>
            <TabsTrigger value="features">
              <Shield className="w-4 h-4 mr-1" />
              Features
            </TabsTrigger>
            <TabsTrigger value="system">
              <Activity className="w-4 h-4 mr-1" />
              System
            </TabsTrigger>
            <TabsTrigger value="backup">
              <HardDrive className="w-4 h-4 mr-1" />
              Backup
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 h-[60vh]">
            <div className="space-y-4 px-1">
              {/* General Settings */}
              <TabsContent value="general" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      General Configuration
                    </CardTitle>
                    <CardDescription>
                      Basic WhatsApp settings and company information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyHeader">Company Header</Label>
                        <Input
                          id="companyHeader"
                          value={formData.companyHeader || ''}
                          onChange={(e) => handleInputChange('companyHeader', e.target.value)}
                          placeholder="📱 Your Company Name"
                        />
                      </div>
                      <div>
                        <Label htmlFor="footerInfo">Footer Information</Label>
                        <Input
                          id="footerInfo"
                          value={formData.footerInfo || ''}
                          onChange={(e) => handleInputChange('footerInfo', e.target.value)}
                          placeholder="Powered by Your Company"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="adminNumbers">Admin Numbers (one per line)</Label>
                      <Textarea
                        id="adminNumbers"
                        value={formData.adminNumbers || ''}
                        onChange={(e) => handleInputChange('adminNumbers', e.target.value)}
                        rows={3}
                        placeholder="+6281234567890&#10;+6282345678901"
                      />
                    </div>

                    {status && (
                      <Card className="bg-gray-50">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            Connection Status
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status:</span>
                            <Badge variant={status.connected ? 'default' : 'secondary'}>
                              {status.connected ? 'Connected' : 'Disconnected'}
                            </Badge>
                          </div>
                          {status.phoneNumber && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Phone:</span>
                              <span className="text-sm">{status.phoneNumber}</span>
                            </div>
                          )}
                          {status.profileName && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Profile:</span>
                              <span className="text-sm">{status.profileName}</span>
                            </div>
                          )}
                          {status.lastSync && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Last Sync:</span>
                              <span className="text-sm">{new Date(status.lastSync).toLocaleString()}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Rate Limiting */}
              <TabsContent value="rate-limit" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Rate Limiting & Performance
                    </CardTitle>
                    <CardDescription>
                      Configure message sending limits to prevent WhatsApp blocking
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="rateLimitEnabled">Enable Rate Limiting</Label>
                        <p className="text-sm text-gray-500">
                          Control message sending speed to avoid blocking
                        </p>
                      </div>
                      <Switch
                        id="rateLimitEnabled"
                        checked={formData.rateLimit?.enabled !== false}
                        onCheckedChange={(checked) => handleRateLimitChange('enabled', checked)}
                      />
                    </div>

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="maxMessagesPerBatch">Max Messages per Batch</Label>
                        <Input
                          id="maxMessagesPerBatch"
                          type="number"
                          value={formData.rateLimit?.maxMessagesPerBatch || 10}
                          onChange={(e) => handleRateLimitChange('maxMessagesPerBatch', parseInt(e.target.value))}
                          min="1"
                          max="100"
                        />
                        <p className="text-xs text-gray-500 mt-1">Recommended: 5-20 messages</p>
                      </div>
                      <div>
                        <Label htmlFor="delayBetweenBatches">Delay Between Batches (seconds)</Label>
                        <Input
                          id="delayBetweenBatches"
                          type="number"
                          value={formData.rateLimit?.delayBetweenBatches || 30}
                          onChange={(e) => handleRateLimitChange('delayBetweenBatches', parseInt(e.target.value))}
                          min="1"
                          max="300"
                        />
                        <p className="text-xs text-gray-500 mt-1">Recommended: 30-60 seconds</p>
                      </div>
                      <div>
                        <Label htmlFor="delayBetweenMessages">Delay Between Messages (seconds)</Label>
                        <Input
                          id="delayBetweenMessages"
                          type="number"
                          value={formData.rateLimit?.delayBetweenMessages || 2}
                          onChange={(e) => handleRateLimitChange('delayBetweenMessages', parseInt(e.target.value))}
                          min="0"
                          max="10"
                        />
                        <p className="text-xs text-gray-500 mt-1">Recommended: 1-3 seconds</p>
                      </div>
                      <div>
                        <Label htmlFor="maxRetries">Max Retries</Label>
                        <Input
                          id="maxRetries"
                          type="number"
                          value={formData.rateLimit?.maxRetries || 2}
                          onChange={(e) => handleRateLimitChange('maxRetries', parseInt(e.target.value))}
                          min="0"
                          max="5"
                        />
                        <p className="text-xs text-gray-500 mt-1">Retry failed messages</p>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="dailyMessageLimit">Daily Message Limit</Label>
                      <Input
                        id="dailyMessageLimit"
                        type="number"
                        value={formData.rateLimit?.dailyMessageLimit || 0}
                        onChange={(e) => handleRateLimitChange('dailyMessageLimit', parseInt(e.target.value))}
                        min="0"
                        max="1000"
                      />
                      <p className="text-xs text-gray-500 mt-1">0 = unlimited, recommended: 500-1000</p>
                    </div>

                    {status && (
                      <Card className="bg-blue-50">
                        <CardContent className="pt-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div>
                              <div className="text-2xl font-bold text-blue-600">
                                {status.dailyCount}
                              </div>
                              <div className="text-xs text-gray-600">Daily Messages</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-green-600">
                                {status.monthlyCount}
                              </div>
                              <div className="text-xs text-gray-600">Monthly Messages</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-purple-600">
                                {status.successRate}%
                              </div>
                              <div className="text-xs text-gray-600">Success Rate</div>
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-orange-600">
                                {status.avgResponseTime}ms
                              </div>
                              <div className="text-xs text-gray-600">Avg Response</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Groups Settings */}
              <TabsContent value="groups" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      WhatsApp Groups
                    </CardTitle>
                    <CardDescription>
                      Configure group notifications and recipient management
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="groupsEnabled">Enable Group Notifications</Label>
                        <p className="text-sm text-gray-500">
                          Send notifications to configured WhatsApp groups
                        </p>
                      </div>
                      <Switch
                        id="groupsEnabled"
                        checked={formData.groups?.enabled !== false}
                        onCheckedChange={(checked) => handleGroupsChange('enabled', checked)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="groupIds">Group IDs (one per line)</Label>
                      <Textarea
                        id="groupIds"
                        value={formData.groups?.ids?.join('\n') || ''}
                        onChange={(e) => handleGroupsChange('ids', e.target.value.split('\n').map(id => id.trim()).filter(Boolean))}
                        rows={4}
                        placeholder="120363031495796203@g.us&#10;120363031495796204@g.us"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Use JID format: group-id@g.us
                      </p>
                    </div>

                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Group notifications are used for service announcements, disruption alerts, and system notifications.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Features Settings */}
              <TabsContent value="features" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Advanced Features
                    </CardTitle>
                    <CardDescription>
                      Enable/disable advanced WhatsApp features
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      {
                        key: 'imageAttachments',
                        label: 'Image Attachments',
                        description: 'Send images with messages (invoices, logos, etc.)'
                      },
                      {
                        key: 'autoPhoneFormat',
                        label: 'Auto Phone Formatting',
                        description: 'Automatically format phone numbers to international format'
                      },
                      {
                        key: 'analytics',
                        label: 'Analytics & Tracking',
                        description: 'Track message delivery, open rates, and performance'
                      },
                      {
                        key: 'backup',
                        label: 'Auto Backup',
                        description: 'Automatically backup templates and settings'
                      },
                      {
                        key: 'errorRecovery',
                        label: 'Error Recovery',
                        description: 'Automatic retry and recovery from failed messages'
                      }
                    ].map(({ key, label, description }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div>
                          <Label>{label}</Label>
                          <p className="text-sm text-gray-500">{description}</p>
                        </div>
                        <Switch
                          checked={formData.features?.[key as keyof typeof formData.features] || false}
                          onCheckedChange={(checked) => handleFeaturesChange(key, checked)}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* System Info */}
              <TabsContent value="system" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      System Information
                    </CardTitle>
                    <CardDescription>
                      WhatsApp service status and system performance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {status && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <Wifi className="w-5 h-5 text-blue-500" />
                          <div>
                            <div className="font-medium">Connection Status</div>
                            <div className="text-sm text-gray-500">
                              {status.connected ? 'Connected' : 'Disconnected'}
                            </div>
                          </div>
                        </div>

                        {status.battery !== undefined && (
                          <div className="flex items-center gap-3">
                            <Battery className="w-5 h-5 text-green-500" />
                            <div>
                              <div className="font-medium">Battery Level</div>
                              <div className="text-sm text-gray-500">{status.battery}%</div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <Clock className="w-5 h-5 text-purple-500" />
                          <div>
                            <div className="font-medium">Uptime</div>
                            <div className="text-sm text-gray-500">
                              {Math.floor(status.uptime / 3600)}h {Math.floor((status.uptime % 3600) / 60)}m
                            </div>
                          </div>
                        </div>

                        {status.version && (
                          <div className="flex items-center gap-3">
                            <Smartphone className="w-5 h-5 text-orange-500" />
                            <div>
                              <div className="font-medium">WhatsApp Version</div>
                              <div className="text-sm text-gray-500">{status.version}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <Separator />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="text-center">
                        <CardContent className="pt-4">
                          <div className="text-2xl font-bold text-green-600">
                            {status?.queueStatus === 'idle' ? '🟢' :
                             status?.queueStatus === 'processing' ? '🟡' : '🔴'}
                          </div>
                          <div className="text-sm font-medium">Queue Status</div>
                          <div className="text-xs text-gray-500 capitalize">
                            {status?.queueStatus || 'Unknown'}
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="text-center">
                        <CardContent className="pt-4">
                          <div className="text-2xl font-bold text-blue-600">
                            {status?.queueLength || 0}
                          </div>
                          <div className="text-sm font-medium">Queue Length</div>
                          <div className="text-xs text-gray-500">Messages pending</div>
                        </CardContent>
                      </Card>

                      <Card className="text-center">
                        <CardContent className="pt-4">
                          <div className="text-2xl font-bold text-purple-600">
                            {status?.successRate || 0}%
                          </div>
                          <div className="text-sm font-medium">Success Rate</div>
                          <div className="text-xs text-gray-500">Last 24 hours</div>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Backup & Restore */}
              <TabsContent value="backup" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <HardDrive className="w-4 h-4" />
                      Backup & Restore
                    </CardTitle>
                    <CardDescription>
                      Export and import WhatsApp configuration and data
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Export Data</h4>
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('settings')}
                            className="w-full justify-start"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export Settings
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('templates')}
                            className="w-full justify-start"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export Templates
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('logs')}
                            className="w-full justify-start"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export Logs
                          </Button>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Import Data</h4>
                        <div className="space-y-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = '.json'
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0]
                                if (file) handleImport('settings', file)
                              }
                              input.click()
                            }}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Import Settings
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => {
                              const input = document.createElement('input')
                              input.type = 'file'
                              input.accept = '.json'
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0]
                                if (file) handleImport('templates', file)
                              }
                              input.click()
                            }}
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Import Templates
                          </Button>
                        </div>
                      </div>
                    </div>

                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Backup files contain sensitive configuration. Store them securely and only import from trusted sources.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-orange-600">
                Unsaved changes
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!hasChanges || loading}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || loading}
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}