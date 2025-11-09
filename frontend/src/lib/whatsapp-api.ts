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
  private baseUrl = '/api/v1/whatsapp'

  // Connection & Status
  async getStatus(): Promise<ApiResponse<WhatsAppStatus>> {
    const response = await fetch(`${this.baseUrl}/status`)
    return response.json()
  }

  async getQRCode(): Promise<ApiResponse<{ qrCode: string; connected: boolean }>> {
    const response = await fetch(`${this.baseUrl}/qrcode`)
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
    template?: string
    variables?: Record<string, any>
    scheduledAt?: string
  }): Promise<ApiResponse<NotificationResult>> {
    const response = await fetch(`${this.baseUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
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
    return response.json()
  }

  async getLogs(type?: 'error' | 'info' | 'debug', limit?: number): Promise<ApiResponse<string[]>> {
    const params = new URLSearchParams({ type, limit: limit?.toString() } as any).toString()
    const response = await fetch(`${this.baseUrl}/logs?${params}`)
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
}

export const whatsappAPI = new WhatsAppAPI()