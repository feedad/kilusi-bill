'use client'

import React, { useState, useEffect } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { Button, Input, Card, CardContent } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'
import { adminApi, endpoints } from '@/lib/api-clients'
import { toast } from 'react-hot-toast'

interface RapelCustomer {
  id: string
  name: string
  phone: string
}

interface RapelService {
  service_number: string
  package_name: string
  package_price: number
}

interface RapelCalculation {
  customer: RapelCustomer
  service: RapelService
  months: number
  original_total: number
  discount: { type: string; value: number; amount: number; display: string }
  final_total: number
  next_overdue: string
}

interface RapelModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const MONTH_OPTIONS = [
  { value: 1, label: '1 bln', discount: 'Tidak ada diskon' },
  { value: 2, label: '2 bln', discount: 'Tidak ada diskon' },
  { value: 3, label: '3 bln', discount: 'Diskon 5%' },
  { value: 6, label: '6 bln', discount: 'Diskon 10%' },
  { value: 12, label: '12 bln', discount: 'Diskon 15%' },
]

export default function RapelModal({ isOpen, onClose, onSuccess }: RapelModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [calculating, setCalculating] = useState(false)
  const [calculation, setCalculation] = useState<RapelCalculation | null>(null)
  const [selectedMonths, setSelectedMonths] = useState(3)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`
  })
  const [submitting, setSubmitting] = useState(false)
  const [searching, setSearching] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<{ id: string; bankName: string; accountNumber: string; accountName: string; displayName: string }[]>([])

  useEffect(() => {
    if (isOpen) {
      fetchBankAccounts()
    }
  }, [isOpen])

  const fetchBankAccounts = async () => {
    try {
      const res = await adminApi.get(`${endpoints.admin.settings}/payment-methods`)
      if (res.data?.success && res.data?.data?.payment_methods) {
        const mapped = res.data.data.payment_methods
          .filter((m: any) => m.active !== false)
          .map((m: any) => ({
            id: m.id,
            bankName: m.bankName || m.provider || '',
            accountNumber: m.accountNumber || '',
            accountName: m.accountName || '',
            displayName: m.displayName || m.name
          }))
        setBankAccounts(mapped)
      }
    } catch (e) { /* fallback */ }
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      // Search customers directly
      const res = await adminApi.get(`${endpoints.admin.customers}?search=${encodeURIComponent(searchTerm)}&limit=20`)
      if (res.data?.success && res.data?.data) {
        const customers = res.data.data
        // Also try invoice search as fallback
        const invRes = await adminApi.get(`${endpoints.admin.billing}/invoices/search?q=${encodeURIComponent(searchTerm)}`)
        const invoiceCustomers = invRes.data?.data || []
        
        // Merge and deduplicate by service_number (or customer_id if no service_number)
        const unique = new Map()
        customers.forEach((c: any) => {
          const key = c.service_number || c.id
          if (!unique.has(key)) {
            unique.set(key, {
              customer_id: c.id,
              customer_name: c.name,
              customer_phone: c.phone,
              service_number: c.service_number,
              package_name: c.package_name,
              package_price: c.package_price
            })
          }
        })
        invoiceCustomers.forEach((item: any) => {
          const key = item.service_number || item.customer_id
          if (!unique.has(key)) {
            unique.set(key, {
              customer_id: item.customer_id,
              customer_name: item.customer_name,
              customer_phone: item.customer_phone,
              service_number: item.service_number,
              package_name: item.package_name,
              package_price: item.amount
            })
          }
        })
        setSearchResults(Array.from(unique.values()))
      }
    } catch (e) {
      toast.error('Gagal mencari pelanggan')
    } finally {
      setSearching(false)
    }
  }

  const handleSelectCustomer = async (customer: any) => {
    setSelectedCustomer(customer)
    setSearchResults([])
    setSearchTerm(`${customer.customer_name}${customer.service_number ? ` (${customer.service_number})` : ''}`)
    await handleCalculate(customer.customer_id, selectedMonths, customer.service_number)
  }

  const handleCalculate = async (customerId?: string, months?: number, serviceNumber?: string) => {
    const cid = customerId || selectedCustomer?.customer_id
    const snum = serviceNumber || selectedCustomer?.service_number
    const m = months || selectedMonths
    if (!cid) return

    setCalculating(true)
    try {
      const res = await adminApi.post(`${endpoints.admin.billing}/invoices/rapel/calculate`, {
        customer_id: cid,
        service_number: snum,
        months: m
      })
      if (res.data?.success) {
        setCalculation(res.data.data)
      } else {
        toast.error(res.data?.message || 'Gagal menghitung')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal menghitung rapel')
    } finally {
      setCalculating(false)
    }
  }

  const handleMonthsChange = (months: number) => {
    setSelectedMonths(months)
    if (selectedCustomer) {
      handleCalculate(selectedCustomer.customer_id, months, selectedCustomer.service_number)
    }
  }

  const handleSubmit = async () => {
    if (!selectedCustomer) return
    setSubmitting(true)
    try {
      const res = await adminApi.post(`${endpoints.admin.billing}/invoices/rapel`, {
        customer_id: selectedCustomer.customer_id,
        service_number: selectedCustomer.service_number,
        months: selectedMonths,
        payment_method: paymentMethod || undefined,
        payment_date: paymentDate || undefined
      })
      if (res.data?.success) {
        toast.success(`${res.data.data.generated} invoice berhasil dibuat`)
        onSuccess()
        onClose()
      } else {
        toast.error(res.data?.message || 'Gagal memproses rapel')
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Gagal memproses rapel')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setSearchTerm('')
    setSearchResults([])
    setSelectedCustomer(null)
    setCalculation(null)
    setSelectedMonths(3)
    setPaymentMethod('')
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
    setPaymentDate(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`)
    onClose()
  }

  if (!isOpen) return null

  const paymentMethodOptions = bankAccounts.length > 0
    ? bankAccounts.map(b => ({ value: b.id, label: b.displayName || `${b.bankName} - ${b.accountNumber}` }))
    : [
        { value: 'Transfer Bank BRI', label: 'Transfer Bank BRI' },
        { value: 'Transfer Bank BCA', label: 'Transfer Bank BCA' },
        { value: 'Transfer Bank MANDIRI', label: 'Transfer Bank MANDIRI' },
        { value: 'Transfer Bank OCBC', label: 'Transfer Bank OCBC' },
        { value: 'QRIS', label: 'QRIS' },
        { value: 'cash', label: 'Tunai' },
      ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-xl font-semibold text-foreground">RAPEL - Pembayaran Sekaligus</h2>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Search Customer */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Cari Pelanggan</label>
            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setSelectedCustomer(null); setCalculation(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Nama, nomor HP, atau nomor layanan..."
                className="flex-1"
              />
              <Button onClick={handleSearch} disabled={searching || !searchTerm.trim()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {searchResults.length > 0 && (
              <div className="border rounded-lg max-h-56 overflow-y-auto">
                {searchResults.map((item: any, idx: number) => (
                  <div
                    key={`${item.service_number || item.customer_id}-${idx}`}
                    onClick={() => handleSelectCustomer(item)}
                    className="px-3 py-2 hover:bg-muted cursor-pointer text-sm border-b last:border-b-0"
                  >
                    <div className="flex justify-between items-center">
                      <p className="font-medium">{item.customer_name}</p>
                      {item.service_number && (
                        <span className="font-mono text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                          {item.service_number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.customer_phone || '-'} {item.package_name ? `• ${item.package_name}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Info & Calculation */}
          {calculating ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : calculation ? (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="text-sm border-b pb-3">
                  <p className="font-medium text-foreground">{calculation.customer.name}</p>
                  <p className="text-muted-foreground">{calculation.customer.phone}</p>
                </div>

                <div className="text-sm">
                  <p className="font-mono text-xs text-muted-foreground">No. Layanan: {calculation.service.service_number}</p>
                  <p className="text-muted-foreground">
                    {calculation.service.package_name} — {formatCurrency(calculation.service.package_price)}/bln
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">Pilih Durasi</label>
                  <select
                    value={selectedMonths}
                    onChange={(e) => handleMonthsChange(parseInt(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {MONTH_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.discount}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total:</span>
                    <span>{calculation.months} × {formatCurrency(calculation.service.package_price)} = {formatCurrency(calculation.original_total)}</span>
                  </div>
                  {calculation.discount.amount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>{calculation.discount.display}:</span>
                      <span>-{formatCurrency(calculation.discount.amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-foreground pt-1 border-t">
                    <span>Tagihan:</span>
                    <span>{formatCurrency(calculation.final_total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Periode s/d:</span>
                    <span>{new Date(calculation.next_overdue).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Pembayaran (Opsional)</p>
                  <label className="text-xs text-muted-foreground">Metode Bayar</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">-- Pilih Metode --</option>
                    {paymentMethodOptions.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <label className="text-xs text-muted-foreground">Tgl Bayar</label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={handleClose} variant="outline" className="flex-1">Batal</Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    BAYAR
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : selectedCustomer && !calculating ? (
            <div className="text-center py-4 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Memuat data...</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
