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
  Megaphone,
  Trash
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
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
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
    marketingFee: 0,
    technicianFeeEnabled: false,
    marketingFeeEnabled: false,
    recurringExpenses: [] as Array<{
      id: string
      name: string
      amount: number
      category: string
      frequency: 'daily' | 'weekly' | 'monthly'
      nextDate: string
      enabled: boolean
    }>
  })

  const [formData, setFormData] = useState({
    type: '' as 'revenue' | 'expense' | '',
    category_id: '',
    amount: '',
    description: '',
    reference_type: '',
    reference_id: '',
    date: new Date().toISOString().split('T')[0],
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
      month: 'long',
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
  const setQuickDateRange = (range: 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'last7Days' | 'last30Days' | 'last3Months' | 'clear') => {
    if (range === 'clear') {
      clearDateFilters()
      return
    }
    const today = new Date()
    const startDate = new Date()
    const endDate = new Date()

    switch (range) {
      case 'today':
        startDate.setDate(today.getDate())
        endDate.setDate(today.getDate())
        break
      case 'thisWeek':
        startDate.setDate(today.getDate() - today.getDay())
        endDate.setDate(today.getDate() - today.getDay() + 6)
        break
      case 'thisMonth':
        startDate.setDate(1)
        endDate.setMonth(today.getMonth() + 1, 0)
        break
      case 'thisYear':
        startDate.setMonth(0, 1)
        endDate.setMonth(11, 31)
        break
      case 'last7Days':
        startDate.setDate(today.getDate() - 7)
        break
      case 'last30Days':
        startDate.setDate(today.getDate() - 30)
        break
      case 'last3Months':
        startDate.setMonth(today.getMonth() - 3)
        break
    }

    setFilterStartDate(startDate.toISOString().split('T')[0])
    setFilterEndDate(endDate.toISOString().split('T')[0])
  }

  const clearDateFilters = () => {
    setFilterStartDate('')
    setFilterEndDate('')
  }

  const filteredTransactions = transactions.filter(transaction => {
    const matchesType = filterType === 'all' || transaction.type === filterType
    const matchesCategory = !filterCategory || transaction.category?.toString() === filterCategory
    const matchesSearch = !searchTerm ||
      transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.category?.name.toLowerCase().includes(searchTerm.toLowerCase())
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

  const fetchCategories = async () => {
    try {
      const response = await adminApi.get('/api/v1/accounting/categories')
      if (response.data.success && response.data.data?.categories) {
        setCategories(response.data.data.categories)
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
      fetchAutoExpenseSettings()
    ])
    setLoading(false)
  }

  const fetchAutoExpenseSettings = async () => {
    try {
      const response = await adminApi.get('/api/v1/auto-expenses/settings')
      if (response.data.success) {
        const settings = response.data.data

        setAutoExpenseSettings(prev => ({
          ...prev,
          technicianFeeEnabled: settings.technician_fee_enabled?.isActive && settings.technician_fee_enabled?.value === 'true',
          technicianFee: parseInt(settings.technician_fee_amount?.value) || 0,
          marketingFeeEnabled: settings.marketing_fee_enabled?.isActive && settings.marketing_fee_enabled?.value === 'true',
          marketingFee: parseInt(settings.marketing_fee_amount?.value) || 0
        }))
      }
    } catch (error) {
      console.error('Error fetching auto expense settings:', error)
    }
  }

  useEffect(() => {
    loadAllData()
  }, [filterType, filterCategory, filterStartDate, filterEndDate, searchTerm])

  const fetchProfitLoss = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      params.append('group_by', 'month')

      const response = await adminApi.get(`/api/v1/accounting/report/profit-loss?${params}`)
      if (response.data.success) {
        setProfitLossData(response.data.data.report_data)
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
          date: new Date().toISOString().split('T')[0],
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
        a.download = `laporan-${reportType === 'detailed' ? 'rinci-harian' : 'keuangan'}-${new Date().toISOString().split('T')[0]}.html`
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
      // Ambil data untuk export
      const params = new URLSearchParams()
      if (filterType !== 'all') params.append('type', filterType)
      if (filterCategory) params.append('category_id', filterCategory)
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      params.append('limit', '1000')

      const response = await adminApi.get(`/api/v1/accounting/transactions?${params}`)
      if (response.data.success) {
        const allTransactions = response.data.data.transactions

        // Create CSV content
        let csvContent = "No,Tanggal,Deskripsi,Kategori,Tipe,Jumlah\n"

        allTransactions.forEach((transaction: AccountingTransaction, index: number) => {
          csvContent += `${index + 1},${transaction.date},"${transaction.description}","${transaction.category?.name || '-'}","${transaction.type === 'revenue' ? 'Pemasukan' : 'Pengeluaran'}",${transaction.amount}\n`
        })

        // Add summary row
        csvContent += "\nRINGKASAN\n"
        csvContent += `Total Pemasukan,${summary?.revenue || 0}\n`
        csvContent += `Total Pengeluaran,${summary?.expense || 0}\n`
        csvContent += `Laba Bersih,${summary?.profit || 0}\n`

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `laporan-keuangan-${new Date().toISOString().split('T')[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
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
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      params.append('limit', '1000')

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
    <title>Laporan Keuangan</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
        h1 { text-align: center; color: #333; margin-bottom: 20px; }
        h2 { color: #333; margin-top: 30px; margin-bottom: 15px; }
        h3 { background-color: #f3f4f6; padding: 8px; margin: 15px 0 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 8px; text-align: left; border: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: bold; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .revenue { color: #16a34a; }
        .expense { color: #dc2626; }
        .summary { font-weight: bold; }
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
        a.download = `laporan-keuangan-${new Date().toISOString().split('T')[0]}.html`
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
            onClick={() => setShowAutoExpenseDialog(true)}
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
        <TabsList>
          <TabsTrigger value="transactions">Transaksi</TabsTrigger>
          <TabsTrigger value="reports">Laporan</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
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
                  <Label>Quick Filter Tanggal</Label>
                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value
                      if (value) {
                        setQuickDateRange(value as any)
                        e.target.value = '' // Reset select after choosing
                      }
                    }}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full mt-1"
                  >
                    <option value="">Pilih periode...</option>
                    <option value="today">Hari Ini</option>
                    <option value="last7Days">7 Hari Terakhir</option>
                    <option value="thisWeek">Minggu Ini</option>
                    <option value="last30Days">30 Hari Terakhir</option>
                    <option value="thisMonth">Bulan Ini</option>
                    <option value="last3Months">3 Bulan Terakhir</option>
                    <option value="thisYear">Tahun Ini</option>
                    <option value="clear">Hapus Filter</option>
                  </select>
                </div>

                <div>
                  <Label>Tanggal Mulai</Label>
                  <div className="relative">
                    <Input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="mt-1 pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                    />
                    <Calendar
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-300 pointer-events-none hover:cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <Label>Tanggal Selesai</Label>
                  <div className="relative">
                    <Input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="mt-1 pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                    />
                    <Calendar
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-300 pointer-events-none hover:cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Button onClick={loadAllData}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="technician">Fee Teknisi</TabsTrigger>
              <TabsTrigger value="marketing">Fee Marketing</TabsTrigger>
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

            <TabsContent value="marketing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5" />
                    Fee Marketing/Referral
                  </CardTitle>
                  <CardDescription>
                    Pengeluaran otomatis untuk marketing atau referral pelanggan baru
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="marketingFeeEnabled">Aktifkan Fee Marketing</Label>
                    <input
                      id="marketingFeeEnabled"
                      type="checkbox"
                      checked={autoExpenseSettings.marketingFeeEnabled}
                      onChange={(e) => setAutoExpenseSettings(prev => ({
                        ...prev,
                        marketingFeeEnabled: e.target.checked
                      }))}
                      className="h-4 w-4"
                    />
                  </div>
                  <div>
                    <Label htmlFor="marketingFee">Nominal Fee (Rp)</Label>
                    <Input
                      id="marketingFee"
                      type="number"
                      value={autoExpenseSettings.marketingFee}
                      onChange={(e) => setAutoExpenseSettings(prev => ({
                        ...prev,
                        marketingFee: parseInt(e.target.value) || 0
                      }))}
                      placeholder="100000"
                      disabled={!autoExpenseSettings.marketingFeeEnabled}
                    />
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <p className="text-sm text-green-800">
                      💡 Fee akan otomatis dicatat saat pelanggan baru mendaftar dengan kode referral
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
                          id: Date.now().toString(),
                          name: '',
                          amount: 0,
                          category: '',
                          frequency: 'monthly' as const,
                          nextDate: new Date().toISOString().split('T')[0],
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
                              <span className="font-medium">{expense.name || 'Tanpa Nama'}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setAutoExpenseSettings(prev => ({
                                  ...prev,
                                  recurringExpenses: prev.recurringExpenses.filter(exp => exp.id !== expense.id)
                                }))
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <Label className="text-xs text-gray-500">Jumlah</Label>
                              <p className="font-medium">Rp {expense.amount.toLocaleString()}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Frekuensi</Label>
                              <p className="font-medium capitalize">
                                {expense.frequency === 'daily' ? 'Harian' :
                                  expense.frequency === 'weekly' ? 'Mingguan' : 'Bulanan'}
                              </p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Tanggal Berikutnya</Label>
                              <p className="font-medium">{new Date(expense.nextDate).toLocaleDateString('id-ID')}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">Kategori</Label>
                              <p className="font-medium">{expense.category || 'Belum dipilih'}</p>
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

                // Update marketing fee settings
                await adminApi.put('/api/v1/auto-expenses/settings/marketing_fee_enabled', {
                  value: autoExpenseSettings.marketingFeeEnabled.toString(),
                  isActive: true
                })
                await adminApi.put('/api/v1/auto-expenses/settings/marketing_fee_amount', {
                  value: autoExpenseSettings.marketingFee.toString(),
                  isActive: true
                })

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