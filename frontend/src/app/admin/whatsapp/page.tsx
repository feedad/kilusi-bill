'use client'

import { useEffect, useState, useRef } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { useWhatsAppWebSocket } from '@/hooks/useWhatsAppWebSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { whatsappAPI } from '@/lib/whatsapp-api'
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

  // Broadcast states
  const [broadcastType, setBroadcastType] = useState<'all' | 'region'>('all')
  const [customerStatus, setCustomerStatus] = useState<'all' | 'active'>('active')
  const [selectedRegion, setSelectedRegion] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [customMessage, setCustomMessage] = useState<string>('')
  const [showPreview, setShowPreview] = useState<boolean>(false)
  const [isSending, setIsSending] = useState<boolean>(false)
  const [sendingProgress, setSendingProgress] = useState<number>(0)
  const [sentCount, setSentCount] = useState<number>(0)
  const [failedCount, setFailedCount] = useState<number>(0)

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


  // Templates state
  const [templates, setTemplates] = useState<any[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [newTemplate, setNewTemplate] = useState({
    id: '',
    name: '',
    content: '',
    category: 'billing',
    enabled: true
  })
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [isCreatingDefaults, setIsCreatingDefaults] = useState(false)
  const [hasCreatedDefaults, setHasCreatedDefaults] = useState(false)

  // Use a ref to prevent multiple default template creations
  const defaultTemplatesCreatedRef = useRef(false)

  // Get recipient count based on selection
  const getRecipientCount = () => {
    if (broadcastType === 'all') {
      // Use customerStats API data for "all" selection
      if (customerStatus === 'active') {
        return customerStats.active
      } else {
        return customerStats.total
      }
    } else if (selectedRegion) {
      const region = regions.find(r => r.id === selectedRegion)
      if (region) {
        return customerStatus === 'active' ? region.activeCount : region.customerCount
      }
      return 0
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

  const handleSendBroadcast = async () => {
    if (scheduleMode && scheduledAt) {
      // Schedule the broadcast
      try {
        const recipients = getBroadcastRecipients()
        const message = getFinalMessage()

        const result = await whatsappAPI.scheduleMessage({
          recipient: recipients[0] || 'all_customers',
          message: message,
          scheduledAt: scheduledAt,
          templateId: selectedTemplate || undefined,
          variables: getTemplateVariables(),
          recurring: recurringPattern || undefined
        })

        if (result.success) {
          console.log('Broadcast scheduled successfully:', result)
          // Reset form
          setScheduleMode(false)
          setScheduledAt('')
          setRecurringPattern('')
          setShowPreview(false)
          alert('Broadcast berhasil dijadwalkan!')
          // Refresh scheduled messages
          fetchScheduledMessages()
        } else {
          console.error('Failed to schedule broadcast:', result.error)
          alert(`Gagal menjadwalkan broadcast: ${result.error}`)
        }
      } catch (error) {
        console.error('Error scheduling broadcast:', error)
        alert('Terjadi kesalahan saat menjadwalkan broadcast')
      }
    } else {
      // Send immediately
      try {
        setIsSending(true)
        setSentCount(0)
        setFailedCount(0)
        setSendingProgress(0)

        const recipients = getBroadcastRecipients()
        const message = getFinalMessage()

        if (recipients.length === 0) {
          alert('Silakan pilih penerima terlebih dahulu')
          setIsSending(false)
          return
        }

        // Create and execute broadcast
        const broadcastData = {
          name: `Broadcast ${new Date().toLocaleString('id-ID')}`,
          message: message,
          recipients: recipients,
          templateId: selectedTemplate || undefined,
          variables: getTemplateVariables()
        }

        setSendingProgress(25) // Start progress

        const createResult = await whatsappAPI.createBroadcast(broadcastData)

        if (createResult.success) {
          setSendingProgress(50) // Created broadcast

          const executeResult = await whatsappAPI.executeBroadcast(createResult.data.id)

          if (executeResult.success) {
            setSendingProgress(100) // Completed

            // Update with actual results from backend
            setSentCount(executeResult.data.sentCount || 0)
            setFailedCount(executeResult.data.failedCount || 0)

            console.log('Broadcast sent successfully:', executeResult)
            alert(`Broadcast berhasil dikirim! ${executeResult.data.sentCount || 0} berhasil, ${executeResult.data.failedCount || 0} gagal`)
          } else {
            console.error('Failed to execute broadcast:', executeResult.error)
            alert(`Gagal mengirim broadcast: ${executeResult.error}`)
          }
        } else {
          console.error('Failed to create broadcast:', createResult.error)
          alert(`Gagal membuat broadcast: ${createResult.error}`)
        }
      } catch (error) {
        console.error('Error sending broadcast:', error)
        alert('Terjadi kesalahan saat mengirim broadcast')
      } finally {
        setIsSending(false)
        setShowPreview(false)
      }
    }
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
    // Extract variables from selected template
    const template = templates.find(t => t.id === selectedTemplate)
    if (!template || !template.variables) return {}

    // Return mock variables based on template variables
    const variables: any = {}

    // Common variables
    template.variables.forEach((variable: string) => {
      switch (variable) {
        case 'customerName':
        case 'customer_name':
          variables[variable] = 'John Doe'
          break
        case 'invoiceNumber':
        case 'invoice_number':
          variables[variable] = 'INV-2024-001'
          break
        case 'amount':
          variables[variable] = '{{amount}}'
          break
        case 'dueDate':
        case 'due_date':
          variables[variable] = '31 Desember 2024'
          break
        case 'packageName':
        case 'package_name':
          variables[variable] = 'Premium Package'
          break
        case 'packageSpeed':
        case 'package_speed':
          variables[variable] = '100 Mbps'
          break
        case 'paymentMethod':
        case 'payment_method':
          variables[variable] = 'Transfer Bank'
          break
        case 'paymentDate':
        case 'payment_date':
          variables[variable] = '15 Desember 2024'
          break
        case 'referenceNumber':
        case 'reference_number':
          variables[variable] = 'REF-123456'
          break
        case 'discount':
          variables[variable] = '20'
          break
        case 'expiry_date':
          variables[variable] = '31 Desember 2024'
          break
        case 'company_name':
          variables[variable] = 'Kilusi Bill'
          break
        case 'supportNumber':
        case 'support_number':
          variables[variable] = '628123456789'
          break
        case 'disruption_type':
          variables[variable] = 'Maintenance Jaringan'
          break
        case 'affected_area':
          variables[variable] = 'Jakarta Selatan'
          break
        case 'estimated_resolution':
          variables[variable] = '2 jam'
          break
        case 'support_phone':
          variables[variable] = '628123456789'
          break
        case 'announcement_content':
          variables[variable] = 'Pembaruan sistem akan dilakukan pada tanggal 31 Desember 2024'
          break
        case 'reason':
          variables[variable] = 'Pembayaran terlambat'
          break
        case 'days_remaining':
          variables[variable] = '3 hari'
          break
        case 'days_overdue':
          variables[variable] = '5 hari'
          break
        case 'username':
          variables[variable] = 'john.doe'
          break
        case 'wifi_password':
          variables[variable] = 'MyWifi123'
          break
        case 'notes':
          variables[variable] = 'Tagihan bulanan untuk layanan internet'
          break
        case 'month':
          variables[variable] = 'Desember 2024'
          break
        case 'date':
          variables[variable] = '31 Desember 2024'
          break
        case 'time':
          variables[variable] = '23:00 - 01:00 WIB'
          break
        case 'duration':
          variables[variable] = '2 jam'
          break
        case 'feature_name':
          variables[variable] = 'Dashboard Monitoring Baru'
          break
        case 'feature_description':
          variables[variable] = 'Monitor real-time status koneksi Anda'
          break
        case 'holiday_name':
          variables[variable] = 'Natal'
          break
        default:
          variables[variable] = `[${variable}]`
      }
    })

    return variables
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
        setHistoryPagination(response.data.pagination || {
          page: 1,
          limit: messagesPerPage,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false
        })
      } else {
        console.error('Failed to fetch message history:', response.error || response.message)
        // Show user-friendly error message for rate limiting
        if (response.error?.includes('Too many requests')) {
          setError('Too many requests. Please wait a moment before refreshing.')
          setTimeout(() => setError(null), 3000)
        }
      }
    } catch (error) {
      console.error('Error fetching message history:', error)
      // Handle JSON parsing errors from rate limiting
      if (error instanceof SyntaxError && error.message.includes('Too many r')) {
        setError('Too many requests. Please wait a moment before refreshing.')
        setTimeout(() => setError(null), 3000)
      }
    } finally {
      setIsLoadingHistory(false)
    }
  }

  // Fetch templates from backend
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

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/whatsapp/templates/${templateId}/test`, {
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

  // Edit template function
  const handleEditTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template) {
      alert('Template not found')
      return
    }

    // Set the form with template data
    setNewTemplate({
      id: template.id,
      name: template.name,
      content: template.content,
      category: template.category,
      enabled: template.enabled
    })

    // Set edit mode
    setEditingTemplateId(templateId)

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
      let response
      const isEditMode = editingTemplateId !== null

      if (isEditMode) {
        // Update existing template
        response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/whatsapp/templates/${editingTemplateId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newTemplate)
        })
      } else {
        // Check if template ID already exists
        if (templates.some(t => t.id === newTemplate.id)) {
          alert('Template with this ID already exists')
          return
        }

        // Create new template
        response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/whatsapp/templates`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newTemplate)
        })
      }

      const result = await response.json()

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
          enabled: true
        })
        fetchTemplates() // Refresh templates
      } else {
        alert(`Failed to ${isEditMode ? 'update' : 'create'} template: ` + (result.message || 'Unknown error'))
      }
    } catch (error) {
      console.error(`Error ${editingTemplateId ? 'updating' : 'creating'} template:`, error)
      alert(`Error ${editingTemplateId ? 'updating' : 'creating'} template: ` + (error instanceof Error ? error.message : 'Unknown error'))
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/whatsapp/clear-session`, {
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

          {/* Connection Control Button */}
          {status?.connected ? (
            <Button variant="outline" size="sm" onClick={disconnect} disabled={loading}>
              <PowerOff className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={connect} disabled={connecting}>
              <QrCode className="w-4 h-4 mr-2" />
              {connecting ? 'Connecting...' : 'Connect'}
            </Button>
          )}

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
        <TabsList className="grid w-full grid-cols-7">
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
          <TabsTrigger value="gateway">
            <Settings className="w-4 h-4 mr-2" />
            Gateway
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab - Message History */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Real-Time Notifications */}
          <RealTimeNotifications />

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Message History
                  </CardTitle>
                  <CardDescription>
                    Riwayat pesan WhatsApp yang terkirim
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchMessageHistory(currentPage)}
                    disabled={isLoadingHistory}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  {selectedMessages.length === 0 ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllFailedMessages}
                        disabled={failedMessageIds.length === 0}
                      >
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Select All Failed ({failedMessageIds.length})
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-gray-500">
                        {selectedMessages.length} selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllSelections}
                      >
                        <Square className="w-4 h-4 mr-2" />
                        Clear Selection
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Bulk resend logic here
                          console.log('Resending messages:', selectedMessages)
                          setSelectedMessages([])
                        }}
                      >
                        <RedoIcon className="w-4 h-4 mr-2" />
                        Resend Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Only show messages when not loading and messages exist */}
              {!isLoadingHistory && currentMessages.length > 0 && (
                <div className="space-y-2">
                  {currentMessages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3 py-3 border-b last:border-b-0 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        disabled={msg.status === 'success'}
                        checked={selectedMessages.includes(msg.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMessages([...selectedMessages, msg.id])
                          } else {
                            setSelectedMessages(selectedMessages.filter(id => id !== msg.id))
                          }
                        }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={msg.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                            {msg.status === 'success' ? '✓ Terkirim' : '✗ Gagal'}
                          </Badge>
                          <span className="text-xs text-gray-500">{msg.time}</span>
                          <span className="text-xs font-medium text-gray-700">{msg.type}</span>
                        </div>
                        <p className="text-sm text-gray-900 mb-1">{msg.message}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">{msg.recipient}</p>
                          {msg.status === 'failed' && msg.error && (
                            <p className="text-xs text-red-600">{msg.error}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {msg.status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => console.log('Resend message:', msg.id)}
                            className="h-6 px-2 text-xs"
                          >
                            <RedoIcon className="w-3 h-3 mr-1" />
                            Resend
                          </Button>
                        )}
                        {msg.status === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Loading State */}
              {isLoadingHistory && (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span className="text-gray-500">Loading message history...</span>
                </div>
              )}

              {/* Empty State */}
              {!isLoadingHistory && currentMessages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Messages Found</h3>
                  <p className="text-gray-500">
                    No WhatsApp messages found in the history. Start sending messages to see them here.
                  </p>
                </div>
              )}

              {/* Pagination Controls */}
              {!isLoadingHistory && historyPagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-gray-500">
                    Showing {historyPagination.total > 0 ? ((historyPagination.page - 1) * historyPagination.limit) + 1 : 0} to {Math.min(historyPagination.page * historyPagination.limit, historyPagination.total)} of {historyPagination.total} messages
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = currentPage - 1
                        setCurrentPage(newPage)
                        fetchMessageHistory(newPage)
                      }}
                      disabled={!historyPagination.hasPrev || isLoadingHistory}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>

                    <div className="flex items-center gap-1">
                      {/* Show current page and some surrounding pages */}
                      {(() => {
                        const pages = []
                        const currentPageNum = historyPagination.page
                        const totalPagesNum = historyPagination.totalPages

                        // Always show page 1
                        if (currentPageNum > 3) {
                          pages.push(1)
                          if (currentPageNum > 4) {
                            pages.push('...')
                          }
                        }

                        // Show pages around current
                        for (let i = Math.max(1, currentPageNum - 1); i <= Math.min(totalPagesNum, currentPageNum + 1); i++) {
                          pages.push(i)
                        }

                        // Always show last page
                        if (currentPageNum < totalPagesNum - 2) {
                          if (currentPageNum < totalPagesNum - 3) {
                            pages.push('...')
                          }
                          pages.push(totalPagesNum)
                        }

                        return pages.map((page, index) => {
                          if (page === '...') {
                            return <span key={`ellipsis-${index}`} className="px-2">...</span>
                          }
                          return (
                            <Button
                              key={page}
                              variant={currentPageNum === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setCurrentPage(page)
                                fetchMessageHistory(page)
                              }}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          )
                        })
                      })()}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newPage = currentPage + 1
                        setCurrentPage(newPage)
                        fetchMessageHistory(newPage)
                      }}
                      disabled={!historyPagination.hasNext || isLoadingHistory}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Message Templates</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchTemplates} disabled={isLoadingTemplates}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingTemplates ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {templates.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createDefaultTemplates}
                  disabled={isLoadingTemplates || isCreatingDefaults}
                >
                  <FileText className={`w-4 h-4 mr-2 ${isCreatingDefaults ? 'animate-spin' : ''}`} />
                  {isCreatingDefaults ? 'Creating...' : 'Create Default Templates'}
                </Button>
              )}
              <Button onClick={() => {
                console.log('Opening create template modal...')
                try {
                  setShowCreateTemplateModal(true)
                } catch (error) {
                  console.error('Error opening modal:', error)
                  alert('Error opening create template modal')
                }
              }}>
                <MessageSquare className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </div>
          </div>

          {isLoadingTemplates ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto animate-spin mb-4" />
              <p className="text-gray-500">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
              <p className="text-gray-500 mb-4">
                Create your first message template to get started
              </p>
              <Button onClick={() => {
                console.log('Opening create template modal from empty state...')
                try {
                  setShowCreateTemplateModal(true)
                } catch (error) {
                  console.error('Error opening modal:', error)
                  alert('Error opening create template modal')
                }
              }}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {templates.map((template) => (
                <Card key={template.id} className={template.enabled ? '' : 'opacity-60'}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant={template.enabled ? 'default' : 'secondary'}>
                          {template.enabled ? 'Active' : 'Inactive'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription>
                      {(template.content || '').substring(0, 100)}
                      {(template.content?.length || 0) > 100 ? '...' : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Variables */}
                      {template.variables && template.variables.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Variables:</p>
                          <div className="flex flex-wrap gap-1">
                            {template.variables.map((variable: string, index: number) => (
                              <span key={index} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                                {`{{${variable}}}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stats and Actions */}
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          Used {template.usageCount || 0} times
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const phoneNumber = prompt('Enter phone number for test (6281234567890):')
                              if (phoneNumber) {
                                testTemplate(template.id, phoneNumber)
                              }
                            }}
                          >
                            <TestTube className="w-3 h-3 mr-1" />
                            Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTemplate(template.id)}
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Send Message Tab - Broadcast */}
        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="w-5 h-5" />
                    Broadcast Message
                  </CardTitle>
                  <CardDescription>
                    Kirim pesan WhatsApp ke pelanggan berdasarkan wilayah atau semua pelanggan
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchRegionsData}
                  disabled={loadingRegions}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingRegions ? 'animate-spin' : ''}`} />
                  Refresh Data
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Recipient Selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Pilih Penerima</label>
                  <select
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value as 'all' | 'region')}
                    className="w-full p-2 border rounded-md bg-background text-sm"
                  >
                    <option value="">Pilih tipe penerima</option>
                    <option value="all">🌐 Semua Pelanggan</option>
                    <option value="region">📍 Berdasarkan Wilayah</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Status Pelanggan</label>
                  <select
                    value={customerStatus}
                    onChange={(e) => setCustomerStatus(e.target.value as 'all' | 'active')}
                    className="w-full p-2 border rounded-md bg-background text-sm"
                  >
                    <option value="">Pilih status pelanggan</option>
                    <option value="active">✅ Pelanggan Aktif Saja ({customerStats.active.toLocaleString()} pelanggan)</option>
                    <option value="all">👥 Semua Pelanggan ({customerStats.total.toLocaleString()} pelanggan)</option>
                  </select>
                </div>

                {broadcastType === 'region' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Pilih Wilayah</label>
                    <select
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      disabled={loadingRegions}
                      className="w-full p-2 border rounded-md bg-background text-sm disabled:opacity-50"
                    >
                      <option value="">
                        {loadingRegions ? "Memuat wilayah..." : "Pilih wilayah"}
                      </option>
                      {loadingRegions && (
                        <option value="loading" disabled>
                          🔄 Memuat data wilayah...
                        </option>
                      )}
                      {!loadingRegions && regions.length === 0 && (
                        <option value="no-data" disabled>
                          ❌ Tidak ada data wilayah
                        </option>
                      )}
                      {regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name} ({customerStatus === 'active'
                            ? `${region.activeCount} aktif`
                            : `${region.customerCount} total`
                          })
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Message Template Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Pilih Template Pesan</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full p-2 border rounded-md bg-background text-sm"
                >
                  <option value="">Pilih template atau ketik custom message</option>
                  {templates
                    .sort((a, b) => a.name.localeCompare(b.name)) // Sort by name alphabetically
                    .map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.category && `[${template.category}]`} {!template.enabled && '(Disabled)'}
                      </option>
                    ))}
                </select>

                {selectedTemplate && (
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-xs font-medium text-gray-700">Template Preview:</p>
                      <Badge variant="outline" className="text-xs">
                        {templates.find(t => t.id === selectedTemplate)?.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-line">
                      {getFinalMessage()}
                    </p>
                    {templates.find(t => t.id === selectedTemplate)?.variables?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Variables used:</p>
                        <div className="flex flex-wrap gap-1">
                          {templates.find(t => t.id === selectedTemplate)?.variables.map((variable: string, index: number) => (
                            <span key={index} className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                              {`{${variable}}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Custom Message */}
              <div>
                <label className="text-sm font-medium mb-2 block">Custom Message (Opsional)</label>
                <Textarea
                  placeholder="Ketik pesan custom di sini..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
              </div>

              {/* Scheduling Options */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="scheduleMode"
                    checked={scheduleMode}
                    onChange={(e) => setScheduleMode(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <label htmlFor="scheduleMode" className="text-sm font-medium cursor-pointer">
                    Jadwalkan Pengiriman
                  </label>
                </div>

                {scheduleMode && (
                  <div className="space-y-4 pl-6 border-l-2 border-blue-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Tanggal & Waktu</label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">Pola Pengulangan (Opsional)</label>
                        <Select value={recurringPattern} onValueChange={setRecurringPattern}>
                          <SelectTrigger>
                            <SelectValue placeholder="Tidak berulang" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Tidak berulang</SelectItem>
                            <SelectItem value="daily">Harian</SelectItem>
                            <SelectItem value="weekly">Mingguan</SelectItem>
                            <SelectItem value="monthly">Bulanan</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {scheduledAt && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-800">
                          📅 Pesan akan dikirim pada: <strong>{new Date(scheduledAt).toLocaleString('id-ID')}</strong>
                          {recurringPattern && ` (berulang: ${recurringPattern === 'daily' ? 'Harian' : recurringPattern === 'weekly' ? 'Mingguan' : 'Bulanan'})`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Preview and Send Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm text-gray-600">
                      <strong>Total Penerima:</strong> {getRecipientCount().toLocaleString()} pelanggan
                      {customerStatus === 'active' && (
                        <Badge variant="secondary" className="ml-2">
                          <UserCheck className="w-3 h-3 mr-1" />
                          Aktif
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {broadcastType === 'all'
                        ? `Semua ${customerStatus === 'active' ? 'wilayah' : 'pelanggan'}`
                        : `Wilayah ${regions.find(r => r.id === selectedRegion)?.name || '-'}`
                      } • Estimasi waktu: {Math.ceil(getRecipientCount() / 10)} menit
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handlePreview}
                      disabled={(!selectedTemplate && !customMessage.trim()) || (selectedTemplate && !templates.find(t => t.id === selectedTemplate)?.enabled)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>

                    <Button
                      onClick={handleSendBroadcast}
                      disabled={Boolean(!status?.connected) || Boolean(!selectedTemplate && !customMessage.trim()) || Boolean(getRecipientCount() === 0) || Boolean(isSending) || Boolean(scheduleMode && !scheduledAt) || Boolean(selectedTemplate && !templates.find(t => t.id === selectedTemplate)?.enabled)}
                      className="min-w-[120px]"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : scheduleMode && scheduledAt ? (
                        <>
                          <Clock className="w-4 h-4 mr-2" />
                          Jadwalkan
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Kirim Broadcast
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Progress Bar */}
                {isSending && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress: {sendingProgress}%</span>
                      <span>{sentCount} terkirim, {failedCount} gagal</span>
                    </div>
                    <Progress value={sendingProgress} className="w-full" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Preview Modal */}
          {showPreview && (
            <Card className="border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-500" />
                  Preview Pesan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">Contoh Pesan WhatsApp</span>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-sm whitespace-pre-line">
                        {getFinalMessage()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-blue-600">{getRecipientCount().toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Total Penerima</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">95%</div>
                      <div className="text-sm text-gray-600">Estimasi Success Rate</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-purple-600">{Math.ceil(getRecipientCount() / 10)}m</div>
                      <div className="text-sm text-gray-600">Estimasi Waktu</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowPreview(false)}>
                      Tutup Preview
                    </Button>
                    <Button
                      onClick={handleSendBroadcast}
                      disabled={Boolean(!status?.connected) || Boolean(isSending) || Boolean(selectedTemplate && !templates.find(t => t.id === selectedTemplate)?.enabled)}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Ya, Kirim Sekarang
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Queue Management Tab */}
        <TabsContent value="queue" className="space-y-4">
          <MessageQueueMonitor />

          {/* Scheduled Messages Section */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Scheduled Messages
                  </CardTitle>
                  <CardDescription>
                    View and manage scheduled WhatsApp messages
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchScheduledMessages}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowScheduledMessages(!showScheduledMessages)}
                  >
                    {showScheduledMessages ? 'Hide' : 'Show'} Scheduled
                  </Button>
                </div>
              </div>
            </CardHeader>
            {showScheduledMessages && (
              <CardContent>
                {scheduledMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Scheduled Messages</h3>
                    <p className="text-gray-500">
                      Schedule messages from the Send tab to see them here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {scheduledMessages.map((message) => (
                      <div key={message.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={
                              message.status === 'scheduled' ? 'default' :
                                message.status === 'processing' ? 'secondary' :
                                  message.status === 'completed' ? 'outline' : 'destructive'
                            }>
                              {message.status.charAt(0).toUpperCase() + message.status.slice(1)}
                            </Badge>
                            {message.recurring && (
                              <Badge variant="outline" className="text-xs">
                                {message.recurring}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium mb-1">{message.recipient}</p>
                          <p className="text-sm text-gray-600 line-clamp-2">{message.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            📅 {new Date(message.scheduledAt).toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {message.status === 'scheduled' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => cancelScheduledMessage(message.id)}
                            >
                              Cancel
                            </Button>
                          )}
                          {message.status === 'failed' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Resend logic here
                              }}
                            >
                              <RedoIcon className="w-4 h-4 mr-1" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <RealTimeAnalytics />
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/whatsapp/status`)
                              const result = await response.json()

                              if (result.success && result.data.connectionStatus === 'open') {
                                alert('✅ WhatsApp connection is active and ready!')
                              } else {
                                alert('⚠️ WhatsApp is not connected. Please scan QR code first.')
                              }
                            } catch (error) {
                              console.error('Error testing connection:', error)
                              alert('❌ Failed to test WhatsApp connection')
                            }
                          }}
                        >
                          Test Connection
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <MessageSquare className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                        <h4 className="font-medium">Template Test</h4>
                        <p className="text-sm text-gray-500 mb-3">Test message templates</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (templates.length === 0) {
                              alert('No templates available. Please create a template first.')
                              return
                            }

                            // Create a simple template selection
                            const templateOptions = templates.map((t, index) => `${index + 1}. ${t.name}`).join('\n')
                            const selection = prompt(`Select template:\n${templateOptions}\n\nEnter template number:`)

                            if (selection && !isNaN(selection)) {
                              const templateIndex = parseInt(selection) - 1
                              if (templateIndex >= 0 && templateIndex < templates.length) {
                                const selectedTemplate = templates[templateIndex]
                                const phoneNumber = prompt('Enter phone number for test (6281234567890):')
                                if (phoneNumber) {
                                  testTemplate(selectedTemplate.id, phoneNumber)
                                }
                              } else {
                                alert('Invalid template selection')
                              }
                            }
                          }}
                        >
                          Test Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gateway Tab */}
        <TabsContent value="gateway" className="space-y-4">
          <GatewaySettings />
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
                    <span className="inline-block bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-blue-500/30 transition-colors">{'{{customerName}}'}</span>
                    <span className="inline-block bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-green-500/30 transition-colors">{'{{invoiceNumber}}'}</span>
                    <span className="inline-block bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-yellow-500/30 transition-colors">{'{{amount}}'}</span>
                    <span className="inline-block bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-purple-500/30 transition-colors">{'{{dueDate}}'}</span>
                    <span className="inline-block bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-pink-500/30 transition-colors">{'{{packageName}}'}</span>
                    <span className="inline-block bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-cyan-500/30 transition-colors">{'{{packageSpeed}}'}</span>
                    <span className="inline-block bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-orange-500/30 transition-colors">{'{{paymentMethod}}'}</span>
                    <span className="inline-block bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-indigo-500/30 transition-colors">{'{{paymentDate}}'}</span>
                    <span className="inline-block bg-teal-500/20 text-teal-400 border border-teal-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-teal-500/30 transition-colors">{'{{username}}'}</span>
                    <span className="inline-block bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-rose-500/30 transition-colors">{'{{wifiPassword}}'}</span>
                    <span className="inline-block bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-emerald-500/30 transition-colors">{'{{paymentAccounts}}'}</span>
                    <span className="inline-block bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-amber-500/30 transition-colors">{'{{companyName}}'}</span>
                    <span className="inline-block bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-1 rounded-md cursor-pointer hover:bg-sky-500/30 transition-colors">{'{{supportNumber}}'}</span>
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
                      enabled: true
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
  )
}