'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Settings,
  Tag,
  Wrench,
  Trash,
  Loader2
} from 'lucide-react'
import { adminApi, endpoints, handleApiError } from '@/lib/api-clients'

interface AccountingTransaction {
  id: number
  description: string
  amount: number
  type: 'revenue' | 'expense'
  category_id?: number
  category?: {
    id: number
    name: string
    color: string
    icon: string
    type: 'revenue' | 'expense'
  }
  reference_type?: string
  reference_id?: number
  mitra_id?: string
  mitra_name?: string
  date: string
  attachment_url?: string
  notes?: string
  created_at: string
  updated_at: string
}

interface AccountingCategory {
  id: number
  name: string
  type: 'revenue' | 'expense'
  description?: string
  color: string
  icon: string
  created_at: string
  updated_at: string
}

interface AccountingSummary {
  revenue: number
  expense: number
  profit: number
  revenue_count: number
  expense_count: number
  total_transactions: number
}

interface ProfitLossData {
  period: string
  revenue: number
  expense: number
  profit: number
  total_transactions: number
  profit_margin: string
}

export default function AccountingPage() {
  const [transactions, setTransactions] = useState<AccountingTransaction[]>([])
  const [categories, setCategories] = useState<AccountingCategory[]>([])
  const [summary, setSummary] = useState<AccountingSummary | null>(null)
  const [profitLossData, setProfitLossData] = useState<ProfitLossData[]>([])

  const [loading, setLoading] = useState(true)
  const [showTransactionDialog, setShowTransactionDialog] = useState(false)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showAutoExpenseDialog, setShowAutoExpenseDialog] = useState(false)

  const [editingTransaction, setEditingTransaction] = useState<AccountingTransaction | null>(null)
  const [editingCategory, setEditingCategory] = useState<AccountingCategory | null>(null)
  const [formLoading, setFormLoading] = useState(false)

  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense'>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMitra, setFilterMitra] = useState('')
  const [mitraList, setMitraList] = useState<Array<{ id: string, name: string }>>([])
  const [mitraSettlementData, setMitraSettlementData] = useState<any>(null)
  const [loadingSettlement, setLoadingSettlement] = useState(false)
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-01`
  })
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(lastDay)}`
  })
  const [searchTerm, setSearchTerm] = useState('')

  const [allTransactionsForPDF, setAllTransactionsForPDF] = useState<AccountingTransaction[]>([])
  const [reportType, setReportType] = useState<'summary' | 'detailed'>('summary')

  // Category form states
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'revenue' | 'expense'>('expense')
  const [newCategoryDescription, setNewCategoryDescription] = useState('')

  // Auto expense states
  const [autoExpenseSettings, setAutoExpenseSettings] = useState({
    technicianFee: 0,
    technicianFeeEnabled: false,
    recurringExpenses: [] as Array<{
      id: string
      name: string
      amount: number
      category_id: number | null
      frequency: 'daily' | 'weekly' | 'monthly'
      nextDate: string
      enabled: boolean
    }>
  })
  const [deletedRecurringIds, setDeletedRecurringIds] = useState<string[]>([])

  const [formData, setFormData] = useState({
    type: '' as 'revenue' | 'expense' | '',
    category_id: '',
    amount: '',
    description: '',
    reference_type: '',
    reference_id: '',
    date: (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })(),
    attachment_url: '',
    notes: ''
  })

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'revenue' as 'revenue' | 'expense',
    description: '',
    color: '#3b82f6',
    icon: 'trending-up'
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(amount)
  }

  // Quick date filter functions
  const clearDateFilters = () => {
    // Reset to current month instead of clearing to empty
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    setFilterStartDate(`${d.getFullYear()}-${p(d.getMonth()+1)}-01`)
    setFilterEndDate(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(lastDay)}`)
  }

  // ISO date string from a Date value
  const isoDate = (date: Date) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
  }

  // Bulan: 1st .. last day of chosen month/year
  const applyMonthFilter = (monthIndex: number, year: number) => {
    const first = new Date(year, monthIndex, 1)
    const lastDay = new Date(year, monthIndex + 1, 0).getDate()
    setFilterStartDate(isoDate(first))
    setFilterEndDate(isoDate(new Date(year, monthIndex, lastDay)))
  }

  const monthsInYear = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  const yearsList = (() => {
    const currentYear = new Date().getFullYear()
    const years = []
    for (let y = currentYear; y >= currentYear - 5; y--) years.push(y)
    return years
  })()
  const [quickMonth, setQuickMonth] = useState(new Date().getMonth())
  const [quickYear, setQuickYear] = useState(new Date().getFullYear())

  const filteredTransactions = (transactions || []).filter(transaction => {
    const matchesType = filterType === 'all' || transaction.type === filterType
    const matchesCategory = !filterCategory || String(transaction.category_id || '') === filterCategory
    const desc = transaction.description || ''
    const catName = transaction.category?.name || ''
    const mitra = transaction.mitra_name || ''
    const matchesSearch = !searchTerm ||
      desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      catName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mitra.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesType && matchesCategory && matchesSearch
  })

  const transactionColumns: DataTableColumn<AccountingTransaction>[] = [
    {
      key: 'date',
      title: 'Tanggal',
      sortable: true,
      render: (value) => formatDate(value as string),
      width: '120px'
    },
    {
      key: 'description',
      title: 'Deskripsi',
      sortable: true,
      render: (value, record) => (
        <div>
          <div className="font-medium">{value}</div>
          {record.category && (
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: record.category.color }}
              />
              {record.category.name}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'type',
      title: 'Tipe',
      sortable: true,
      render: (value) => (
        <Badge
          variant={value === 'revenue' ? 'default' : 'destructive'}
          className={value === 'revenue' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
        >
          {value === 'revenue' ? 'Pemasukan' : 'Pengeluaran'}
        </Badge>
      ),
      width: '120px'
    },
    {
      key: 'mitra_name' as any,
      title: 'Mitra',
      render: (_, record) => (
        <span className="text-xs text-muted-foreground font-medium">
          {record.mitra_name || '-'}
        </span>
      ),
      width: '120px'
    },
    {
      key: 'amount',
      title: 'Jumlah',
      sortable: true,
      render: (value, record) => (
        <div className={`font-semibold ${record.type === 'revenue' ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(value as number)}
        </div>
      ),
      width: '150px'
    },
    {
      key: 'id',
      title: 'Aksi',
      render: (_, record) => (
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditingTransaction(record)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDelete(record)}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      width: '120px'
    }
  ]

  const fetchTransactions = async () => {
    try {
      const params = new URLSearchParams()
      if (filterType !== 'all') params.append('type', filterType)
      if (filterCategory) params.append('category_id', filterCategory)
      if (filterMitra) params.append('mitra_id', filterMitra)
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      if (searchTerm) params.append('search', searchTerm)

      const response = await adminApi.get(`/api/v1/accounting/transactions?${params}`)
      if (response.data.success) {
        setTransactions(response.data.data.transactions)
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }

  const fetchMitraList = async () => {
    try {
      const response = await adminApi.get('/api/v1/mitra?limit=200')
      if (response.data.success) {
        setMitraList(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching mitra list:', error)
    }
  }

  const fetchMitraSettlement = async () => {
    try {
      setLoadingSettlement(true)
      const params = new URLSearchParams()
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      if (filterMitra) params.append('mitra_id', filterMitra)

      const response = await adminApi.get(`/api/v1/accounting/report/mitra-settlement?${params}`)
      if (response.data.success) {
        setMitraSettlementData(response.data.data)
      }
    } catch (error) {
      console.error('Error fetching mitra settlement:', error)
    } finally {
      setLoadingSettlement(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await adminApi.get('/api/v1/accounting/categories')
      if (response.data.success && Array.isArray(response.data.data)) {
        setCategories(response.data.data)
      } else {
        setCategories([])
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
      setCategories([])
    }
  }

  const fetchSummary = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      if (filterMitra) params.append('mitra_id', filterMitra)

      const response = await adminApi.get(`/api/v1/accounting/summary?${params}`)
      if (response.data.success) {
        setSummary(response.data.data.summary)
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
    }
  }

  const handleDelete = async (transaction: AccountingTransaction) => {
    if (!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) {
      return
    }

    try {
      await adminApi.delete(`/api/v1/accounting/transactions/${transaction.id}`)
      await fetchTransactions()
      await fetchSummary()
    } catch (error) {
      console.error('Error deleting transaction:', error)
    }
  }

  const loadAllData = async () => {
    setLoading(true)
    await Promise.all([
      fetchTransactions(),
      fetchCategories(),
      fetchSummary(),
      fetchProfitLoss(),
      fetchMitraList(),
      fetchMitraSettlement(),
      fetchAutoExpenseSettings()
    ])
    setLoading(false)
  }

  const fetchAutoExpenseSettings = async () => {
    try {
      const [settingsRes, recurringRes] = await Promise.all([
        adminApi.get('/api/v1/auto-expenses/settings'),
        adminApi.get('/api/v1/auto-expenses/recurring')
      ])

      if (settingsRes.data.success) {
        const s = settingsRes.data.data
        setAutoExpenseSettings(prev => ({
          ...prev,
          technicianFeeEnabled: s.technician_fee_enabled?.isActive && s.technician_fee_enabled?.value === 'true',
          technicianFee: parseInt(s.technician_fee_amount?.value) || 0,

        }))
      }

      if (recurringRes.data.success) {
        const list = recurringRes.data.data || []
        setAutoExpenseSettings(prev => ({
          ...prev,
          recurringExpenses: list.map((r: { id: number; name: string; amount: number; category_id: number | null; frequency: string; next_date: string; is_active: boolean }) => ({
            id: String(r.id),
            name: r.name,
            amount: Number(r.amount),
            category_id: r.category_id,
            frequency: r.frequency as 'daily' | 'weekly' | 'monthly',
            nextDate: r.next_date,
            enabled: r.is_active
          }))
        }))
      }
    } catch (error) {
      console.error('Error fetching auto expense settings:', error)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [filterType, filterCategory, filterMitra, filterStartDate, filterEndDate, searchTerm])

  const fetchProfitLoss = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      if (filterMitra) params.append('mitra_id', filterMitra)
      params.append('group_by', 'month')

      const response = await adminApi.get(`/api/v1/accounting/report/profit-loss?${params}`)
      if (response.data.success) {
        setProfitLossData(response.data.data.report_data || [])
      }
    } catch (error) {
      console.error('Error fetching profit loss data:', error)
    }
  }

  const groupTransactionsByDate = (transactions: AccountingTransaction[]) => {
    const grouped: { [date: string]: AccountingTransaction[] } = {}

    transactions.forEach(transaction => {
      const date = transaction.date
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(transaction)
    })

    return Object.entries(grouped)
      .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
      .map(([date, transactions]) => ({
        date,
        transactions: transactions.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
        totalRevenue: transactions.filter(t => t.type === 'revenue').reduce((sum, t) => sum + t.amount, 0),
        totalExpense: transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        netIncome: 0
      })).map(day => ({
        ...day,
        netIncome: day.totalRevenue - day.totalExpense
      }))
  }

  // Category Management Functions
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('Nama kategori wajib diisi')
      return
    }

    setFormLoading(true)
    try {
      const response = await adminApi.post('/api/v1/accounting/categories', {
        name: newCategoryName.trim(),
        type: newCategoryType,
        description: newCategoryDescription.trim()
      })

      if (response.data.success) {
        await fetchCategories()
        setNewCategoryName('')
        setNewCategoryDescription('')
        setNewCategoryType('expense')
        alert('Kategori berhasil ditambahkan')
      } else {
        alert(response.data.message || 'Gagal menambahkan kategori')
      }
    } catch (error: any) {
      console.error('Error adding category:', error)
      alert(handleApiError(error, 'Gagal menambahkan kategori'))
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteCategory = async (category: AccountingCategory) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus kategori "${category.name}"?`)) {
      return
    }

    try {
      await adminApi.delete(`/api/v1/accounting/categories/${category.id}`)
      await fetchCategories()
      alert('Kategori berhasil dihapus')
    } catch (error: any) {
      console.error('Error deleting category:', error)
      alert(error.response?.data?.message || 'Gagal menghapus kategori')
    }
  }

  const handleAddTransaction = async () => {
    if (!formData.type || !formData.category_id || !formData.amount || !formData.description) {
      alert('Semua field wajib diisi (tipe, kategori, jumlah, deskripsi)')
      return
    }

    setFormLoading(true)
    try {
      const transactionData = {
        type: formData.type,
        category_id: parseInt(formData.category_id),
        amount: parseFloat(formData.amount),
        description: formData.description,
        reference_type: formData.reference_type || null,
        reference_id: formData.reference_id ? parseInt(formData.reference_id) : null,
        date: formData.date,
        attachment_url: formData.attachment_url || null,
        notes: formData.notes || null
      }

      const response = await adminApi.post('/api/v1/accounting/transactions', transactionData)

      if (response.data.success) {
        await fetchTransactions()
        await fetchSummary()

        // Reset form
        setFormData({
          type: '',
          category_id: '',
          amount: '',
          description: '',
          reference_type: '',
          reference_id: '',
          date: (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })(),
          attachment_url: '',
          notes: ''
        })

        setShowTransactionDialog(false)
        alert('Transaksi berhasil ditambahkan')
      } else {
        alert(response.data.message || 'Gagal menambahkan transaksi')
      }
    } catch (error: any) {
      console.error('Error adding transaction:', error)
      alert(error.response?.data?.message || 'Gagal menambahkan transaksi')
    } finally {
      setFormLoading(false)
    }
  }

  // Export Functions
  const exportToPDF = async () => {
    if (typeof window === 'undefined' || !(window as any).html2pdf) {
      alert('Library PDF belum dimuat. Silakan coba lagi dalam beberapa detik.')
      return
    }

    try {
      // Ambil semua data transaksi untuk PDF tanpa pagination
      const params = new URLSearchParams()
      if (filterType !== 'all') params.append('type', filterType)
      if (filterCategory) params.append('category_id', filterCategory)
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      params.append('limit', '1000')

      const response = await adminApi.get(`/api/v1/accounting/transactions?${params}`)
      if (response.data.success) {
        const allTransactions = response.data.data.transactions
        const groupedData = groupTransactionsByDate(allTransactions)

        // Create HTML content for PDF
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="text-align: center; margin-bottom: 20px;">LAPORAN KEUANGAN</h1>
            <p style="text-align: center; margin-bottom: 30px;">
              Periode: ${filterStartDate && filterEndDate
            ? `${formatDate(filterStartDate)} - ${formatDate(filterEndDate)}`
            : 'Semua Periode'
          }
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <thead>
                <tr style="border-bottom: 2px solid #333;">
                  <th style="text-align: left; padding: 10px;">RINGKASAN</th>
                  <th style="text-align: right; padding: 10px;">JUMLAH</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #ccc;">
                  <td style="padding: 8px;">Total Pemasukan</td>
                  <td style="padding: 8px; text-align: right; color: #16a34a; font-weight: bold;">
                    ${formatCurrency(summary?.revenue || 0)}
                  </td>
                </tr>
                <tr style="border-bottom: 1px solid #ccc;">
                  <td style="padding: 8px;">Total Pengeluaran</td>
                  <td style="padding: 8px; text-align: right; color: #dc2626; font-weight: bold;">
                    ${formatCurrency(summary?.expense || 0)}
                  </td>
                </tr>
                <tr style="border-bottom: 2px solid #333;">
                  <td style="padding: 8px; font-weight: bold;">LABA BERSIH</td>
                  <td style="padding: 8px; text-align: right; font-weight: bold; color: ${(summary?.profit || 0) >= 0 ? '#16a34a' : '#dc2626'};">
                    ${formatCurrency(summary?.profit || 0)}
                  </td>
                </tr>
              </tbody>
            </table>

            ${reportType === 'detailed' ? `
              <h2 style="margin-top: 30px; margin-bottom: 15px;">RINCIAN HARIAN</h2>
              ${groupedData.map(dayData => `
                <div style="margin-bottom: 20px; page-break-inside: avoid;">
                  <h3 style="background-color: #f3f4f6; padding: 8px; border: 1px solid #ccc;">
                    ${formatDate(dayData.date)}
                  </h3>
                  <table style="width: 100%; border-collapse: collapse; border: 1px solid #ccc;">
                    <thead>
                      <tr style="background-color: #f9fafb; border-bottom: 1px solid #ccc;">
                        <th style="padding: 6px; text-align: center; width: 40px;">No</th>
                        <th style="padding: 6px; text-align: left;">Deskripsi</th>
                        <th style="padding: 6px; text-align: left;">Kategori</th>
                        <th style="padding: 6px; text-align: right; width: 100px;">Debet</th>
                        <th style="padding: 6px; text-align: right; width: 100px;">Kredit</th>
                        <th style="padding: 6px; text-align: right; width: 100px;">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${dayData.transactions.map((transaction, index) => {
            const isRevenue = transaction.type === 'revenue'
            let dailyBalance = 0

            dayData.transactions.slice(0, index + 1).forEach(t => {
              if (t.type === 'revenue') {
                dailyBalance += t.amount
              } else {
                dailyBalance -= t.amount
              }
            })

            return `
                          <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 6px; text-align: center;">${index + 1}</td>
                            <td style="padding: 6px;">${transaction.description}</td>
                            <td style="padding: 6px; font-size: 12px;">${transaction.category?.name || '-'}</td>
                            <td style="padding: 6px; text-align: right; color: #dc2626;">
                              ${isRevenue ? '' : formatCurrency(transaction.amount)}
                            </td>
                            <td style="padding: 6px; text-align: right; color: #16a34a;">
                              ${isRevenue ? formatCurrency(transaction.amount) : ''}
                            </td>
                            <td style="padding: 6px; text-align: right; font-weight: bold; color: ${dailyBalance >= 0 ? '#16a34a' : '#dc2626'};">
                              ${formatCurrency(dailyBalance)}
                            </td>
                          </tr>
                        `
          }).join('')}
                    </tbody>
                    <tfoot>
                      <tr style="background-color: #f3f4f6; border-top: 2px solid #333;">
                        <td colspan="3" style="padding: 8px; font-weight: bold; text-align: right;">
                          Total ${formatDate(dayData.date)}
                        </td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: #dc2626;">
                          ${formatCurrency(dayData.totalExpense)}
                        </td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: #16a34a;">
                          ${formatCurrency(dayData.totalRevenue)}
                        </td>
                        <td style="padding: 8px; text-align: right; font-weight: bold; color: ${dayData.netIncome >= 0 ? '#16a34a' : '#dc2626'};">
                          ${formatCurrency(dayData.netIncome)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              `).join('')}
            ` : ''}
          </div>
        `

        // Create blob and download
        const blob = new Blob([htmlContent], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); const ts = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
        a.download = `laporan-${reportType === 'detailed' ? 'rinci-harian' : 'keuangan'}-${ts}.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        alert('Laporan berhasil diunduh dalam format HTML. Anda dapat membukanya dan mencetak ke PDF dari browser.')
      }
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Gagal membuat laporan. Silakan coba lagi.')
    }
  }

  const exportToExcel = async () => {
    try {
      const params = new URLSearchParams()
      if (filterType !== 'all') params.append('type', filterType)
      if (filterCategory) params.append('category_id', filterCategory)
      if (filterMitra) params.append('mitra_id', filterMitra)
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)

      const response = await adminApi.get(`/api/v1/accounting/export/excel?${params}`, {
        responseType: 'blob'
      })

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); const ts = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
      a.download = `Laporan_Keuangan_${ts}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Gagal export ke Excel. Silakan coba lagi.')
    }
  }

  const exportToHTML = async () => {
    try {
      // Ambil data untuk export
      const params = new URLSearchParams()
      if (filterType !== 'all') params.append('type', filterType)
      if (filterCategory) params.append('category_id', filterCategory)
      if (filterMitra) params.append('mitra_id', filterMitra)
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      params.append('limit', '1000')

      const selectedMitraName = filterMitra ? mitraList.find(m => m.id === filterMitra)?.name : null

      const response = await adminApi.get(`/api/v1/accounting/transactions?${params}`)
      if (response.data.success) {
        const allTransactions = response.data.data.transactions
        const groupedData = groupTransactionsByDate(allTransactions)

        // Create complete HTML report
        const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laporan Keuangan ${selectedMitraName ? `— ${selectedMitraName}` : ''}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
        h1 { text-align: center; color: #333; margin-bottom: 8px; }
        .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 20px; }
        h2 { color: #333; margin-top: 30px; margin-bottom: 15px; }
        h3 { background-color: #f3f4f6; padding: 8px; margin: 15px 0 10px 0; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
        th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .revenue { color: #16a34a; font-weight: bold; }
        .expense { color: #dc2626; font-weight: bold; }
        .summary { font-weight: bold; margin-bottom: 20px; }
        .summary th { background-color: #e5e7eb; }
        @media print {
            body { margin: 10px; }
            .no-print { display: none; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>LAPORAN KEUANGAN</h1>
    ${selectedMitraName ? `<div class="subtitle"><strong>Mitra:</strong> ${selectedMitraName}</div>` : ''}
    <p style="text-align: center;">
        Periode: ${filterStartDate && filterEndDate
            ? `${formatDate(filterStartDate)} - ${formatDate(filterEndDate)}`
            : 'Semua Periode'
          }
        <br>
        Dicetak: ${new Date().toLocaleString('id-ID')}
    </p>

    <h2>Ringkasan</h2>
    <table class="summary">
        <tr>
            <th>Item</th>
            <th class="text-right">Jumlah</th>
        </tr>
        <tr>
            <td>Total Pemasukan</td>
            <td class="text-right revenue">${formatCurrency(summary?.revenue || 0)}</td>
        </tr>
        <tr>
            <td>Total Pengeluaran</td>
            <td class="text-right expense">${formatCurrency(summary?.expense || 0)}</td>
        </tr>
        <tr>
            <td>Laba Bersih</td>
            <td class="text-right ${(summary?.profit || 0) >= 0 ? 'revenue' : 'expense'}">${formatCurrency(summary?.profit || 0)}</td>
        </tr>
    </table>

    ${reportType === 'detailed' ? `
      <h2>Rincian Harian</h2>
      ${groupedData.map(dayData => `
        <h3>${formatDate(dayData.date)}</h3>
        <table>
          <thead>
            <tr>
              <th class="text-center" style="width: 40px;">No</th>
              <th>Deskripsi</th>
              <th>Kategori</th>
              <th class="text-right" style="width: 100px;">Debet</th>
              <th class="text-right" style="width: 100px;">Kredit</th>
              <th class="text-right" style="width: 100px;">Saldo</th>
            </tr>
          </thead>
          <tbody>
            ${dayData.transactions.map((transaction, index) => {
            const isRevenue = transaction.type === 'revenue'
            let dailyBalance = 0

            dayData.transactions.slice(0, index + 1).forEach(t => {
              if (t.type === 'revenue') {
                dailyBalance += t.amount
              } else {
                dailyBalance -= t.amount
              }
            })

            return `
                <tr>
                  <td class="text-center">${index + 1}</td>
                  <td>${transaction.description}</td>
                  <td>${transaction.category?.name || '-'}</td>
                  <td class="text-right expense">${isRevenue ? '' : formatCurrency(transaction.amount)}</td>
                  <td class="text-right revenue">${isRevenue ? formatCurrency(transaction.amount) : ''}</td>
                  <td class="text-right ${dailyBalance >= 0 ? 'revenue' : 'expense'}">${formatCurrency(dailyBalance)}</td>
                </tr>
              `
          }).join('')}
          </tbody>
          <tfoot>
            <tr style="background-color: #f3f4f6; font-weight: bold;">
              <td colspan="3" class="text-right">Total ${formatDate(dayData.date)}</td>
              <td class="text-right expense">${formatCurrency(dayData.totalExpense)}</td>
              <td class="text-right revenue">${formatCurrency(dayData.totalRevenue)}</td>
              <td class="text-right ${dayData.netIncome >= 0 ? 'revenue' : 'expense'}">${formatCurrency(dayData.netIncome)}</td>
            </tr>
          </tfoot>
        </table>
      `).join('')}
    ` : ''}

    <div class="no-print">
        <p style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
            Laporan ini dihasilkan pada ${new Date().toLocaleString('id-ID')}<br>
            Gunakan Ctrl+P untuk mencetak atau simpan sebagai PDF
        </p>
    </div>
</body>
</html>
        `

        // Create blob and download
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); const ts = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
        a.download = `laporan-keuangan-${ts}.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Error exporting to HTML:', error)
      alert('Gagal export ke HTML. Silakan coba lagi.')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Akunting</h1>
          <p className="text-gray-600">Kelola pemasukan dan pengeluaran bisnis Anda</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => setShowCategoryDialog(true)}
          >
            <Tag className="h-4 w-4 mr-2" />
            Kelola Kategori
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setDeletedRecurringIds([])
              setShowAutoExpenseDialog(true)
            }}
          >
            <Settings className="h-4 w-4 mr-2" />
            Pengeluaran Otomatis
          </Button>
          <Button onClick={() => setShowTransactionDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Tambah Transaksi
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 inline mr-1.5" />
          {filterStartDate && filterEndDate
            ? `Periode: ${formatDate(filterStartDate)} s/d ${formatDate(filterEndDate)}`
            : 'Bulan Berjalan'}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summary && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pemasukan</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600 whitespace-nowrap overflow-hidden text-ellipsis">{formatCurrency(summary.revenue)}</div>
                <p className="text-xs text-muted-foreground">{summary.revenue_count} transaksi</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pengeluaran</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 whitespace-nowrap overflow-hidden text-ellipsis">{formatCurrency(summary.expense)}</div>
                <p className="text-xs text-muted-foreground">{summary.expense_count} transaksi</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Laba Bersih</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold whitespace-nowrap overflow-hidden text-ellipsis ${summary.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(summary.profit)}
                </div>
                <p className="text-xs text-muted-foreground">{summary.total_transactions} total transaksi</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="transactions">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="transactions">Transaksi</TabsTrigger>
          <TabsTrigger value="reports">Laporan</TabsTrigger>
          <TabsTrigger value="settlement">Rekonsiliasi Mitra</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 items-end">
                <div>
                  <Label>Search</Label>
                  <Input
                    placeholder="Cari transaksi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Tipe</Label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as 'all' | 'revenue' | 'expense')}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                  >
                    <option value="all">Semua</option>
                    <option value="revenue">Pemasukan</option>
                    <option value="expense">Pengeluaran</option>
                  </select>
                </div>

                <div>
                  <Label>Kategori</Label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                  >
                    <option value="">Semua</option>
                    {categories?.map((category) => (
                      <option key={category.id} value={category.id.toString()}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Mitra</Label>
                  <select
                    value={filterMitra}
                    onChange={(e) => setFilterMitra(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                  >
                    <option value="">Semua Mitra</option>
                    {mitraList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <Label>Bulan</Label>
                  <div className="flex gap-1.5">
                    <select
                      value={quickMonth}
                      onChange={(e) => {
                        const m = parseInt(e.target.value, 10)
                        setQuickMonth(m)
                        applyMonthFilter(m, quickYear)
                      }}
                      className="rounded-md border border-input bg-background px-2 py-2 text-sm w-full"
                    >
                      {monthsInYear.map((name, idx) => (
                        <option key={name} value={idx}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={quickYear}
                      onChange={(e) => {
                        const y = parseInt(e.target.value, 10)
                        setQuickYear(y)
                        applyMonthFilter(quickMonth, y)
                      }}
                      className="rounded-md border border-input bg-background px-1 py-2 text-sm w-24"
                    >
                      {yearsList.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Tanggal Mulai</Label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Tanggal Selesai</Label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <Button variant="outline" size="sm" onClick={loadAllData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={exportToExcel}>
                  <Download className="h-4 w-4 mr-2" />
                  Unduh Excel (.xlsx)
                </Button>
                <Button variant="outline" size="sm" onClick={exportToHTML}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Cetak PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Transaksi</CardTitle>
              <CardDescription>
                Total {filteredTransactions.length} transaksi
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={filteredTransactions}
                columns={transactionColumns}
                loading={loading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Laporan Keuangan</CardTitle>
              <CardDescription>
                Generate laporan keuangan dalam berbagai format
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Report Type Selection */}
                <div>
                  <Label htmlFor="reportType">Jenis Laporan</Label>
                  <select
                    id="reportType"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as 'summary' | 'detailed')}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full"
                  >
                    <option value="summary">Ringkasan</option>
                    <option value="detailed">Rincian Harian</option>
                  </select>
                  <p className="text-sm text-gray-600 mt-1">
                    {reportType === 'detailed'
                      ? 'Laporan detail per hari dengan saldo berjalan'
                      : 'Laporan ringkasan keseluruhan'
                    }
                  </p>
                </div>

                {/* Summary Stats */}
                <div>
                  <Label>Ringkasan Data</Label>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Transaksi:</span>
                      <span className="text-sm font-medium">{filteredTransactions.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Pemasukan:</span>
                      <span className="text-sm font-medium text-green-600">
                        {formatCurrency(summary?.revenue || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Pengeluaran:</span>
                      <span className="text-sm font-medium text-red-600">
                        {formatCurrency(summary?.expense || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Laba Bersih:</span>
                      <span className={`text-sm font-medium ${(summary?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(summary?.profit || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <Button
                  onClick={exportToHTML}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export HTML
                </Button>
                <Button
                  onClick={exportToExcel}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                <Button
                  onClick={exportToPDF}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>

              {/* Profit Loss Data */}
              {profitLossData.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Laporan Laba Rugi Periode</h3>
                  <div className="space-y-2">
                    {profitLossData.map((data, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                          <div>
                            <Label className="text-sm text-gray-600">Periode</Label>
                            <div className="font-medium">
                              {formatDate(data.period)}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Pemasukan</Label>
                            <div className="font-medium text-green-600">
                              {formatCurrency(data.revenue)}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Pengeluaran</Label>
                            <div className="font-medium text-red-600">
                              {formatCurrency(data.expense)}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Laba</Label>
                            <div className={`font-medium ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(data.profit)}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Margin</Label>
                            <div className="font-medium">
                              {data.profit_margin}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settlement" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Laporan Rekonsiliasi & Arus Transaksi Mitra</CardTitle>
                <CardDescription>
                  Rekapitulasi pembayaran pelanggan per-mitra: uang yang masuk ke Rekening Mitra vs Rekening Pusat (Hutang Pusat ke Mitra).
                </CardDescription>
              </div>
              <Button onClick={fetchMitraSettlement} disabled={loadingSettlement} size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingSettlement ? 'animate-spin' : ''}`} />
                Hitung Rekonsiliasi
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingSettlement ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !mitraSettlementData || mitraSettlementData.mitras?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Belum ada data transaksi untuk periode yang dipilih.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Mitra Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mitraSettlementData.mitras.map((m: any) => (
                      <Card key={m.mitra_id || 'pusat'} className="border-2 border-slate-200 dark:border-slate-800">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-lg font-bold text-foreground">{m.mitra_name}</CardTitle>
                            <Badge variant="outline" className="text-xs">{m.transactions?.length || 0} Trx</Badge>
                          </div>
                          <CardDescription className="text-xs font-mono">Total Pendapatan: {formatCurrency(m.total_revenue)}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs">
                          <div className="flex justify-between p-2 rounded bg-muted/40">
                            <span className="text-muted-foreground">Masuk Rekening Mitra:</span>
                            <span className="font-semibold text-green-600">{formatCurrency(m.received_in_mitra_account)}</span>
                          </div>
                          <div className="flex justify-between p-2 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
                            <span className="font-medium text-blue-800 dark:text-blue-300">Masuk Rekening Pusat (Hutang Pusat):</span>
                            <span className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(m.received_in_company_account)}</span>
                          </div>
                          {m.received_in_other_mitra > 0 && (
                            <div className="flex justify-between p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                              <span>Masuk Mitra Lain:</span>
                              <span className="font-semibold">{formatCurrency(m.received_in_other_mitra)}</span>
                            </div>
                          )}
                          {m.received_in_cash > 0 && (
                            <div className="flex justify-between p-2 rounded bg-muted/40">
                              <span className="text-muted-foreground">Kas Tunai:</span>
                              <span className="font-semibold">{formatCurrency(m.received_in_cash)}</span>
                            </div>
                          )}
                          <div className="pt-2 border-t flex justify-between items-center text-sm font-bold">
                            <span>Wajib Disetor Pusat:</span>
                            <span className="text-blue-600">{formatCurrency(m.received_in_company_account)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Transaction breakdown table */}
                  <div className="pt-4 border-t">
                    <h4 className="font-semibold text-sm mb-3">Rincian Transaksi Pembayaran Mitra</h4>
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="p-2.5 text-left font-medium">Invoice</th>
                            <th className="p-2.5 text-left font-medium">Pelanggan</th>
                            <th className="p-2.5 text-left font-medium">Mitra</th>
                            <th className="p-2.5 text-left font-medium">Tanggal</th>
                            <th className="p-2.5 text-left font-medium">Metode</th>
                            <th className="p-2.5 text-left font-medium">Tujuan Uang Masuk</th>
                            <th className="p-2.5 text-right font-medium">Jumlah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mitraSettlementData.mitras.flatMap((m: any) =>
                            (m.transactions || []).map((tx: any) => (
                              <tr key={tx.payment_id} className="border-b last:border-b-0 hover:bg-muted/30">
                                <td className="p-2.5 font-mono">{tx.invoice_number}</td>
                                <td className="p-2.5 font-medium">{tx.customer_name}</td>
                                <td className="p-2.5 text-muted-foreground">{m.mitra_name}</td>
                                <td className="p-2.5">{tx.payment_date ? new Date(tx.payment_date).toLocaleDateString('id-ID') : '-'}</td>
                                <td className="p-2.5"><Badge variant="outline" className="text-[10px]">{tx.payment_method}</Badge></td>
                                <td className="p-2.5">
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${tx.classification === 'company_account' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>
                                    {tx.destination_name}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right font-semibold">{formatCurrency(tx.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transaction Dialog */}
      <Dialog open={showTransactionDialog} onOpenChange={setShowTransactionDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Transaksi</DialogTitle>
            <DialogDescription>
              Tambah transaksi pemasukan atau pengeluaran baru
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="transactionType">Tipe Transaksi</Label>
                <select
                  id="transactionType"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'revenue' | 'expense' })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Pilih Tipe</option>
                  <option value="revenue">Pemasukan</option>
                  <option value="expense">Pengeluaran</option>
                </select>
              </div>
              <div>
                <Label htmlFor="transactionCategory">Kategori</Label>
                <select
                  id="transactionCategory"
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Pilih Kategori</option>
                  {categories
                    .filter(cat => !formData.type || cat.type === formData.type)
                    .map((category) => (
                      <option key={category.id} value={category.id.toString()}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="transactionAmount">Jumlah (Rp)</Label>
                <Input
                  id="transactionAmount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="transactionDate">Tanggal</Label>
                <div className="relative">
                  <Input
                    id="transactionDate"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="mt-1 pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                  />
                  <Calendar
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-300 pointer-events-none hover:cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="transactionDescription">Deskripsi</Label>
              <Input
                id="transactionDescription"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Contoh: Pembayaran tagihan internet"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="referenceType">Reference Type (Opsional)</Label>
                <Input
                  id="referenceType"
                  value={formData.reference_type}
                  onChange={(e) => setFormData({ ...formData, reference_type: e.target.value })}
                  placeholder="invoice, manual, etc"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="referenceId">Reference ID (Opsional)</Label>
                <Input
                  id="referenceId"
                  value={formData.reference_id}
                  onChange={(e) => setFormData({ ...formData, reference_id: e.target.value })}
                  placeholder="123"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="transactionNotes">Catatan (Opsional)</Label>
              <textarea
                id="transactionNotes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Catatan tambahan..."
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransactionDialog(false)}>
              Batal
            </Button>
            <Button
              onClick={handleAddTransaction}
              disabled={formLoading || !formData.type || !formData.category_id || !formData.amount || !formData.description}
            >
              {formLoading ? 'Menyimpan...' : 'Simpan Transaksi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manajemen Kategori</DialogTitle>
            <DialogDescription>
              Tambah dan kelola kategori pemasukan serta pengeluaran
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Add New Category Form */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Tambah Kategori Baru</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="categoryName">Nama Kategori</Label>
                  <Input
                    id="categoryName"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Contoh: Makanan, Transportasi"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="categoryType">Tipe Kategori</Label>
                  <select
                    id="categoryType"
                    value={newCategoryType}
                    onChange={(e) => setNewCategoryType(e.target.value as 'revenue' | 'expense')}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="expense">Pengeluaran</option>
                    <option value="revenue">Pemasukan</option>
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="categoryDescription">Deskripsi (Opsional)</Label>
                <Input
                  id="categoryDescription"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  placeholder="Deskripsi kategori"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={handleAddCategory}
                disabled={formLoading || !newCategoryName.trim()}
                className="w-full"
              >
                {formLoading ? 'Menambahkan...' : 'Tambah Kategori'}
              </Button>
            </div>

            {/* Category List */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Daftar Kategori</h3>
              {categories.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Belum ada kategori</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: category.color || '#ef4444' }}
                        />
                        <div>
                          <div className="font-medium">{category.name}</div>
                          <div className="text-sm text-gray-500">
                            {category.type === 'revenue' ? 'Pemasukan' : 'Pengeluaran'}
                            {category.description && ` • ${category.description}`}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteCategory(category)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Expense Dialog */}
      <Dialog open={showAutoExpenseDialog} onOpenChange={setShowAutoExpenseDialog}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pengeluaran Otomatis</DialogTitle>
            <DialogDescription>
              Kelola pengeluaran otomatis untuk fee teknisi, marketing, dan pengeluaran berjadwal
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="technician" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="technician">Fee Teknisi</TabsTrigger>
              <TabsTrigger value="recurring">Pengeluaran Berjadwal</TabsTrigger>
            </TabsList>

            <TabsContent value="technician" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Fee Instalasi Teknisi
                  </CardTitle>
                  <CardDescription>
                    Pengeluaran otomatis saat teknisi menyelesaikan instalasi pelanggan baru
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="technicianFeeEnabled">Aktifkan Fee Teknisi</Label>
                    <input
                      id="technicianFeeEnabled"
                      type="checkbox"
                      checked={autoExpenseSettings.technicianFeeEnabled}
                      onChange={(e) => setAutoExpenseSettings(prev => ({
                        ...prev,
                        technicianFeeEnabled: e.target.checked
                      }))}
                      className="h-4 w-4"
                    />
                  </div>
                  <div>
                    <Label htmlFor="technicianFee">Nominal Fee (Rp)</Label>
                    <Input
                      id="technicianFee"
                      type="number"
                      value={autoExpenseSettings.technicianFee}
                      onChange={(e) => setAutoExpenseSettings(prev => ({
                        ...prev,
                        technicianFee: parseInt(e.target.value) || 0
                      }))}
                      placeholder="50000"
                      disabled={!autoExpenseSettings.technicianFeeEnabled}
                    />
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <p className="text-sm text-blue-800">
                      💡 Fee akan otomatis dicatat sebagai pengeluaran saat status instalasi pelanggan berubah menjadi &quot;selesai&quot;
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recurring" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Pengeluaran Berjadwal
                      </CardTitle>
                      <CardDescription>
                        Pengeluaran rutin yang terjadi secara otomatis (gaji, sewa, dll)
                      </CardDescription>
                    </div>
                    <Button
                      onClick={() => {
                        const newExpense = {
                          id: `new_${Date.now()}`,
                          name: '',
                          amount: 0,
                          category_id: null,
                          frequency: 'monthly' as const,
                          nextDate: (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })(),
                          enabled: true
                        }
                        setAutoExpenseSettings(prev => ({
                          ...prev,
                          recurringExpenses: [...prev.recurringExpenses, newExpense]
                        }))
                      }}
                      size="sm"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Tambah
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {autoExpenseSettings.recurringExpenses.length === 0 ? (
                    <div className="text-center py-8">
                      <Calendar className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-500">Belum ada pengeluaran berjadwal</p>
                      <p className="text-sm text-gray-400">Tambah pengeluaran rutin seperti gaji, sewa, dll</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {autoExpenseSettings.recurringExpenses.map((expense) => (
                        <div key={expense.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={expense.enabled}
                                onChange={(e) => {
                                  setAutoExpenseSettings(prev => ({
                                    ...prev,
                                    recurringExpenses: prev.recurringExpenses.map(exp =>
                                      exp.id === expense.id ? { ...exp, enabled: e.target.checked } : exp
                                    )
                                  }))
                                }}
                                className="h-4 w-4"
                              />
                              <Input
                                value={expense.name}
                                onChange={(e) => {
                                  setAutoExpenseSettings(prev => ({
                                    ...prev,
                                    recurringExpenses: prev.recurringExpenses.map(exp =>
                                      exp.id === expense.id ? { ...exp, name: e.target.value } : exp
                                    )
                                  }))
                                }}
                                placeholder="Nama pengeluaran"
                                className="font-medium h-8"
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAutoExpenseSettings(prev => ({
                                  ...prev,
                                  recurringExpenses: prev.recurringExpenses.filter(exp => exp.id !== expense.id)
                                }))
                                if (!expense.id.startsWith('new_')) {
                                  setDeletedRecurringIds(prev => [...prev, expense.id])
                                }
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <Label className="text-xs text-gray-500">Jumlah</Label>
                              <Input
                                type="number"
                                value={expense.amount || ''}
                                onChange={(e) => {
                                  setAutoExpenseSettings(prev => ({
                                    ...prev,
                                    recurringExpenses: prev.recurringExpenses.map(exp =>
                                      exp.id === expense.id ? { ...exp, amount: Number(e.target.value) } : exp
                                    )
                                  }))
                                }}
                                className="h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Frekuensi</Label>
                              <select
                                value={expense.frequency}
                                onChange={(e) => {
                                  setAutoExpenseSettings(prev => ({
                                    ...prev,
                                    recurringExpenses: prev.recurringExpenses.map(exp =>
                                      exp.id === expense.id ? { ...exp, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' } : exp
                                    )
                                  }))
                                }}
                                className="flex h-8 w-full rounded-md border border-input bg-white dark:bg-gray-800 px-3 py-1 text-sm shadow-sm transition-colors text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="daily">Harian</option>
                                <option value="weekly">Mingguan</option>
                                <option value="monthly">Bulanan</option>
                              </select>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Tanggal Berikutnya</Label>
                              <Input
                                type="date"
                                value={expense.nextDate ? expense.nextDate.split('T')[0] : ''}
                                onChange={(e) => {
                                  setAutoExpenseSettings(prev => ({
                                    ...prev,
                                    recurringExpenses: prev.recurringExpenses.map(exp =>
                                      exp.id === expense.id ? { ...exp, nextDate: e.target.value } : exp
                                    )
                                  }))
                                }}
                                className="h-8"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Kategori</Label>
                              <select
                                value={expense.category_id ?? ''}
                                onChange={(e) => {
                                  setAutoExpenseSettings(prev => ({
                                    ...prev,
                                    recurringExpenses: prev.recurringExpenses.map(exp =>
                                      exp.id === expense.id ? { ...exp, category_id: e.target.value ? Number(e.target.value) : null } : exp
                                    )
                                  }))
                                }}
                                className="flex h-8 w-full rounded-md border border-input bg-white dark:bg-gray-800 px-3 py-1 text-sm shadow-sm transition-colors text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <option value="">Belum dipilih</option>
                                {categories.filter(c => c.type === 'expense').map(cat => (
                                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutoExpenseDialog(false)}>
              Batal
            </Button>
            <Button onClick={async () => {
              // Save settings to backend
              try {
                // Update technician fee settings
                await adminApi.put('/api/v1/auto-expenses/settings/technician_fee_enabled', {
                  value: autoExpenseSettings.technicianFeeEnabled.toString(),
                  isActive: true
                })
                await adminApi.put('/api/v1/auto-expenses/settings/technician_fee_amount', {
                  value: autoExpenseSettings.technicianFee.toString(),
                  isActive: true
                })

                // Delete removed recurring expenses
                for (const id of deletedRecurringIds) {
                  await adminApi.delete(`/api/v1/auto-expenses/recurring/${id}`)
                }
                setDeletedRecurringIds([])

                // Save recurring expenses
                for (const expense of autoExpenseSettings.recurringExpenses) {
                  const payload = {
                    name: expense.name || 'Pengeluaran Berjadwal',
                    amount: expense.amount,
                    categoryId: expense.category_id,
                    frequency: expense.frequency,
                    nextDate: expense.nextDate,
                    isActive: expense.enabled
                  }
                  if (expense.id.startsWith('new_')) {
                    const res = await adminApi.post('/api/v1/auto-expenses/recurring', payload)
                    if (res.data?.data?.id) {
                      expense.id = String(res.data.data.id)
                    }
                  } else {
                    await adminApi.put(`/api/v1/auto-expenses/recurring/${expense.id}`, payload)
                  }
                }

                alert('Pengaturan berhasil disimpan!')
                setShowAutoExpenseDialog(false)
              } catch (error) {
                console.error('Error saving auto expense settings:', error)
                alert('Gagal menyimpan pengaturan. Silakan coba lagi.')
              }
            }}>
              Simpan Pengaturan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}