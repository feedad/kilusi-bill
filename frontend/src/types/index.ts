// User Types
export interface User {
  id: string
  username: string
  name: string
  email?: string
  role: 'admin' | 'customer' | 'technician'
  phone?: string
  avatar?: string
  createdAt: string
  updatedAt: string
}

// Customer Types
export interface Customer {
  id: string
  username: string
  name: string
  email?: string
  phone?: string
  address?: string
  pppoeUsername?: string
  pppoePassword?: string
  packageId?: string
  package?: Package
  status: 'active' | 'inactive' | 'suspended'
  balance: number
  dueDate?: number
  createdAt: string
  updatedAt: string
}

// Package Types
export interface Package {
  id: string
  name: string
  price: number
  speed: string
  bandwidth?: string
  type: 'pppoe' | 'hotspot'
  period: 'monthly' | 'weekly' | 'daily'
  isActive: boolean
  description?: string
  createdAt: string
  updatedAt: string
}

// Invoice Types
export interface Invoice {
  id: string
  customerId: string
  customer?: Customer
  packageId?: string
  package?: Package
  amount: number
  dueDate: string
  status: 'paid' | 'unpaid' | 'overdue' | 'cancelled'
  description?: string
  paidAt?: string
  paymentMethod?: string
  createdAt: string
  updatedAt: string
}

// Payment Types
export interface Payment {
  id: string
  invoiceId: string
  invoice?: Invoice
  customerId: string
  customer?: Customer
  amount: number
  method: string
  status: 'pending' | 'confirmed' | 'failed'
  description?: string
  createdAt: string
  updatedAt: string
}

// Session Types
export interface Session {
  id: string
  username: string
  ip: string
  macAddress?: string
  startTime: string
  uptime: string
  rxBytes?: number
  txBytes?: number
  nasIp?: string
  status: 'online' | 'offline'
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  meta?: {
    total?: number
    page?: number
    pageSize?: number
    totalPages?: number
  }
}

// Form Types
export interface LoginFormData {
  username: string
  password: string
  remember?: boolean
}

export interface CustomerFormData {
  username: string
  name: string
  email?: string
  phone?: string
  address?: string
  pppoeUsername?: string
  pppoePassword?: string
  packageId?: string
}

export interface PackageFormData {
  name: string
  price: number
  speed: string
  bandwidth?: string
  type: 'pppoe' | 'hotspot'
  period: 'monthly' | 'weekly' | 'daily'
  description?: string
}

// Dashboard Types
export interface DashboardStats {
  totalCustomers: number
  activeCustomers: number
  totalRevenue: number
  monthlyRevenue: number
  activeSessions: number
  totalPackages: number
  newCustomers: number
  overdueInvoices: number
}

export interface ActivityItem {
  id: string
  type: 'login' | 'logout' | 'payment' | 'customer_created' | 'customer_updated' | 'invoice_generated'
}

// WhatsApp Types
export interface WhatsAppTemplate {
  key: string
  title: string
  template: string
  enabled: boolean
  variables?: string[]
  category?: 'invoice' | 'payment' | 'service' | 'announcement'
  usage_count?: number
  last_used?: string
}

export interface WhatsAppSettings {
  rateLimit: {
    maxMessagesPerBatch: number
    delayBetweenBatches: number
    delayBetweenMessages: number
    maxRetries: number
    dailyMessageLimit: number
    enabled: boolean
  }
  groups: {
    enabled: boolean
    ids: string[]
    names?: string[]
  }
  templates: Record<string, WhatsAppTemplate>
  adminNumbers: string[]
  companyHeader: string
  footerInfo: string
  features: {
    imageAttachments: boolean
    autoPhoneFormat: boolean
    analytics: boolean
    backup: boolean
    errorRecovery: boolean
  }
}

export interface WhatsAppStatus {
  connected: boolean
  phoneNumber?: string
  profileName?: string
  lastSync?: string
  dailyCount: number
  monthlyCount: number
  queueStatus: 'idle' | 'processing' | 'paused'
  queueLength: number
  successRate: number
  avgResponseTime: number
  uptime: number
  qrCode?: string
  version?: string
  battery?: number
  plugged?: boolean
}

export interface NotificationResult {
  success: boolean
  sent: number
  failed: number
  skipped: number
  errors?: string[]
  duration?: number
  batchId?: string
}

export interface WhatsAppMessage {
  id: string
  to: string
  message: string
  type: 'text' | 'image' | 'document'
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  template?: string
  variables?: Record<string, unknown>
  scheduledAt?: string
  sentAt?: string
  deliveredAt?: string
  error?: string
  retryCount?: number
}

export interface WhatsAppQueue {
  id: string
  batchId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  totalMessages: number
  processedMessages: number
  failedMessages: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  estimatedCompletion?: string
  priority: 'low' | 'normal' | 'high'
}

export interface WhatsAppAnalytics {
  period: {
    start: string
    end: string
  }
  summary: {
    totalSent: number
    successRate: number
    avgResponseTime: number
    cost: number
    activeTemplates: number
  }
  daily: Array<{
    date: string
    sent: number
    success: number
    failed: number
    cost: number
  }>
  templates: Array<{
    template: string
    usage: number
    successRate: number
  }>
  hourly: Array<{
    hour: number
    count: number
  }>
  errors: Array<{
    type: string
    count: number
    lastOccurred: string
  }>
}

export interface WhatsAppTestConfig {
  phoneNumber: string
  templateKey: string
  variables: Record<string, unknown>
  customMessage?: string
  includeImage?: boolean
}

export interface WhatsAppBroadcast {
  id: string
  name: string
  type: 'announcement' | 'disruption' | 'custom'
  message: string
  recipientType: 'all' | 'active' | 'selected' | 'groups'
  recipients: string[] | string[]
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'failed'
  scheduledAt?: string
  sentAt?: string
  completedAt?: string
  results?: NotificationResult
  createdAt: string
  createdBy: string
}

// Settings Types
export interface Settings {
  company: {
    name: string
    address: string
    phone: string
    email: string
    logo?: string
  }
  billing: {
    autoIsolir: boolean
    isolirProfile: string
    graceDays: number
    dueDate: number
    reminderEnabled: boolean
  }
  mikrotik: {
    host: string
    port: number
    username: string
    password: string
    apiEnabled: boolean
  }
  whatsapp: {
    enabled: boolean
    keepAlive: boolean
    adminNumbers: string[]
    technicianNumbers: string[]
  }
  notifications: {
    loginNotifications: boolean
    logoutNotifications: boolean
    paymentNotifications: boolean
    troubleReports: boolean
  }
}

// Table Types
export interface TableColumn<T = unknown> {
  key: string
  label: string
  sortable?: boolean
  searchable?: boolean
  width?: string
  render?: (value: unknown, record: T) => React.ReactNode
}

export interface TableQuery {
  page?: number
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
  filter?: Record<string, unknown>
}

// Component Props Types
export interface BaseComponentProps {
  className?: string
  children?: React.ReactNode
}

export interface ModalProps extends BaseComponentProps {
  open: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export interface ButtonProps extends BaseComponentProps {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
}