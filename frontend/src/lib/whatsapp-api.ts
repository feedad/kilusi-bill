import {
  ApiResponse,
  WhatsAppSettings,
  WhatsAppStatus,
  WhatsAppTemplate,
  NotificationResult,
  WhatsAppTestConfig,
  WhatsAppAnalytics,
  WhatsAppBroadcast
} from '@/types'

class WhatsAppAPI {
  private baseUrl = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/whatsapp` : 'http://localhost:3000/api/v1/whatsapp'

  // Connection & Status
  async getStatus(): Promise<ApiResponse<WhatsAppStatus>> {
    const response = await fetch(`${this.baseUrl}/status`)

    // Handle 429 rate limiting errors
    if (response.status === 429) {
      return {
        success: false,
        error: 'Too many requests. Please wait a moment before trying again.',
        data: null
      }
    }

    return response.json()
  }

  async getQRCode(): Promise<ApiResponse<{ qrCode: string; connected: boolean }>> {
    const response = await fetch(`${this.baseUrl}/qr`)
    return response.json()
  }

  async refreshQRCode(): Promise<ApiResponse<{
    qrCode?: string;
    connected: boolean;
    status: string;
    message: string;
  }>> {
    const response = await fetch(`${this.baseUrl}/qr/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  async connect(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const response = await fetch(`${this.baseUrl}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  async disconnect(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const response = await fetch(`${this.baseUrl}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  async restart(): Promise<ApiResponse<{ success: boolean; message: string }>> {
    const response = await fetch(`${this.baseUrl}/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  // Settings & Configuration
  async getSettings(): Promise<ApiResponse<WhatsAppSettings>> {
    const response = await fetch(`${this.baseUrl}/settings`)
    return response.json()
  }

  async updateSettings(settings: Partial<WhatsAppSettings>): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    return response.json()
  }

  async getRateLimitSettings(): Promise<ApiResponse<WhatsAppSettings['rateLimit']>> {
    const response = await fetch(`${this.baseUrl}/rate-limit`)
    return response.json()
  }

  async updateRateLimitSettings(settings: WhatsAppSettings['rateLimit']): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/rate-limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    return response.json()
  }

  // Templates
  async getTemplates(): Promise<ApiResponse<Record<string, WhatsAppTemplate>>> {
    const response = await fetch(`${this.baseUrl}/templates`)
    return response.json()
  }

  async getTemplate(key: string): Promise<ApiResponse<WhatsAppTemplate>> {
    const response = await fetch(`${this.baseUrl}/templates/${key}`)
    return response.json()
  }

  async createTemplate(template: {
    id: string
    name: string
    content: string
    category: string
    enabled: boolean
  }): Promise<ApiResponse<WhatsAppTemplate>> {
    const response = await fetch(`${this.baseUrl}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template)
    })
    return response.json()
  }

  // Scheduling
  async getScheduledMessages(): Promise<ApiResponse<any>> {
    const response = await fetch(`${this.baseUrl}/schedule/messages`)
    return response.json()
  }

