/**
 * Customer Portal API Client
 * Dedicated API client for customer portal functionality with standardized responses
 */

import { api, endpoints } from './api'

// Types for Customer Portal API responses
export interface CustomerPortalResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
  meta?: {
    total?: number
    page?: number
    limit?: number
    timestamp?: string
  }
}

export interface BroadcastMessage {
  id: number
  title: string
  message: string
  type: 'informasi' | 'gangguan' | 'maintenance' | 'selesai'
  created_at: string
  expires_at?: string
  target_areas?: string[]
  target_all?: boolean
  is_active?: boolean
}

export interface CustomerProfile {
  id: number
  name: string
  email: string
  phone: string
  address: string
  region: string
  package_name: string
  status: 'active' | 'inactive' | 'suspended'
  pppoe_username: string
  installation_date: string
  last_payment?: string
  next_bill_date?: string
}

export interface CustomerBilling {
  current_invoice?: {
    id: number
    amount: number
    due_date: string
    status: 'paid' | 'unpaid' | 'overdue'
    description: string
  }
  invoices: Array<{
    id: number
    amount: number
    due_date: string
    status: 'paid' | 'unpaid' | 'overdue'
    description: string
    created_at: string
    paid_at?: string
  }>
  payments: Array<{
    id: number
    amount: number
    payment_date: string
    method: string
    status: string
    invoice_id: number
  }>
}

export interface CustomerUsage {
  current_period: {
    start_date: string
    end_date: string
    data_used: number
    data_limit: number
    percentage_used: number
  }
  daily_usage: Array<{
    date: string
    download: number
    upload: number
    total: number
  }>
}

export interface SupportTicket {
  id: number
  subject: string
  message: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  priority: 'low' | 'medium' | 'high'
  category: string
  created_at: string
  updated_at: string
  responses?: Array<{
    message: string
    created_at: string
    is_admin: boolean
  }>
}

export interface Notification {
  id: number
  title: string
  message: string
  type: 'info' | 'warning' | 'success' | 'error'
  read: boolean
  created_at: string
  action_url?: string
}

class CustomerPortalAPI {
  private baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://172.22.10.31:3000'

  // Generic request method with standardized error handling
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<CustomerPortalResponse<T>> {
    try {
      console.log('🚀 CustomerAPI: Request to:', endpoint, options)

      // Get customer data for phone number header
      const customerData = typeof window !== 'undefined'
        ? JSON.parse(localStorage.getItem('customer_data') || '{}')
        : {}

      // Check for available tokens
      let customerToken = null
      let authStorageToken = null

      if (typeof window !== 'undefined') {
        customerToken = localStorage.getItem('customer_token')
        const authStorage = localStorage.getItem('auth-storage')
        if (authStorage) {
          const parsed = JSON.parse(authStorage)
          authStorageToken = parsed.state?.token
        }
      }

      console.log('🔑 CustomerAPI Debug - Token Check:')
      console.log('  - customer_token:', customerToken ? `${customerToken.substring(0, 20)}...` : 'null')
      console.log('  - auth-storage token:', authStorageToken ? `${authStorageToken.substring(0, 20)}...` : 'null')
      console.log('  - customer_data:', customerData)

      const headers = {
        ...options.headers,
        ...(customerData.phone && { 'x-customer-phone': customerData.phone })
      }

      const response = await api({
        url: endpoint,
        method: options.method || 'GET',
        data: options.body,
        params: options.params,
        headers,
        ...options,
      })

      console.log('📡 CustomerAPI: Raw axios response:', response)
      console.log('📡 CustomerAPI: Response status:', response.status)
      console.log('📡 CustomerAPI: Response data:', response.data)
      console.log('📡 CustomerAPI: Response data type:', typeof response.data)

      // Handle different response formats
      if (response.data) {
        // Check if response.data has a 'data' property (nested structure)
        if (response.data.data && typeof response.data.data === 'object') {
          return {
            success: true,
            data: response.data.data,
            message: response.data.message,
            meta: response.data.meta,
          }
        } else {
          // Use response.data directly when no nested data property exists
          return {
            success: true,
            data: response.data,
            message: response.data.message,
            meta: response.data.meta,
          }
        }
      }

      return {
        success: true,
        data: response.data,
      }
    } catch (error: any) {
      console.error('Customer Portal API Error:', error)

      // Check for authentication errors and let them propagate to trigger redirect
      if (error.response?.status === 401) {
        console.log('🔐 Authentication error detected - propagating to trigger redirect')
        throw error  // Re-throw to trigger API interceptor redirect
      }

      // Extract error information from response
      if (error.response?.data) {
        return {
          success: false,
          error: error.response.data.message || error.response.data.error || 'Unknown error occurred',
          message: error.response.data.message,
        }
      }

      return {
        success: false,
        error: error.message || 'Network error occurred',
        message: 'Terjadi kesalahan koneksi. Silakan coba lagi.',
      }
    }
  }

