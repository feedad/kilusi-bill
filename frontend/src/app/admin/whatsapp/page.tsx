'use client'

import { useEffect, useState, useRef } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { useWhatsAppWebSocket } from '@/hooks/useWhatsAppWebSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { whatsappAPI } from '@/lib/whatsapp-api'
import { CONFIG } from '@/lib/config'
import { adminApi } from '@/lib/api-clients'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
  TestTube,
  FileText,
  Download,
  Upload,
  Power,
  PowerOff,
  RotateCcw as RedoIcon,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  MapPin,
  Globe,
  UserCheck,
  Eye,
  Loader2,
  Filter,
  Trash2
} from 'lucide-react'

// Import components
import QRCodeModal from '@/components/WhatsApp/QRCodeModal'
import SettingsModal from '@/components/WhatsApp/SettingsModal'
import RealTimeAnalytics from '@/components/WhatsApp/RealTimeAnalytics'
import MessageQueueMonitor from '@/components/WhatsApp/MessageQueueMonitor'
import RealTimeNotifications from '@/components/WhatsApp/RealTimeNotifications'
import GatewaySettings from '@/components/WhatsApp/GatewaySettings'
import { OmnichatDashboard } from '@/components/WhatsApp/Omnichat'
import CreateTemplateModal from '@/components/WhatsApp/CreateTemplateModal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

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
    showQRCodeModal,
    showSettingsModal,
    clearMessages
  } = useWhatsAppStore()

  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [messagesPerPage] = useState(20)

  // Omnichat status state
  const [omnichatStatus, setOmnichatStatus] = useState<{
    connected: boolean
    api_url: string
    api_key_valid: boolean
    gateway: string
    fallback_enabled: boolean
    daily_messages?: number
    delivery_rate?: number
  }>({ connected: false, api_url: '', api_key_valid: false, gateway: 'omnichat', fallback_enabled: false })
  
  // Baileys status state
  const [baileysStatus, setBaileysStatus] = useState<{
    connected: boolean;
    qr: string | null;
    pairingCode: string | null;
    user: any;
    loading: boolean;
  }>({ connected: false, qr: null, pairingCode: null, user: null, loading: false })
  const [loadingOmnichat, setLoadingOmnichat] = useState(false)

  // Omnichat settings state (for Settings tab)
  const [omnichatSettings, setOmnichatSettings] = useState({
    api_url: 'https://whatsapp.kilusi.id/api',
    api_key: '',
    timeout: 30000,
    retry_count: 3,
    sync_enabled: false,
    sync_schedule: 'daily',
    sync_time: '02:00',
    sync_tags_enabled: true
  })
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')

  // Baileys specific settings state
  const [baileysDelaySettings, setBaileysDelaySettings] = useState({
    min: '100',
    max: '600'
  })

  // Fetch Omnichat status
  const fetchOmnichatStatus = async () => {
    try {
      setLoadingOmnichat(true)

      // Fetch both status and stats in parallel
      const [statusResponse, statsResponse] = await Promise.all([
        fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat/status`),
        fetch(`${CONFIG.API_BASE_URL}/api/v1/omnichat/stats`)
      ])

      const statusData = await statusResponse.json()
      const statsData = await statsResponse.json()

      if (statusData.success) {
        setOmnichatStatus(prev => ({
          ...prev,
          connected: statusData.data.connected,
          api_key_valid: statusData.data.api_key_valid,
          gateway: statusData.data.provider || 'omnichat',
          fallback_enabled: statusData.data.fallback_enabled
        }))
      }

      if (statsData.success) {
        setOmnichatStatus(prev => ({
          ...prev,
          daily_messages: statsData.data.daily_messages,
          delivery_rate: statsData.data.delivery_rate
        }))
      }
    } catch (error) {
      console.error('Error fetching Omnichat status:', error)
    } finally {
      setLoadingOmnichat(false)
    }
  }

  // Fetch Baileys status & QR
  const fetchBaileysStatus = async () => {
    try {
      const response = await adminApi.get('/api/v1/baileys/status')
      if (response.data.success) {
        setBaileysStatus(prev => ({
          ...prev,
          connected: response.data.data.connected,
          user: response.data.data.user
        }))
        
        // If not connected, try to fetch QR
        if (!response.data.data.connected) {
          try {
            const qrResponse = await adminApi.get('/api/v1/baileys/qr')
            if (qrResponse.data.success) {
              setBaileysStatus(prev => ({ ...prev, qr: qrResponse.data.data.qr }))
            }
          } catch (qrErr) {
            console.warn('QR not available yet:', qrErr)
          }
        }
      }
    } catch (error: any) {
      // Don't log 401 errors repeatedly - user just needs to login
      if (error?.response?.status !== 401) {
        console.error('Error fetching Baileys status:', error)
      }
    }
  }
  const fetchOmnichatSettings = async () => {
    try {
      const response = await adminApi.get('/api/v1/settings/omnichat')
      if (response.data.success && response.data.data) {
        setOmnichatSettings(prev => ({
          ...prev,
          api_url: response.data.data.kilusi_omnichat_api_url || prev.api_url,
          api_key: response.data.data.kilusi_omnichat_api_key || '',
          timeout: response.data.data.kilusi_omnichat_timeout || prev.timeout,
          retry_count: response.data.data.kilusi_omnichat_retry_count || prev.retry_count,
          sync_enabled: response.data.data.omnichat_sync_enabled || prev.sync_enabled,
          sync_schedule: response.data.data.omnichat_sync_schedule || prev.sync_schedule,
          sync_time: response.data.data.omnichat_sync_time || prev.sync_time,
          sync_tags_enabled: response.data.data.omnichat_sync_tags_enabled !== undefined ? response.data.data.omnichat_sync_tags_enabled : prev.sync_tags_enabled
        }))
      }
    } catch (error) {
      console.error('Error fetching Omnichat settings:', error)
    }
  }

  // Save Omnichat settings to database
  const saveOmnichatSettings = async () => {
    try {
      setSavingSettings(true)
      setSettingsMessage('')

      // Save API URL
      const response = await adminApi.post('/api/v1/settings', {
        key: 'kilusi_omnichat_api_url',
        value: omnichatSettings.api_url
      })

      if (!response.data.success) throw new Error('Failed to save API URL')

      // Save API key if provided
      if (omnichatSettings.api_key) {
        const keyResponse = await adminApi.post('/api/v1/settings', {
          key: 'kilusi_omnichat_api_key',
          value: omnichatSettings.api_key
        })

        if (!keyResponse.data.success) throw new Error('Failed to save API Key')
      }

      // Save other settings
      await adminApi.post('/api/v1/settings', {
        key: 'kilusi_omnichat_timeout',
        value: omnichatSettings.timeout.toString()
      })

      await adminApi.post('/api/v1/settings', {
        key: 'kilusi_omnichat_retry_count',
        value: omnichatSettings.retry_count.toString()
      })

      await adminApi.post('/api/v1/settings', {
        key: 'omnichat_sync_enabled',
        value: omnichatSettings.sync_enabled.toString()
      })

      await adminApi.post('/api/v1/settings', {
        key: 'omnichat_sync_schedule',
        value: omnichatSettings.sync_schedule
      })

      await adminApi.post('/api/v1/settings', {
        key: 'omnichat_sync_time',
        value: omnichatSettings.sync_time
      })

      setSettingsMessage('Settings saved successfully!')
      setTimeout(() => setSettingsMessage(''), 3000)

      // Refresh status
      fetchOmnichatStatus()
    } catch (error: any) {
      setSettingsMessage('Failed to save settings: ' + error.message)
    } finally {
      setSavingSettings(false)
    }
  }

  // Meta templates state (separate from local templates)
  const [metaTemplateList, setMetaTemplateList] = useState<any[]>([])
  const [loadingMetaTemplates, setLoadingMetaTemplates] = useState(false)
  const [showCreateMetaTemplateModal, setShowCreateMetaTemplateModal] = useState(false)

  // Unified templates state
  const [templates, setTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [showMetaSubmitDialog, setShowMetaSubmitDialog] = useState(false)
  const [metaSubmitId, setMetaSubmitId] = useState<number | null>(null)
  const [metaCategory, setMetaCategory] = useState('UTILITY')
  const [metaLanguage, setMetaLanguage] = useState('id')
  const [showQRModal, setShowQRModal] = useState(false)

  // Fetch all templates
  const fetchTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const response = await adminApi.get('/api/v1/whatsapp-templates')
      if (response.data.success) {
        setTemplates(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  // Handle submit to Meta
  const handleSubmitToMeta = async (id: number, category: string, language: string) => {
    try {
      const response = await adminApi.post(`/api/v1/whatsapp-templates/${id}/submit-meta`, {
        meta_category: category,
        meta_language: language
      })

      if (response.data.success) {
        alert(`Template berhasil dikirim ke Meta! ID: ${response.data.data?.meta_response?.templateId || '-'}`)
        fetchTemplates()
      } else {
        alert('Gagal submit ke Meta: ' + (response.data.message || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  // Handle test template
  const handleTestTemplate = async (id: number) => {
    const phoneNumber = prompt('Masukkan nomor WhatsApp untuk test (628xxx):')
    if (!phoneNumber) return

    const testVariables = {
      customerName: 'John Doe',
      amount: 'Rp 100.000',
      dueDate: '30 Desember 2026',
      invoiceNumber: 'INV-2026-001'
    }

    try {
      const response = await adminApi.post(`/api/v1/whatsapp-templates/${id}/send-local`, {
        phone_number: phoneNumber,
        variables: testVariables
      })

      if (response.data.success) {
        alert('Pesan test berhasil dikirim! Silakan cek WhatsApp.')
      } else {
        alert('Gagal kirim pesan: ' + (response.data.message || 'Unknown error'))
      }
    } catch (error: any) {
      alert('Error: ' + error.message)
    }
  }

  // Handle create Meta template (separate from local template)
  const handleCreateMetaTemplate = async (template: any) => {
    try {
      // Convert to Omnichat API format
      const templateData: any = {
        name: template.name,
        category: template.category,
        language: template.language,
        components: []
      }

      // Add header if enabled
      if (template.header.enabled) {
        templateData.components.push({
          type: 'HEADER',
          format: template.header.type,
          text: template.header.text
        })
      }

      // Add body (required)
      templateData.components.push({
        type: 'BODY',
        text: template.body.text
      })

      // Add footer if enabled
      if (template.footer.enabled) {
        templateData.components.push({
          type: 'FOOTER',
          text: template.footer.text
        })
      }

      // Add buttons if enabled
      if (template.buttons.enabled && template.buttons.buttons.length > 0) {
        templateData.components.push({
          type: 'BUTTONS',
          buttons: template.buttons.buttons.map((btn: any) => ({
            type: btn.type,
            text: btn.text,
            url: btn.url,
            phoneNumber: btn.phoneNumber
          }))
        })
      }

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/meta-templates/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateData)
      })

      const result = await response.json()

      if (result.success) {
        alert('Template berhasil dikirim ke Meta untuk approval! Silakan cek status di Meta Business Suite.')
        // Refresh template list
        fetchMetaTemplates()
      } else {
        alert('Gagal membuat template: ' + (result.message || 'Unknown error'))
      }
    } catch (error: any) {
      throw error
    }
  }

  // Fetch Meta templates from Omnichat
  const fetchMetaTemplates = async () => {
    setLoadingMetaTemplates(true)
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/meta-templates/list`)
      const result = await response.json()

      if (result.success) {
        setMetaTemplateList(result.data || [])
      }
    } catch (error) {
      console.error('Error fetching Meta templates:', error)
    } finally {
      setLoadingMetaTemplates(false)
    }
  }
  const [broadcastType, setBroadcastType] = useState<'all' | 'region' | 'overdue' | 'expiring_soon'>('all')
  const [customerStatus, setCustomerStatus] = useState<'all' | 'active'>('active')
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({})
  const [customMessage, setCustomMessage] = useState<string>('')
  const [showPreview, setShowPreview] = useState<boolean>(false)
  const [isSending, setIsSending] = useState<boolean>(false)
  const [sendingProgress, setSendingProgress] = useState<number>(0)
  const [sentCount, setSentCount] = useState<number>(0)
  const [failedCount, setFailedCount] = useState<number>(0)
  const [previewData, setPreviewData] = useState<any>(null)

  // Scheduling states
  const [scheduleMode, setScheduleMode] = useState<boolean>(false)
  const [scheduledAt, setScheduledAt] = useState<string>('')
  const [recurringPattern, setRecurringPattern] = useState<string>('')
  const [scheduledMessages, setScheduledMessages] = useState<any[]>([])
  const [showScheduledMessages, setShowScheduledMessages] = useState<boolean>(false)

  // Message history state
  const [allMessages, setAllMessages] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  })


  // Pagination calculations
  const currentMessages = allMessages

  // Get all failed message IDs
  const failedMessageIds = allMessages.filter(msg => msg.status === 'failed').map(msg => msg.id)

  // Select all failed messages
  const selectAllFailedMessages = () => {
    setSelectedMessages(failedMessageIds)
  }

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedMessages([])
  }

  // Regions data from API
  const [regions, setRegions] = useState<Array<{
    id: string
    name: string
    customerCount: number
    activeCount: number
  }>>([])
  const [customerStats, setCustomerStats] = useState<{
    total: number
    active: number
    inactive: number
    suspended: number
  }>({ total: 0, active: 0, inactive: 0, suspended: 0 })
  const [loadingRegions, setLoadingRegions] = useState(false)

  // Fetch regions and customer stats from API
  const fetchRegionsData = async () => {
    if (loadingRegions) return

    console.log('🔄 Starting fetchRegionsData...')
    setLoadingRegions(true)
    try {
      console.log('📡 Calling APIs...')
      const [regionsResponse, statsResponse] = await Promise.all([
        whatsappAPI.getRegionsStats(),
        whatsappAPI.getCustomerStats()
      ])

      console.log('📊 Regions response:', regionsResponse)
      console.log('👥 Customer stats response:', statsResponse)

      if (regionsResponse.success && regionsResponse.data) {
        console.log('✅ Setting regions:', regionsResponse.data)
        setRegions(regionsResponse.data.sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        console.log('❌ Regions API failed:', regionsResponse)
      }

      if (statsResponse.success && statsResponse.data) {
        console.log('✅ Setting customer stats:', statsResponse.data)
        setCustomerStats(statsResponse.data)
      } else {
        console.log('❌ Customer stats API failed:', statsResponse)
      }
    } catch (error) {
      console.error('❌ Error fetching regions data:', error)
    } finally {
      setLoadingRegions(false)
    }
  }

  // Load regions data on component mount
  useEffect(() => {
    console.log('🚀 Component mounted, calling fetchRegionsData')
    fetchRegionsData()
  }, [])

  // Fetch all status on mount
  useEffect(() => {
    fetchOmnichatStatus()
    fetchBaileysStatus()
    
    // Set interval to refresh QR/Status
    const interval = setInterval(() => {
      fetchBaileysStatus()
    }, 10000)
    
    return () => clearInterval(interval)
  }, [])

  // Fetch payment settings for bank accounts
  useEffect(() => {
    fetchPaymentSettings()
  }, [])

  // Fetch payment settings
  const [paymentSettings, setPaymentSettings] = useState<any>(null)
  const fetchPaymentSettings = async () => {
    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/broadcast-public/payment-settings`)
      const result = await response.json()
      if (result.success) {
        setPaymentSettings(result.data)
      }
    } catch (error) {
      console.error('Error fetching payment settings:', error)
    }
  }

  // Templates state - editingTemplateId is from old implementation
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [newTemplate, setNewTemplate] = useState({
    id: '',
    name: '',
    content: '',
    category: 'billing',
    enabled: true,
    meta_name: ''
  })
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false)
  const [hasCreatedDefaults, setHasCreatedDefaults] = useState(false)
  const [availableVariables, setAvailableVariables] = useState<string[]>([])

  // Use a ref to prevent multiple default template creations
  const defaultTemplatesCreatedRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Get recipient count based on selection
  const getRecipientCount = () => {
    if (broadcastType === 'all') {
      return customerStats.active || 0
    } else if (broadcastType === 'region' && selectedRegion) {
      const region = regions.find(r => r.id === selectedRegion)
      if (region) {
        return customerStatus === 'active' ? region.activeCount : region.customerCount
      }
      return 0
    } else if (broadcastType === 'overdue') {
      // Will be fetched from API when needed
      return 'N/A'
    } else if (broadcastType === 'expiring_soon') {
      // Will be fetched from API when needed
      return 'N/A'
    }
    return 0
  }

  // Broadcast message functions
  const handlePreview = () => {
    if (selectedTemplate) {
      const template = templates.find(t => t.id === selectedTemplate)
      if (!template?.enabled) {
        alert('Template ini tidak aktif. Silakan aktifkan template terlebih dahulu.')
        return
      }
    }

    if (selectedTemplate || customMessage.trim()) {
      setShowPreview(true)
    }
  }

  const handleSendBroadcast = async (dryRun: boolean = false) => {
    if (!selectedTemplate) {
      alert('Silakan pilih template terlebih dahulu')
      return
    }

    try {
      setIsSending(true)
      setSentCount(0)
      setFailedCount(0)
      setSendingProgress(0)

      // Determine recipient_type based on current selection
      let recipientType: 'all_active' | 'region' | 'overdue' | 'expiring_soon' = 'all_active'
      if (broadcastType === 'region') {
        recipientType = 'region'
      } else if (broadcastType === 'overdue') {
        recipientType = 'overdue'
      } else if (broadcastType === 'expiring_soon') {
        recipientType = 'expiring_soon'
      } else {
        recipientType = 'all_active'
      }

      // Build request body for dynamic broadcast API
      const requestBody = {
        template_id: selectedTemplate,
        recipient_type: recipientType,
        region_id: recipientType === 'region' ? selectedRegion : undefined,
        dry_run: dryRun // true for preview, false for actual send
      }

      setSendingProgress(25)

      // Get auth token
      const token = localStorage.getItem('token') || sessionStorage.getItem('token')

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/broadcasts/send-dynamic`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      })

      setSendingProgress(50)

      const result = await response.json()

      if (result.success) {
        setSendingProgress(100)

        if (dryRun) {
          // Show preview with personalized messages
          setShowPreview(true)
          setPreviewData(result.data)
        } else {
          // Show actual send results
          setSentCount(result.data.sent || 0)
          setFailedCount(result.data.failed || 0)

          const successRate = result.data.success_rate || 0
          let message = `Broadcast selesai!\n` +
            `✅ Terkirim: ${result.data.sent}\n` +
            `❌ Gagal: ${result.data.failed}\n` +
            `📊 Success Rate: ${successRate}%`

          if (result.data.errors && result.data.errors.length > 0) {
            message += `\n\nError Samples:\n${result.data.errors.slice(0, 3).map((e: any) =>
              `- ${e.customer}: ${e.error}`
            ).join('\n')}`
          }

          alert(message)
          setShowPreview(false)
        }
      } else {
        console.error('Failed to send broadcast:', result.error)
        alert(`Gagal: ${result.message || result.error}`)
      }
    } catch (error) {
      console.error('Error sending broadcast:', error)
      alert('Terjadi kesalahan saat mengirim broadcast')
    } finally {
      setIsSending(false)
      if (!dryRun) {
        setShowPreview(false)
      }
    }
  }

  // New handler for preview button
  const handlePreviewDynamic = async () => {
    await handleSendBroadcast(true) // dry_run = true
  }

  const getBroadcastRecipients = () => {
    if (broadcastType === 'all') {
      return customerStatus === 'active'
        ? ['all_active_customers']
        : ['all_customers'] // Special group ID for all customers
    } else if (selectedRegion) {
      return customerStatus === 'active'
        ? [`${selectedRegion}_active`]
        : [selectedRegion]
    }
    return []
  }

  const getFinalMessage = () => {
    if (selectedTemplate) {
      const template = templates.find(t => t.id === selectedTemplate)
      if (template) {
        // Replace variables with sample data for preview
        let message = template.content
        const variables = getTemplateVariables()
        Object.keys(variables).forEach(key => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
          message = message.replace(regex, variables[key] || `[${key}]`)
        })
        return message
      }
    }
    return customMessage
  }

  const getTemplateVariables = () => {
    // Return user-defined variables from state
    return templateVariables
  }

  // Handle template selection with variable initialization
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)

    // Get template details
    const template = templates.find(t => t.id === templateId)
    if (template && template.variables) {
      // Initialize variables with default values
      const defaults: Record<string, string> = {}

      template.variables.forEach((variable: string) => {
        defaults[variable] = getDefaultVariableValue(variable)
      })

      setTemplateVariables(defaults)
    } else {
      setTemplateVariables({})
    }
  }

  // Get default value for a variable
  const getDefaultVariableValue = (variable: string): string => {
    const defaults: Record<string, string> = {
      // Billing & Invoice variables
      customerName: 'Pelanggan',
      customer_name: 'Pelanggan',
      nama_pelanggan: 'John Doe',
      month: new Date().toLocaleString('en-GB', { month: '2-digit' }),
      year: new Date().getFullYear().toString(),
      invoiceNumber: 'INV-2026-001',
      amount: 'Rp 150.000',
      dueDate: '30 Maret 2026',
      paymentDate: new Date().toLocaleString('id-ID'),
      paymentMethod: 'Transfer Bank',
      payment_accounts: 'BCA: 1234567890 a.n Kilusi Bill',
      companyName: 'Kilusi Bill',
      supportNumber: '62811225323',

      // Package variables
      packageName: 'Paket Home 10Mbps',
      packageSpeed: '10 Mbps',
      profile: 'Paket Home 10Mbps',
      harga: 'Rp 150.000/bulan',
      jenis_tagihan: 'Bulanan Prabayar',

      // Service variables
      username: 'user001',
      wifiPassword: 'password123',
      activationTime: '1-2',

      // Registration variables
      no_layanan: 'INV-2026-001',
      phone: '62811225323',
      alamat_pasang: 'Jl. Contoh No. 123, Jakarta',
      tgl_aktif: new Date().toLocaleString('id-ID'),
      tgl_isolir: '31 Desember 2026',
      link_client_area: 'https://client.kilusi.id/login',

      // Bank accounts - from payment settings
      daftar_akun_bank: paymentSettings?.formatted_bank_accounts || '💳 BCA: 1234567890\n  a.n KILUSI DIGITAL NETWORK',
      bank_accounts: paymentSettings?.bank_accounts?.map((acc: any) =>
        `${acc.bank_name}: ${acc.account_number}`
      ).join('\n') || 'BCA: 1234567890\nMandiri: 0987654321',

      // Upgrade variables
      oldPackage: 'Paket Basic',
      oldSpeed: '5 Mbps',
      newPackage: 'Paket Pro',
      newSpeed: '10 Mbps',
      additionalCost: 'Rp 50.000',

      // Maintenance variables
      maintenanceDate: new Date().toLocaleString('id-ID'),
      maintenanceTime: '00:00 - 04:00 WIB',
      duration: '4',
      processingTime: '5-10',

      // Payment accounts
      paymentAccounts: 'BCA: 1234567890\nMandiri: 0987654321',

      // Expiration variables
      expiryDate: '31 Maret 2026',
      daysRemaining: '7',
      daysOverdue: '3'
    }

    return defaults[variable] || `[${variable}]`
  }

  const fetchScheduledMessages = async () => {
    try {
      const response = await whatsappAPI.getScheduledMessages()
      if (response.success && response.data) {
        setScheduledMessages(response.data.messages || [])
      }
    } catch (error) {
      console.error('Error fetching scheduled messages:', error)
    }
  }

  const cancelScheduledMessage = async (messageId: string) => {
    try {
      const response = await whatsappAPI.cancelScheduledMessage(messageId)
      if (response.success) {
        fetchScheduledMessages()
      }
    } catch (error) {
      console.error('Error cancelling scheduled message:', error)
    }
  }

  // Add debouncing for message history
  let lastHistoryFetch = 0
  const HISTORY_COOLDOWN = 5000 // 5 seconds between history fetches

  const fetchMessageHistory = async (page = currentPage, force = false) => {
    const now = Date.now()

    // Rate limiting: don't fetch if we've fetched recently (unless forced)
    if (!force && now - lastHistoryFetch < HISTORY_COOLDOWN) {
      console.log('Message history fetch rate limited')
      return
    }

    lastHistoryFetch = now
    setIsLoadingHistory(true)
    try {
      const response = await whatsappAPI.getMessageHistory({
        page,
        limit: messagesPerPage
      })

      if (response.success && response.data) {
        setAllMessages(response.data.messages || [])
        setHistoryPagination({
          page: response.data.page || 1,
          limit: messagesPerPage,
          total: response.data.total || 0,
          totalPages: response.data.totalPages || 0,
          hasNext: (response.data.page || 1) < (response.data.totalPages || 1),
          hasPrev: (response.data.page || 1) > 1
        })
      } else {
        console.error('Failed to fetch message history:', response.error || response.message)
        // Show user-friendly error message for rate limiting
        if (response.error?.includes('Too many requests')) {
          setSettingsMessage('Too many requests. Please wait a moment before refreshing.')
          setTimeout(() => setSettingsMessage(''), 3000)
        }
      }
    } catch (error) {
      console.error('Error fetching message history:', error)
      // Handle JSON parsing errors from rate limiting
      if (error instanceof SyntaxError && error.message.includes('Too many r')) {
        setSettingsMessage('Too many requests. Please wait a moment before refreshing.')
        setTimeout(() => setSettingsMessage(''), 3000)
      }
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Old template system - disabled in favor of Meta Templates
  // TODO: Remove old template system after Meta templates fully implemented
  /*
  const fetchTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const response = await whatsappAPI.getTemplates()
      if (response.success && response.data) {
        // Backend returns templates as { templates: [...] } or as object with template IDs
        const templatesData = response.data.templates || response.data
        const templatesArray = Array.isArray(templatesData)
          ? templatesData
          : Object.values(templatesData)

        const fetchedTemplates = templatesArray.map((template: any) => ({
          ...template,
          variables: extractVariablesFromContent(template.content || '')
        }))

        // If no templates exist and we haven't created defaults yet, create default templates
        if (fetchedTemplates.length === 0 && !defaultTemplatesCreatedRef.current && !hasCreatedDefaults) {
          await createDefaultTemplates()
        } else {
          setTemplates(fetchedTemplates)
        }
      } else {
        console.error('Failed to fetch templates:', response.message)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setIsLoadingTemplates(false)
    }
  }
  */

  // Helper function to extract variables from template content
  const extractVariablesFromContent = (content: string): string[] => {
    const variableRegex = /\{\{([^}]+)\}\}/g
    const variables: string[] = []
    let match

    while ((match = variableRegex.exec(content)) !== null) {
      variables.push(match[1])
    }

    return [...new Set(variables)] // Remove duplicates
  }

  // Create default templates
  const createDefaultTemplates = async () => {
    setIsCreatingDefaults(true)
    const defaultTemplates = [
      {
        id: 'new_invoice_reminder',
        name: 'Invoice Reminder (New)',
        content: '🧾 *PENGINGAT TAGIHAN*\n\nYth. {{customerName}},\n\nTagihan Anda senilai Rp {{amount}} akan jatuh tempo pada {{dueDate}}.\n\nNomor Invoice: {{invoiceNumber}}\nPaket: {{packageName}}\n\nMohon segera lakukan pembayaran untuk menghindari penonaktifan layanan.\n\nTerima kasih.',
        category: 'billing',
        enabled: true
      },
      {
        id: 'new_payment_confirmation',
        name: 'Payment Confirmation (New)',
        content: '✅ *PEMBAYARAN DITERIMA*\n\nTerima kasih {{customerName}},\n\nPembayaran Anda sebesar Rp {{amount}} untuk invoice {{invoiceNumber}} telah kami terima.\n\nMetode: {{paymentMethod}}\nTanggal: {{paymentDate}}\n\nLayanan Anda tetap aktif. Terima kasih atas kepercayaan Anda.',
        category: 'billing',
        enabled: true
      },
      {
        id: 'new_welcome_message',
        name: 'Welcome Message (New)',
        content: '👋 *SELAMAT DATANG*\n\nHalo {{customerName}},\n\nSelamat datang di layanan internet kami!\n\n📶 *Detail Layanan:*\nPaket: {{packageName}}\nKecepatan: {{packageSpeed}}\nUsername: {{username}}\nPassword WiFi: {{wifiPassword}}\n\nJika membutuhkan bantuan, hubungi kami di: {{supportNumber}}\n\nSelamat menikmati layanan kami!',
        category: 'onboarding',
        enabled: true
      },
      {
        id: 'new_service_disruption',
        name: 'Service Disruption (New)',
        content: '⚠️ *PEMBERITAHUAN GANGGUAN*\n\nPelanggan Yth.,\n\nKami menginformasikan adanya gangguan layanan:\n\n📍 Area terdampak: {{affectedArea}}\n🔧 Jenis gangguan: {{disruption_type}}\n⏰ Perkiraan selesai: {{estimated_resolution}}\n\nKami mohon maaf atas ketidaknyamanan ini. Tim teknisi kami sedang bekerja untuk memperbaiki masalah.\n\nInfo lebih lanjut: {{supportPhone}}',
        category: 'notifications',
        enabled: true
      },
      {
        id: 'new_service_restored',
        name: 'Service Restored (New)',
        content: '✅ *LAYANAN NORMAL KEMBALI*\n\nHalo {{customerName}},\n\nKami beritahukan bahwa layanan internet Anda sudah normal kembali.\n\n📆 Tanggal pemulihan: {{paymentDate}}\n💰 Pembayaran terakhir: Rp {{amount}}\n\nTerima kasih atas kesabaran Anda. Nikmati kembali layanan internet kami!',
        category: 'notifications',
        enabled: true
      }
    ]

    try {
      console.log('Creating default templates...')
      let successCount = 0
      let failCount = 0

      for (const template of defaultTemplates) {
        try {
          const response = await whatsappAPI.createTemplate(template)
          if (response.success) {
            console.log('Template created successfully:', template.id)
            successCount++
          } else {
            console.error('Failed to create template:', template.id, response.message)
            failCount++
          }
        } catch (error) {
          console.error('Error creating template:', template.id, error)
          failCount++
        }
      }

      // Show result
      if (successCount > 0) {
        alert(`${successCount} default templates created successfully${failCount > 0 ? `, ${failCount} failed` : ''}!`)

        // Mark that defaults have been created to prevent infinite loop
        defaultTemplatesCreatedRef.current = true
        setHasCreatedDefaults(true)

        // Refetch templates after creating defaults (only once)
        setTimeout(fetchTemplates, 500)
      } else {
        alert('Failed to create default templates. Please check your connection.')
      }
    } catch (error) {
      console.error('Error creating default templates:', error)
      alert('Error creating default templates: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsCreatingDefaults(false)
    }
  }

  // Test template
  const testTemplate = async (templateId: string, phoneNumber: string) => {
    if (!phoneNumber) {
      alert('Please enter a phone number for testing')
      return
    }

    try {
      // Get template data to extract variables
      const template = templates.find(t => t.id === templateId)
      if (!template) {
        alert('Template not found')
        return
      }

      // Generate mock variables for this template
      const variables = generateMockVariables(template.variables || [])

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/whatsapp/templates/${templateId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          variables: variables
        })
      })

      const result = await response.json()

      if (result.success) {
        alert('Test message sent successfully!')
      } else {
        alert('Failed to send test message: ' + (result.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error testing template:', error)
      alert('Error sending test message')
    }
  }

  // Generate mock variables for testing
  const generateMockVariables = (variables: string[]) => {
    const mockData: any = {}

    variables.forEach(variable => {
      switch (variable.toLowerCase()) {
        case 'customer_name':
        case 'customername':
          mockData[variable] = 'John Doe'
          break
        case 'invoice_number':
        case 'invoicenumber':
          mockData[variable] = 'INV-2024-001'
          break
        case 'amount':
          mockData[variable] = '{{amount}}'
          break
        case 'due_date':
        case 'duedate':
          mockData[variable] = '2024-12-31'
          break
        case 'package_name':
        case 'packagename':
          mockData[variable] = 'Premium Package'
          break
        case 'company_name':
        case 'companyname':
          mockData[variable] = 'Kilusi ISP'
          break
        default:
          mockData[variable] = `[${variable}]`
          break
      }
    })

    return mockData
  }

  // Fetch available variables from backend (union of all template variables)
  const fetchAvailableVariables = async () => {
    try {
      const response = await adminApi.get('/api/v1/whatsapp-templates/available-variables')
      if (response.data?.success && response.data?.data?.variables) {
        setAvailableVariables(response.data.data.variables)
      }
    } catch (error) {
      console.error('Error fetching available variables:', error)
    }
  }

  // Edit template function
  const handleEditTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template) {
      alert('Template not found')
      return
    }

    // Set the form with template data
    // Auto-suggest version suffix for meta_name if template was already submitted
    let suggestedMetaName = template.meta_name || ''
    if (!suggestedMetaName && (template.meta_status === 'approved' || template.meta_status === 'rejected' || template.meta_status === 'pending_approval')) {
      // Find next version: template_id → template_id_v2, template_id_v3, etc.
      const existingVersions = templates
        .filter(t => t.template_id === template.template_id || (t.meta_name && t.meta_name.startsWith(template.template_id + '_v')))
      if (existingVersions.length > 0) {
        let maxVersion = 1
        existingVersions.forEach(t => {
          const name = t.meta_name || t.template_id
          const match = name.match(/_v(\d+)$/)
          if (match) maxVersion = Math.max(maxVersion, parseInt(match[1]))
        })
        suggestedMetaName = `${template.template_id}_v${maxVersion + 1}`
      } else {
        suggestedMetaName = `${template.template_id}_v2`
      }
    }

    setNewTemplate({
      id: template.template_id,
      name: template.name,
      content: template.content,
      category: template.category,
      enabled: template.enabled,
      meta_name: suggestedMetaName
    })

    // Set edit mode (use database ID for editing)
    setEditingTemplateId(templateId)

    // Fetch available variables dynamically
    fetchAvailableVariables()

    // Show the create modal in edit mode
    setShowCreateTemplateModal(true)
  }

  // Create or update template
  const handleCreateTemplate = async () => {
    if (!newTemplate.id || !newTemplate.name || !newTemplate.content) {
      alert('Please fill in all required fields')
      return
    }

    setIsCreatingTemplate(true)
    try {
      let result
      const isEditMode = editingTemplateId !== null

      if (isEditMode) {
        // Update existing template - using adminApi with JWT auth
        const response = await adminApi.put(`/api/v1/whatsapp-templates/${editingTemplateId}`, newTemplate)
        result = response.data
      } else {
        // Check if template ID already exists
        if (templates.some(t => t.template_id === newTemplate.id)) {
          alert('Template with this ID already exists')
          return
        }

        // Create new template - using adminApi with JWT auth
        const response = await adminApi.post('/api/v1/whatsapp-templates', newTemplate)
        result = response.data
      }

      if (result.success) {
        alert(`Template ${isEditMode ? 'updated' : 'created'} successfully!`)
        setShowCreateTemplateModal(false)
        setEditingTemplateId(null)
        // Reset form
        setNewTemplate({
          id: '',
          name: '',
          content: '',
          category: 'billing',
          enabled: true,
          meta_name: ''
        })
        fetchTemplates() // Refresh templates
      } else {
        alert(`Failed to ${isEditMode ? 'update' : 'create'} template: ` + (result.message || 'Unknown error'))
      }
    } catch (error: any) {
      console.error(`Error ${editingTemplateId ? 'updating' : 'creating'} template:`, error)
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error'
      alert(`Error ${editingTemplateId ? 'updating' : 'creating'} template: ${errorMsg}`)
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  // Generate template ID from name
  const generateTemplateId = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  }

  // Handle template name change
  const handleTemplateNameChange = (name: string) => {
    try {
      const id = generateTemplateId(name)
      setNewTemplate(prev => ({
        ...prev,
        name,
        id: prev.id || id
      }))
    } catch (error) {
      console.error('Error handling template name change:', error)
      // Fallback: just update name without changing ID
      setNewTemplate(prev => ({
        ...prev,
        name
      }))
    }
  }

  useEffect(() => {
    fetchStatus()
    fetchScheduledMessages()
    fetchTemplates()
    fetchMessageHistory(1) // Fetch initial message history
  }, [fetchStatus])

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        clearMessages()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success, clearMessages])

  // Clear WhatsApp session function
  const handleClearSession = async () => {
    const confirmed = window.confirm(
      'Apakah Anda yakin ingin menghapus session WhatsApp?\n\n' +
      'Ini akan:\n' +
      '• Menghapus semua session data\n' +
      '• Memutuskan koneksi WhatsApp saat ini\n' +
      '• Memerlukan scan QR code ulang\n\n' +
      'Lanjutkan?'
    )

    if (!confirmed) return

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/api/v1/whatsapp/clear-session`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()

      if (result.success) {
        alert('✅ Session WhatsApp berhasil dihapus!\n\nSilakan scan QR code ulang untuk menghubungkan kembali.')
        // Refresh status after clearing session
        await fetchStatus()
        // Show QR modal automatically after clearing session using store
        setTimeout(() => {
          connect() // This will trigger QR modal display
        }, 1000)
      } else {
        alert('❌ Gagal menghapus session: ' + (result.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error clearing WhatsApp session:', error)
      alert('❌ Terjadi kesalahan saat menghapus session')
    }
  }

  const getConnectionStatus = () => {
    // Use Omnichat status first, fall back to Baileys status
    const isConnected = omnichatStatus.connected || status?.connected

    if (isConnected) {
      return { text: 'Connected', color: 'bg-green-500', badge: 'default' }
    } else if (connecting || loadingOmnichat) {
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
    <>
      {/* QR Code Modal for Baileys */}
      <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan WhatsApp QR Code</DialogTitle>
            <DialogDescription>
              Buka WhatsApp di HP Anda &gt; Menu &gt; Perangkat Tertaut &gt; Tautkan Perangkat.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg">
            {baileysStatus.qr ? (
              <div className="relative group">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(baileysStatus.qr)}`} 
                  alt="WhatsApp QR Code"
                  className="w-64 h-64 border-8 border-gray-100 rounded-xl"
                />
                <div className="mt-4 text-center text-sm text-gray-500 animate-pulse">
                  Menunggu scan...
                </div>
              </div>
            ) : (
              <div className="w-64 h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-xl bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-600">Menunggu QR Code</p>
                <p className="mt-1 text-xs text-gray-400 text-center px-4">
                  Server sedang mencoba terhubung ke WhatsApp. QR Code akan muncul otomatis saat koneksi berhasil.
                </p>
                <p className="mt-2 text-xs text-amber-500">
                  Jika terlalu lama, cek koneksi internet server.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-center pb-4">
            <Button variant="ghost" size="sm" onClick={() => fetchBaileysStatus()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Refresh QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Smartphone className="w-8 h-8 text-green-500" />
            Omnichat WhatsApp
          </h1>
          <p className="text-gray-600">
            WhatsApp Business API integration with Omnichat gateway
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              fetchStatus()
              fetchOmnichatStatus()
              fetchBaileysStatus()
            }}
            disabled={loading || loadingOmnichat}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${(loading || loadingOmnichat) ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
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
              Omnichat (Meta)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${omnichatStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-2xl font-bold">{omnichatStatus.connected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                Cloud API
              </Badge>
              {omnichatStatus.api_key_valid && (
                <Badge variant="default" className="text-xs bg-green-500">
                  API Valid
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Baileys (Local)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${baileysStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-2xl font-bold">{baileysStatus.connected ? 'Connected' : 'Offline'}</span>
            </div>
            {baileysStatus.connected ? (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-xs text-gray-500">Device: {baileysStatus.user?.name || baileysStatus.user?.id || 'Connected Device'}</span>
                <Button variant="link" size="sm" className="h-auto p-0 text-red-500 justify-start" onClick={async () => {
                  if(confirm('Disconnect Baileys?')) {
                    await adminApi.post('/api/v1/baileys/logout');
                    fetchBaileysStatus();
                  }
                }}>Disconnect</Button>
              </div>
            ) : (
              <div className="mt-1 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowQRModal(true)}>
                  Scan QR
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const phone = prompt('Masukkan nomor HP (628xxx):');
                  if(phone) adminApi.post('/api/v1/baileys/pair', { phone }).then(res => {
                    if(res.data.success) alert('Pairing Code: ' + res.data.data.code);
                  });
                }}>Pairing</Button>
              </div>
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
            <div className="text-2xl font-bold">{omnichatStatus.daily_messages || status?.dailyCount || 0}</div>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              <span className="text-xs text-gray-500">Via Omnichat API</span>
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
              Delivery Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{omnichatStatus.delivery_rate || status?.successRate || 0}%</div>
            <Progress value={omnichatStatus.delivery_rate || status?.successRate || 0} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
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
            Send Broadcast
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab - Omnichat Overview */}
        <TabsContent value="dashboard" className="space-y-4">
          <OmnichatDashboard />
        </TabsContent>

        {/* Templates Tab - Unified Template Management */}
        <TabsContent value="templates" className="space-y-4">
          {/* Template List */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>WhatsApp Templates</CardTitle>
                  <CardDescription>
                    Kelola template yang bisa digunakan lokal atau dikirim ke Meta untuk approval
                  </CardDescription>
                </div>
                <Button onClick={() => { fetchAvailableVariables(); setShowCreateTemplateModal(true) }}>
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Buat Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-6 h-6 mx-auto animate-spin text-gray-400 mb-4" />
                  <p className="text-gray-500">Loading templates...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Belum Ada Template</h3>
                  <p className="text-gray-500">
                    Buat template pertama Anda untuk memulai
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{template.name}</h4>
                          <Badge variant={template.enabled ? 'default' : 'secondary'}>
                            {template.enabled ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                          {template.meta_status !== 'local' && (
                            <Badge variant="outline" className="text-[10px] uppercase font-mono text-gray-500">
                              Meta: {template.meta_name || template.name}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {template.content.substring(0, 100)}...
                        </p>
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {template.variables.map((v: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {'{{' + v + '}}'}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleEditTemplate(template.id)}>
                          Edit
                        </Button>
                        
                        {/* Meta Status Logic */}
                        {template.meta_status === 'local' ? (
                          <Button
                            size="sm"
                            onClick={() => { setMetaSubmitId(template.id); setMetaCategory('UTILITY'); setMetaLanguage('id'); setShowMetaSubmitDialog(true) }}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Submit ke Meta
                          </Button>
                        ) : (template.meta_status === 'approved' || template.meta_status === 'APPROVED') ? (
                          <Badge variant="default" className="bg-green-600">
                            ✓ Approved
                          </Badge>
                        ) : (template.meta_status === 'rejected' || template.meta_status === 'REJECTED') ? (
                          <Badge variant="destructive">
                            ✕ Rejected
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                            ⏳ Pending / In Review
                          </Badge>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestTemplate(template.id)}
                        >
                          Test Send
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Template Usage Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mode Penggunaan Template</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-1">LOCAL</Badge>
                <p>
                  <strong>Mode Lokal:</strong> Kirim pesan langsung tanpa perlu approval Meta.
                  Cocok untuk testing dan pesan internal.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" className="mt-1 bg-green-600">META</Badge>
                <p>
                  <strong>Mode Meta:</strong> Kirim pesan menggunakan template yang sudah di-approve oleh Meta.
                  Perlu submit template ke Meta terlebih dahulu.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Send Broadcast Tab */}
        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Send Broadcast Message</CardTitle>
              <CardDescription>
                Kirim pesan WhatsApp broadcast ke pelanggan menggunakan template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Pilih Template</label>
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter(t => t.enabled)
                      .map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          <div className="flex items-center gap-2">
                            <span>{template.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {template.meta_status === 'approved' ? 'META' : 'LOCAL'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Template Variables Info */}
              {selectedTemplate && (() => {
                const template = templates.find(t => t.id === selectedTemplate)
                if (!template || !template.variables || template.variables.length === 0) {
                  return null
                }

                return (
                  <div className="space-y-3 p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-green-800">✅ Template Variables (Auto-Populated)</label>
                      <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                        Automatic from Database
                      </span>
                    </div>
                    <div className="text-sm text-green-700 mb-3">
                      Variabel di bawah ini akan otomatis diisi dengan data asli dari database untuk setiap pelanggan.
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {template.variables.map((variable: string) => (
                        <div key={variable} className="flex items-center gap-2 bg-white px-3 py-2 rounded border border-green-300">
                          <Badge variant="outline" className="text-xs font-mono">
                            {'{{' + variable + '}}'}
                          </Badge>
                          <span className="text-xs text-muted-foreground truncate flex-1">
                            {getDefaultVariableValue(variable)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Recipient Selection */}
              <div className="space-y-4">
                <label className="text-sm font-medium">Pilih Penerima</label>

                {/* Info banner about dynamic data */}
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">📊</span>
                    <div className="text-sm text-blue-800">
                      <div className="font-medium mb-1">Pesan Personal untuk Setiap Pelanggan</div>
                      <div className="text-xs">
                        Setiap pelanggan akan menerima pesan dengan data mereka sendiri (nama, invoice, paket, dll).
                        Tidak perlu mengisi variabel manual - sistem akan mengambil data dari database secara otomatis.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recipient Type Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${broadcastType === 'all' ? 'bg-primary/10 border-primary' : ''}`}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="all"
                      checked={broadcastType === 'all'}
                      onChange={() => setBroadcastType('all')}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Semua Pelanggan Aktif</div>
                      <div className="text-xs text-muted-foreground">Kirim ke semua pelanggan dengan status aktif</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${broadcastType === 'overdue' ? 'bg-primary/10 border-primary' : ''}`}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="overdue"
                      checked={broadcastType === 'overdue'}
                      onChange={() => setBroadcastType('overdue')}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Pelanggan Menunggak</div>
                      <div className="text-xs text-muted-foreground">Hanya pelanggan dengan invoice jatuh tempo</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${broadcastType === 'expiring_soon' ? 'bg-primary/10 border-primary' : ''}`}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="expiring_soon"
                      checked={broadcastType === 'expiring_soon'}
                      onChange={() => setBroadcastType('expiring_soon')}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Paket Hampir Expire</div>
                      <div className="text-xs text-muted-foreground">Pelanggan dengan paket expire dalam 7 hari</div>
                    </div>
                  </label>

                  <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${broadcastType === 'region' ? 'bg-primary/10 border-primary' : ''}`}>
                    <input
                      type="radio"
                      name="recipientType"
                      value="region"
                      checked={broadcastType === 'region'}
                      onChange={() => setBroadcastType('region')}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Per Region</div>
                      <div className="text-xs text-muted-foreground">Filter berdasarkan area/wilayah</div>
                    </div>
                  </label>
                </div>

                {/* Region Selection */}
                {broadcastType === 'region' && (
                  <div>
                    <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select region..." />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map((region) => (
                          <SelectItem key={region.id} value={region.id}>
                            {region.name} ({region.customerCount} pelanggan)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Recipient Count */}
              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="text-sm text-muted-foreground">
                  Tipe Penerima: <span className="font-semibold text-foreground capitalize">{broadcastType.replace('_', ' ')}</span>
                  {selectedRegion && broadcastType === 'region' && (
                    <span> - {regions.find(r => r.id === selectedRegion)?.name}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Klik &ldquo;Preview Personalized&rdquo; untuk melihat preview pesan untuk setiap pelanggan
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handlePreviewDynamic}
                  disabled={!selectedTemplate || isSending}
                  variant="outline"
                  className="flex-1"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Preview Personalized
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleSendBroadcast(false)}
                  disabled={!selectedTemplate || isSending}
                  className="flex-1"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Broadcast
                    </>
                  )}
                </Button>
              </div>

              {/* Preview Modal */}
              {showPreview && (
                <div
                  className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                  onClick={() => setShowPreview(false)}
                >
                  <Card className="w-full max-w-4xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                    <CardHeader>
                      <CardTitle>Preview Pesan Broadcast (Personalized)</CardTitle>
                      <CardDescription>
                        {previewData ? `Preview untuk ${previewData.preview_count || 0} pelanggan. Setiap pelanggan menerima pesan dengan data mereka sendiri.` : 'Loading...'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {previewData && previewData.recipients ? (
                        <>
                          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                            <div className="text-sm font-medium text-yellow-800 mb-2">
                              💡 Info: Pesan Personal
                            </div>
                            <div className="text-sm text-yellow-700">
                              Setiap pelanggan akan menerima pesan dengan data mereka sendiri (nama, invoice, paket, dll).
                              Ini adalah preview untuk 10 pelanggan pertama.
                            </div>
                          </div>

                          <div className="space-y-3 max-h-[60vh] overflow-auto">
                            {previewData.recipients.slice(0, 10).map((recipient: any, idx: number) => (
                              <div key={idx} className="bg-gray-50 p-4 rounded-lg border">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="font-medium text-sm">
                                    {recipient.nama || `Customer #${recipient.customer_id}`}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {recipient.no_layanan || `ID: ${recipient.customer_id}`} • {recipient.phone || 'N/A'}
                                  </div>
                                </div>
                                <div className="text-sm whitespace-pre-wrap bg-white p-3 rounded border">
                                  {recipient.message_preview || recipient.message}
                                </div>
                              </div>
                            ))}
                          </div>

                          {previewData.recipients.length > 10 && (
                            <div className="text-sm text-muted-foreground text-center">
                              ... dan {previewData.recipients.length - 10} pelanggan lainnya
                            </div>
                          )}

                          <div className="text-sm text-muted-foreground">
                            Total Penerima: {previewData.preview_count || 0} pelanggan
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8">
                          <Loader2 className="w-6 h-6 mx-auto animate-spin text-gray-400 mb-4" />
                          <p className="text-gray-500">Loading preview...</p>
                        </div>
                      )}

                      <div className="flex gap-3 pt-4 border-t">
                        <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1">
                          Close
                        </Button>
                        <Button
                          onClick={() => handleSendBroadcast(false)}
                          disabled={isSending || !previewData}
                          className="flex-1"
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Send Broadcast Now
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Sending Progress */}
              {isSending && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Sending Progress...</span>
                    <span className="text-sm text-blue-600">{sendingProgress}%</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${sendingProgress}%` }}
                    />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-600">
                    <span>Sent: {sentCount}</span>
                    <span>Failed: {failedCount}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab - Gateway Configuration */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gateway Configuration</CardTitle>
              <CardDescription>
                Pilih gateway default untuk notifikasi WhatsApp dan konfigurasi parameter
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Gateway Selection */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">WhatsApp Delivery Mode</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                      { id: 'omnichat', name: 'Omnichat Only', desc: 'Hanya Cloud API', icon: '☁️' },
                      { id: 'baileys', name: 'Baileys Only', desc: 'Hanya WhatsApp Web', icon: '📱' },
                      { id: 'dual', name: 'Dual (Fallback)', desc: 'Omni lalu Baileys', icon: '⚖️' },
                      { id: 'off', name: 'OFF', desc: 'Matikan Notifikasi', icon: '🚫' }
                    ].map((mode) => (
                      <div 
                        key={mode.id}
                        onClick={async () => {
                          setSavingSettings(true);
                          try {
                            const res = await adminApi.post('/api/v1/settings', { key: 'whatsapp_provider', value: mode.id });
                            if(res.data.success) {
                              setOmnichatStatus(prev => ({ ...prev, gateway: mode.id }));
                              alert(`Mode berhasil diubah ke ${mode.name}`);
                              fetchOmnichatStatus();
                            }
                          } catch(e) {
                            alert('Gagal mengubah mode');
                          } finally {
                            setSavingSettings(false);
                          }
                        }}
                        className={`p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-all ${omnichatStatus.gateway === mode.id ? 'bg-green-50 border-green-500 ring-2 ring-green-200' : ''}`}
                      >
                        <div className="text-2xl mb-1">{mode.icon}</div>
                        <div className="font-bold text-sm">{mode.name}</div>
                        <div className="text-xs text-gray-500">{mode.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gateway Parameters */}
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-lg font-semibold">Omnichat API Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">API URL</label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        placeholder="https://whatsapp.kilusi.id/api"
                        value={omnichatSettings.api_url}
                        onChange={(e) => setOmnichatSettings(prev => ({ ...prev, api_url: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">API Key</label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        placeholder="Enter API key"
                        value={omnichatSettings.api_key}
                        onChange={(e) => setOmnichatSettings(prev => ({ ...prev, api_key: e.target.value }))}
                      />
                      {omnichatStatus.api_key_valid && (
                        <div className="text-xs text-green-600">✓ API Key is valid</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Anti-Ban (Baileys Delay) Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Baileys Delay Min (Detik)</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        value={baileysDelaySettings.min}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setBaileysDelaySettings(prev => ({ ...prev, min: val }));
                          await adminApi.post('/api/v1/settings', { key: 'baileys_delay_min', value: val });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Baileys Delay Max (Detik)</label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 border rounded-md bg-background"
                        value={baileysDelaySettings.max}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setBaileysDelaySettings(prev => ({ ...prev, max: val }));
                          await adminApi.post('/api/v1/settings', { key: 'baileys_delay_max', value: val });
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <Button
                      onClick={saveOmnichatSettings}
                      disabled={savingSettings}
                    >
                      {savingSettings ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4 mr-2" />
                          Save API Configuration
                        </>
                      )}
                    </Button>
                    {settingsMessage && (
                      <span className={`text-sm ${settingsMessage.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                        {settingsMessage}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-sm">
                    <span className="font-medium">💾 Info:</span> Parameter gateway disimpan di database.
                    API Key disimpan secara aman dan digunakan untuk koneksi ke Omnichat API.
                  </p>
                </div>

                {/* Cleanup Logs */}
                <div className="p-4 border border-destructive/30 rounded-lg bg-destructive/5 space-y-2">
                    <p className="text-sm font-medium text-destructive">Cleanup Log WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    Hapus log pesan WhatsApp yang sudah lama. Pilih jumlah hari retensi.
                  </p>
                  <div className="flex items-center gap-3">
                    <select
                      className="px-3 py-2 border rounded-md bg-background text-sm"
                      defaultValue="30"
                      id="cleanupDays"
                    >
                      <option value="7">7 hari</option>
                      <option value="14">14 hari</option>
                      <option value="30">30 hari</option>
                      <option value="60">60 hari</option>
                      <option value="90">90 hari</option>
                    </select>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        const select = document.getElementById('cleanupDays') as HTMLSelectElement;
                        const days = select?.value || '30';
                        if (!confirm(`Hapus log pesan WhatsApp lebih dari ${days} hari?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
                        try {
                          const response = await adminApi.delete(`/api/v1/omnichat-logs/logs?older_than_days=${days}`);
                          alert(response.data?.message || `${response.data?.deleted || 0} log berhasil dihapus.`);
                        } catch (error: any) {
                          alert('Gagal: ' + (error.response?.data?.message || error.message));
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Bersihkan Log
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* QR Code Modal */}
      <QRCodeModal />

      {/* Create Template Modal */}
      {showCreateTemplateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreateTemplateModal(false)
              setEditingTemplateId(null)
            }
          }}
        >
          <Card className="w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                {editingTemplateId ? 'Edit Template' : 'Create New Template'}
              </CardTitle>
              <CardDescription>
                {editingTemplateId ? 'Edit existing WhatsApp message template' : 'Create a new WhatsApp message template with variables'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Template Name *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Invoice Reminder"
                    value={newTemplate.name}
                    onChange={(e) => {
                      try {
                        handleTemplateNameChange(e.target.value)
                      } catch (error) {
                        console.error('Error in name input:', error)
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Template ID *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., invoice_reminder"
                    value={newTemplate.id}
                    onChange={(e) => {
                      try {
                        setNewTemplate(prev => ({ ...prev, id: e.target.value }))
                      } catch (error) {
                        console.error('Error in ID input:', error)
                      }
                    }}
                  />
                </div>
              </div>

              {/* Meta Template Name — separate from internal template_id, used when submitting to Meta */}
              <div className={editingTemplateId ? '' : 'hidden'}>
                <label className="text-sm font-medium mb-2 block">
                  Meta Template Name (Nama di WhatsApp)
                  <span className="text-xs text-muted-foreground ml-2">— ubah jika versi sebelumnya sudah approved</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={newTemplate.id ? `${newTemplate.id}_v2` : 'e.g., invoice_created_v2'}
                  value={newTemplate.meta_name}
                  onChange={(e) => {
                    try {
                      setNewTemplate(prev => ({ ...prev, meta_name: e.target.value }))
                    } catch (error) {
                      console.error('Error in meta_name input:', error)
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Kosongkan jika sama dengan Template ID. Meta mengharuskan nama berbeda untuk template yang sudah approved.
                </p>
              </div>

              {/* Info banner when editing a previously submitted template */}
              {editingTemplateId && (() => {
                const tpl = templates.find(t => t.id === editingTemplateId)
                if (tpl && (tpl.meta_status === 'approved' || tpl.meta_status === 'rejected' || tpl.meta_status === 'pending_approval')) {
                  return (
                    <Alert variant={tpl.meta_status === 'approved' ? 'default' : 'destructive'} className="text-sm">
                      <AlertDescription>
                        {tpl.meta_status === 'approved'
                          ? 'Template ini sudah approved di Meta. Jika konten diubah, isi Meta Template Name dengan nama berbeda (contoh: tambah _v2) dan submit ulang.'
                          : tpl.meta_status === 'rejected'
                          ? 'Template ini ditolak Meta. Setelah edit, bisa submit ulang tanpa ganti nama Meta.'
                          : 'Template ini masih pending di Meta. Edit akan membatalkan submission sebelumnya.'}
                      </AlertDescription>
                    </Alert>
                  )
                }
                return null
              })()}

              <div>
                <label className="text-sm font-medium mb-2 block">Category *</label>
                <Select value={newTemplate.category} onValueChange={(value) => {
                  try {
                    setNewTemplate(prev => ({ ...prev, category: value }))
                  } catch (error) {
                    console.error('Error in category select:', error)
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="notifications">Notifications</SelectItem>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Message Content *</label>
                <Textarea
                  ref={textareaRef}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter your message template here. Use variables like {{customerName}}, {{amount}}, etc."
                  value={newTemplate.content}
                  onChange={(e) => {
                    try {
                      setNewTemplate(prev => ({ ...prev, content: e.target.value }))
                    } catch (error) {
                      console.error('Error in content textarea:', error)
                    }
                  }}
                  rows={8}
                />
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-2">Available Variables:</p>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {availableVariables.length > 0 ? (
                      availableVariables.map((v, i) => {
                        const COLORS = [
                          'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30',
                          'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30',
                          'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30',
                          'bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30',
                          'bg-pink-500/20 text-pink-400 border-pink-500/30 hover:bg-pink-500/30',
                          'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30',
                          'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30',
                          'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30',
                          'bg-teal-500/20 text-teal-400 border-teal-500/30 hover:bg-teal-500/30',
                          'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30',
                          'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30',
                          'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30',
                          'bg-sky-500/20 text-sky-400 border-sky-500/30 hover:bg-sky-500/30',
                        ]
                        const colorClass = COLORS[i % COLORS.length]
                        return (
                          <span
                            key={v}
                            className={`inline-block px-2 py-1 rounded-md cursor-pointer border transition-colors ${colorClass}`}
                            onClick={() => {
                              const textarea = textareaRef.current
                              if (textarea) {
                                const varText = `{{${v}}}`
                                const start = textarea.selectionStart
                                const end = textarea.selectionEnd
                                const before = newTemplate.content.substring(0, start)
                                const after = newTemplate.content.substring(end)
                                const newContent = before + varText + after
                                setNewTemplate(prev => ({ ...prev, content: newContent }))
                                // Restore cursor position after React re-render
                                setTimeout(() => {
                                  textarea.focus()
                                  textarea.selectionStart = textarea.selectionEnd = start + varText.length
                                }, 10)
                              }
                            }}
                          >
                            {`{{${v}}}`}
                          </span>
                        )
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        No variables available yet. Type {'{{'}...{'}}'} in the template to auto-register variables.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="templateEnabled"
                  checked={newTemplate.enabled}
                  onChange={(e) => {
                    try {
                      setNewTemplate(prev => ({ ...prev, enabled: e.target.checked }))
                    } catch (error) {
                      console.error('Error in enabled checkbox:', error)
                    }
                  }}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor="templateEnabled" className="text-sm font-medium">
                  Enable this template
                </label>
              </div>

            </CardContent>
            <CardFooter className="flex justify-end gap-2 pt-4 border-t p-6">
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    setShowCreateTemplateModal(false)
                    setNewTemplate({
                      id: '',
                      name: '',
                      content: '',
                      category: 'billing',
                      enabled: true,
                      meta_name: ''
                    })
                  } catch (error) {
                    console.error('Error in cancel button:', error)
                    // Fallback: just close modal
                    setShowCreateTemplateModal(false)
                  }
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateTemplate}
                disabled={!newTemplate.id || !newTemplate.name || !newTemplate.content || isCreatingTemplate}
              >
                {isCreatingTemplate ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {editingTemplateId ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {editingTemplateId ? 'Update Template' : 'Create Template'}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>

    {/* Meta Submit Dialog */}
    {showMetaSubmitDialog && metaSubmitId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowMetaSubmitDialog(false)}>
        <div className="bg-card border rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
          <div className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Submit Template ke Meta</h2>
            <p className="text-sm text-muted-foreground">Template akan dikirim ke Meta untuk proses approval (24-48 jam).</p>
            <div>
              <label className="text-sm font-medium">Kategori</label>
              <select value={metaCategory} onChange={(e) => setMetaCategory(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
                <option value="UTILITY">UTILITY — Layanan & Transaksi</option>
                <option value="MARKETING">MARKETING — Promo & Pengumuman</option>
                <option value="AUTHENTICATION">AUTHENTICATION — OTP & Verifikasi</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Bahasa</label>
              <select value={metaLanguage} onChange={(e) => setMetaLanguage(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowMetaSubmitDialog(false)}>Batal</Button>
              <Button size="sm" onClick={() => { handleSubmitToMeta(metaSubmitId, metaCategory, metaLanguage); setShowMetaSubmitDialog(false) }}>Submit ke Meta</Button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Create Meta Template Modal */}
    <CreateTemplateModal
      open={showCreateMetaTemplateModal}
      onClose={() => setShowCreateMetaTemplateModal(false)}
      onSubmit={handleCreateMetaTemplate}
    />
  </>
  )
}