  async scheduleMessage(data: {
    recipient: string
    message: string
    scheduledAt: string
    templateId?: string
    variables?: Record<string, any>
    recurring?: string
  }): Promise<ApiResponse<any>> {
    const response = await fetch(`${this.baseUrl}/schedule/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return response.json()
  }

  async cancelScheduledMessage(id: string): Promise<ApiResponse<any>> {
    const response = await fetch(`${this.baseUrl}/schedule/messages/${id}`, {
      method: 'DELETE'
    })
    return response.json()
  }

  async updateTemplate(key: string, template: Partial<WhatsAppTemplate>): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/templates/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template)
    })
    return response.json()
  }

  async enableTemplate(key: string, enabled: boolean): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/templates/${key}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    return response.json()
  }

  async testTemplate(config: WhatsAppTestConfig): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    return response.json()
  }

  // Groups
  async getGroups(): Promise<ApiResponse<WhatsAppSettings['groups']>> {
    const response = await fetch(`${this.baseUrl}/groups`)
    return response.json()
  }

  async updateGroups(groups: WhatsAppSettings['groups']): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/groups`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(groups)
    })
    return response.json()
  }

  // Messages & Sending
  async sendMessage(config: {
    to: string
    message: string
    type?: string
    template?: string
    variables?: Record<string, any>
    scheduledAt?: string
  }): Promise<ApiResponse<NotificationResult>> {
    const response = await fetch(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: config.to,
        message: config.message,
        type: config.type || 'text'
      })
    })
    return response.json()
  }

  async sendBulkMessage(config: {
    recipients: string[]
    message: string
    template?: string
    variables?: Record<string, any>
    scheduledAt?: string
  }): Promise<ApiResponse<NotificationResult>> {
    const response = await fetch(`${this.baseUrl}/send-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    return response.json()
  }

  async sendInvoiceNotification(customerId: string, invoiceId: string): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/send-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, invoiceId })
    })
    return response.json()
  }

  // Broadcast
  async createBroadcast(broadcast: Omit<WhatsAppBroadcast, 'id' | 'createdAt' | 'createdBy'>): Promise<ApiResponse<WhatsAppBroadcast>> {
    const response = await fetch(`${this.baseUrl}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcast)
    })
    return response.json()
  }

  async getBroadcasts(): Promise<ApiResponse<WhatsAppBroadcast[]>> {
    const response = await fetch(`${this.baseUrl}/broadcast`)
    return response.json()
  }

  async getBroadcast(id: string): Promise<ApiResponse<WhatsAppBroadcast>> {
    const response = await fetch(`${this.baseUrl}/broadcast/${id}`)
    return response.json()
  }

  async executeBroadcast(id: string): Promise<ApiResponse<NotificationResult>> {
    const response = await fetch(`${this.baseUrl}/broadcast/${id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  // Queue Management
  async getQueue(): Promise<ApiResponse<{
    status: string
    length: number
    processing: number
    batches: any[]
  }>> {
    const response = await fetch(`${this.baseUrl}/queue`)
    return response.json()
  }

  async pauseQueue(): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/queue/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  async resumeQueue(): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/queue/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  async clearQueue(): Promise<ApiResponse> {
    const response = await fetch(`${this.baseUrl}/queue/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  // Analytics & Reports
  async getAnalytics(period?: { start: string; end: string }): Promise<ApiResponse<WhatsAppAnalytics>> {
    const params = period ? `?start=${period.start}&end=${period.end}` : ''
    const response = await fetch(`${this.baseUrl}/analytics${params}`)
    return response.json()
  }

  async getReport(type: 'daily' | 'weekly' | 'monthly', period?: { start: string; end: string }): Promise<ApiResponse<Blob>> {
    const params = period ? `?start=${period.start}&end=${period.end}` : ''
    const response = await fetch(`${this.baseUrl}/report/${type}${params}`)
    return response.blob().then(blob => ({
      success: true,
      data: blob
    }))
  }

  // Logs & History
  async getMessageHistory(filters?: {
    page?: number
    limit?: number
    status?: string
    template?: string
    dateFrom?: string
    dateTo?: string
  }): Promise<ApiResponse<{
    messages: any[]
    total: number
    page: number
    totalPages: number
  }>> {
    const params = new URLSearchParams(filters as any).toString()
    const response = await fetch(`${this.baseUrl}/history?${params}`)

    // Handle 429 rate limiting errors
    if (response.status === 429) {
      return {
        success: false,
        error: 'Too many requests. Please wait a moment before trying again.',
        data: null
      }
    }

    return response.json()
  }

  async getLogs(type?: 'error' | 'info' | 'debug', limit?: number): Promise<ApiResponse<string[]>> {
    const params = new URLSearchParams({ type, limit: limit?.toString() } as any).toString()
    const response = await fetch(`${this.baseUrl}/logs?${params}`)
    return response.json()
  }

  // Message History Management
  async getMessageHistoryStats(): Promise<ApiResponse<{
    totalMessages: number
    sentMessages: number
    failedMessages: number
    activeMessages: number
    scheduledMessages: number
    oldestMessage: string
    newestMessage: string
    storageLevel: 'normal' | 'caution' | 'warning' | 'critical'
    warningMessage?: string
    needsCleanup: boolean
    limits: {
      max: number
      warning: number
      critical: number
    }
    storagePercentage: number
  }>> {
    const response = await fetch(`${this.baseUrl}/history/stats`)
    return response.json()
  }

  async cleanupMessageHistory(keepCount: number = 500): Promise<ApiResponse<{
    deletedCount: number
    keptCount: number
    cutoffDate?: string
    deletedMessages?: any[]
  }>> {
    const response = await fetch(`${this.baseUrl}/history/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepCount })
    })
    return response.json()
  }

  async clearAllMessageHistory(): Promise<ApiResponse<{
    deletedCount: number
    deletedIds: string[]
  }>> {
    const response = await fetch(`${this.baseUrl}/history/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    return response.json()
  }

  // Advanced Functions
  async validatePhoneNumber(phone: string): Promise<ApiResponse<{
    valid: boolean
    formatted: string
    existsOnWhatsApp?: boolean
  }>> {
    const response = await fetch(`${this.baseUrl}/validate-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    })
    return response.json()
  }

  async getSystemInfo(): Promise<ApiResponse<{
    version: string
    uptime: number
    memory: {
      used: number
      total: number
      percentage: number
    }
    cpu: number
    disk: {
      used: number
      total: number
      percentage: number
    }
    network: {
      connected: boolean
      speed: number
    }
  }>> {
    const response = await fetch(`${this.baseUrl}/system-info`)
    return response.json()
  }

  async exportData(type: 'templates' | 'settings' | 'logs' | 'analytics'): Promise<ApiResponse<Blob>> {
    const response = await fetch(`${this.baseUrl}/export/${type}`)
    return response.blob().then(blob => ({
      success: true,
      data: blob
    }))
  }

  async importData(type: 'templates' | 'settings', file: File): Promise<ApiResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${this.baseUrl}/import/${type}`, {
      method: 'POST',
      body: formData
    })
    return response.json()
  }

  // Regions and Customer Statistics
  async getRegionsStats(): Promise<ApiResponse<Array<{
    id: string
    name: string
    customerCount: number
    activeCount: number
  }>>> {
    console.log('🌍 getRegionsStats called')
    try {
      const apiUrl = `${this.baseUrl}/regions-stats`
      console.log('📡 Fetching regions stats from:', apiUrl)
      const response = await fetch(apiUrl)
      const result = await response.json()

      console.log('📊 Regions stats API response:', result)

      if (result.success && result.data && result.data.length > 0) {
        // Use the data directly from the regions-stats endpoint
        const regionsWithStats = result.data.map((region: any) => {
          console.log('🏢 Processing region:', region)
          return {
            id: region.id,
            name: region.name,
            customerCount: region.customerCount || 0, // Use real data from API
            activeCount: region.activeCount || 0       // Use real data from API
          }
        })

        console.log('✅ Returning regions with stats:', regionsWithStats)
        return {
          success: true,
          data: regionsWithStats.sort((a, b) => a.name.localeCompare(b.name))
        }
      } else {
        console.log('❌ Regions API failed or no data:', result)
      }

      console.log('⚠️ API returned no regions data')
      return {
        success: true,
        data: []
      }
    } catch (error) {
      console.error('❌ Error in getRegionsStats:', error)
      return {
        success: false,
        message: 'Failed to fetch regions data',
        data: []
      }
    }
  }

  async getCustomerStats(): Promise<ApiResponse<{
    total: number
    active: number
    inactive: number
    suspended: number
  }>> {
    console.log('👥 getCustomerStats called')
    try {
      const apiUrl = `${this.baseUrl}/customer-stats`
      console.log('📡 Fetching customer stats from:', apiUrl)
      const response = await fetch(apiUrl)
      const result = await response.json()
      console.log('📊 Customer stats response:', result)
      return result
    } catch (error) {
      console.error('❌ Error in getCustomerStats:', error)
      return {
        success: false,
        data: { total: 0, active: 0, inactive: 0, suspended: 0 }
      }
    }
  }
}

export const whatsappAPI = new WhatsAppAPI()