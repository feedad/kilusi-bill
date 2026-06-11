'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { customerAPI } from '@/lib/customer-api'
import CustomerAuth from '@/lib/customer-auth'

import CustomerInfoCard from './components/CustomerInfoCard'
import InvoiceSummaryCard from './components/InvoiceSummaryCard'
import ServiceAccordion from './components/ServiceAccordion'
import BottomNav from './components/BottomNav'
import NotificationPanel from './components/NotificationPanel'

export default function PortalV2Page() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [customerData, setCustomerData] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchCustomerData = useCallback(async () => {
    try {
      const result = await customerAPI.getCustomerData()
      if (result?.success && result.data) {
        setCustomerData(result.data.customer)
        try {
          const notifRes = await customerAPI.getNotifications(result.data.customer?.id)
          if (notifRes?.data) setUnreadCount(notifRes.data.filter((n: any) => !n.read).length)
        } catch (_) {}
      }
    } catch (e) {}
  }, [])

  const fetchInvoices = useCallback(async () => {
    try {
      const token = CustomerAuth.getStoredAuth().token
      if (!token) return
      const res = await fetch('/api/v1/customer-billing/my-invoices', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data?.success) setInvoices(data.data || [])
    } catch (e) {}
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('customer_token')
    if (!token) { router.push('/customer/login'); return }
    Promise.all([fetchCustomerData(), fetchInvoices()]).finally(() => setLoading(false))
  }, [fetchCustomerData, fetchInvoices, router])

  const accounts: any[] = customerData?.accounts || []

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Selamat Pagi'
    if (h < 15) return 'Selamat Siang'
    if (h < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  }

  if (loading && !customerData) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="pb-20 lg:pb-10">
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} customerId={customerData?.id} />

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{getGreeting()}, {customerData?.name?.split(' ')[0] || 'User'}</h1>
            <p className="text-xs text-muted-foreground">ID: {customerData?.customer_id || '-'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setNotifOpen(true)} className="relative p-2 rounded-lg hover:bg-accent transition-colors">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <Button variant="ghost" size="sm" onClick={async () => { await Promise.all([fetchCustomerData(), fetchInvoices()]); toast.success('Data diperbarui') }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <CustomerInfoCard customer={customerData} />
        <InvoiceSummaryCard invoices={invoices} services={accounts} />

        {accounts.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2"><span className="w-1 h-4 bg-primary rounded-full" />Layanan</h2>
            {accounts.map((svc: any) => (
              <ServiceAccordion
                key={svc.service_number}
                service={svc}
                expanded={expandedService === svc.service_number}
                onToggle={() => setExpandedService(expandedService === svc.service_number ? null : svc.service_number)}
              />
            ))}
          </div>
        )}
        {accounts.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">Tidak ada layanan terdaftar</p>}
      </main>

      <BottomNav />
    </div>
  )
}

function Bell(props: any) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
}