  // Broadcast Messages
  async getActiveBroadcastMessages(params?: {
    customer_id?: number
    region?: string
  }): Promise<CustomerPortalResponse<BroadcastMessage[]>> {
    const queryParams = new URLSearchParams()
    if (params?.customer_id) queryParams.append('customer_id', params.customer_id.toString())
    if (params?.region) queryParams.append('region', params.region)

    const endpoint = `${endpoints.broadcast.public.active}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    return this.request<BroadcastMessage[]>(endpoint)
  }

  // Customer Portal Data (Comprehensive data for dashboard)
  async getCustomerData(): Promise<CustomerPortalResponse<{
    customer: any
    radiusStatus?: any
    billingStats?: any
  }>> {
    return this.request('/api/v1/customer-auth-nextjs/get-customer-data')
  }

  // Customer Profile
  async getProfile(customerId: number): Promise<CustomerPortalResponse<CustomerProfile>> {
    return this.request<CustomerProfile>(`/api/v1/customers/${customerId}`)
  }

  async updateProfile(customerId: number, data: Partial<CustomerProfile>): Promise<CustomerPortalResponse<CustomerProfile>> {
    return this.request<CustomerProfile>(`/api/v1/customers/${customerId}`, {
      method: 'PUT',
      body: data,
    })
  }

  // Customer Billing
  async getBilling(customerId: number): Promise<CustomerPortalResponse<CustomerBilling>> {
    console.log('💳 CustomerAPI: Getting billing data for customer:', customerId)

    try {
      // Get both invoices and payments for the customer
      const [invoicesResponse, paymentsResponse] = await Promise.all([
        this.request<CustomerBilling['invoices']>(`/api/v1/customer-billing/my-invoices`),
        this.request<CustomerBilling['payments']>(`/api/v1/customer-billing/my-payments`)
      ])

      console.log('📄 Invoices response:', invoicesResponse)
      console.log('💰 Payments response:', paymentsResponse)

      const billingData: CustomerBilling = {
        invoices: invoicesResponse.data || [],
        payments: paymentsResponse.data || [],
        current_invoice: null,
        total_unpaid: 0,
        total_paid: 0
      }

      console.log('📊 Combined billing data:', billingData)

      return {
        success: true,
        data: billingData
      }
    } catch (error) {
      console.error('💥 CustomerAPI: Error getting billing data:', error)
      return {
        success: false,
        message: error.message || 'Failed to fetch billing data',
        data: {
          invoices: [],
          payments: [],
          current_invoice: null,
          total_unpaid: 0,
          total_paid: 0
        }
      }
    }
  }

  async getInvoices(customerId: number, params?: { page?: number; limit?: number }): Promise<CustomerPortalResponse<CustomerBilling['invoices']>> {
    const queryParams = new URLSearchParams()
    if (params?.page) queryParams.append('page', params.page.toString())
    if (params?.limit) queryParams.append('limit', params.limit.toString())

    const endpoint = `/api/v1/billing/customer/${customerId}/invoices${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
    return this.request<CustomerBilling['invoices']>(endpoint)
  }

  async getInvoiceDetail(invoiceId: number): Promise<CustomerPortalResponse<CustomerBilling['invoices'][0]>> {
    return this.request<CustomerBilling['invoices'][0]>(`/api/v1/billing/invoices/${invoiceId}`)
  }

  // Customer Usage
  async getUsage(customerId: number): Promise<CustomerPortalResponse<CustomerUsage>> {
    return this.request<CustomerUsage>(`/api/v1/customer/${customerId}/usage`)
  }

  // Support Tickets
  async getTickets(customerId: number): Promise<CustomerPortalResponse<SupportTicket[]>> {
    return this.request<SupportTicket[]>(`/api/v1/customer/${customerId}/tickets`)
  }

  async createTicket(customerId: number, data: {
    subject: string
    message: string
    priority: 'low' | 'medium' | 'high'
    category: string
  }): Promise<CustomerPortalResponse<SupportTicket>> {
    return this.request<SupportTicket>(`/api/v1/customer/${customerId}/tickets`, {
      method: 'POST',
      body: data,
    })
  }

  async getTicketDetail(ticketId: number): Promise<CustomerPortalResponse<SupportTicket>> {
    return this.request<SupportTicket>(`/api/v1/customer/tickets/${ticketId}`)
  }

  async updateTicket(ticketId: number, data: {
    message?: string
    status?: 'open' | 'closed'
  }): Promise<CustomerPortalResponse<SupportTicket>> {
    return this.request<SupportTicket>(`/api/v1/customer/tickets/${ticketId}`, {
      method: 'PUT',
      body: data,
    })
  }

  // Notifications
  async getNotifications(customerId: number): Promise<CustomerPortalResponse<Notification[]>> {
    return this.request<Notification[]>(`/api/v1/customer/${customerId}/notifications`)
  }

  async markNotificationRead(notificationId: number): Promise<CustomerPortalResponse<null>> {
    return this.request<null>(`/api/v1/customer/notifications/${notificationId}/read`, {
      method: 'POST',
    })
  }

  // Device & Network Management
  async getRadiusInfo(): Promise<CustomerPortalResponse<any>> {
    return this.request('/api/v1/customer-radius/info')
  }

  async getRealtimeTraffic(): Promise<CustomerPortalResponse<any>> {
    return this.request('/api/v1/customer-traffic/realtime')
  }

  async updateSSID(ssid: string): Promise<CustomerPortalResponse<any>> {
    return this.request('/api/v1/customer-auth-nextjs/update-ssid', {
      method: 'POST',
      body: { ssid },
    })
  }

  async updatePassword(password: string): Promise<CustomerPortalResponse<any>> {
    return this.request('/api/v1/customer-auth-nextjs/update-password', {
      method: 'POST',
      body: { password },
    })
  }

  async getNotifications(): Promise<CustomerPortalResponse<any[]>> {
    return this.request('/api/v1/customer-support/notifications')
  }

  // System Status
  async getSystemStatus(): Promise<CustomerPortalResponse<{
    maintenance_mode: boolean
    maintenance_message?: string
    maintenance_start?: string
    maintenance_end?: string
    maintenance_type?: string
    affected_services?: string[]
    system_health: 'healthy' | 'degraded' | 'down'
    services: Array<{
      name: string
      status: 'online' | 'offline' | 'degraded'
      last_check: string
      description?: string
    }>
    critical_errors?: Array<{
      id: number
      message: string
      service: string
      timestamp: string
    }>
    last_updated: string
  }>> {
    return this.request('/api/v1/system/status')
  }

  // Utility methods
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
    }).format(amount)
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  formatDataSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  // Support tickets methods
  async getSupportTickets(customerId?: string): Promise<CustomerPortalResponse<any[]>> {
    console.log('🎫 Fetching support tickets for customer:', customerId || 'current user')

    if (customerId) {
      // Get tickets for specific customer using customer-support endpoint
      return this.request<any[]>(`/api/v1/customer-support/tickets?customer_id=${customerId}`)
    } else {
      // Get all tickets and let frontend filter using customer-support endpoint
      return this.request<any[]>('/api/v1/customer-support/tickets')
    }
  }

  async getSupportTicketDetails(ticketId: string): Promise<CustomerPortalResponse<any>> {
    return this.request<any>(`/api/v1/customer-support/tickets/${ticketId}`)
  }

  async createSupportTicket(ticketData: {
    subject: string
    description: string
    category?: string
    priority?: string
    customer_id?: string
    customer_name?: string
    customer_phone?: string
    customer_email?: string
    customer_address?: string
    initial_message?: string
  }): Promise<CustomerPortalResponse<any>> {
    return this.request<any>('/api/v1/customer-support/tickets', {
      method: 'POST',
      body: ticketData,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  async addSupportTicketMessage(ticketId: string, message: string, attachments?: File[]): Promise<CustomerPortalResponse<any>> {
    const formData = new FormData()
    formData.append('message', message)
    formData.append('sender_type', 'customer')

    if (attachments && attachments.length > 0) {
      attachments.forEach((file, index) => {
        formData.append(`attachments`, file)
      })
    }

    return this.request<any>(`/api/v1/customer-support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: formData
    })
  }
}

// Export singleton instance
export const customerAPI = new CustomerPortalAPI()

// Export types for use in components
export type { CustomerPortalAPI }

export default customerAPI