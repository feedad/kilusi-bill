'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui'
import { TrendingUp, Calendar, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { adminApi } from '@/lib/api-clients'

interface RevenueData {
  month: string
  paid: string | number
  paid_count: string | number
  unpaid: string | number
  unpaid_count: string | number
}

interface RevenueChartProps {
  period?: '1month' | '3months' | '6months' | '1year'
  height?: number
}

export function RevenueChart({ period = '6months', height = 300 }: RevenueChartProps) {
  const [revenueData, setRevenueData] = useState<RevenueData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPeriod, setSelectedPeriod] = useState(period)

  const fetchRevenueData = async (periodToUse: string) => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching revenue data for period:', periodToUse)
      const response = await adminApi.get(`/api/v1/dashboard/revenue-chart?period=${periodToUse}`)
      console.log('Revenue API response:', response.data)

      if (response.data.success) {
        setRevenueData(response.data.data.revenue || [])
        console.log('Revenue data set:', response.data.data.revenue)
      } else {
        setError('Failed to load revenue data')
      }
    } catch (err: any) {
      console.error('Error fetching revenue data:', err)
      setError(err.message || 'Connection error')

      // No mock data - only use real API data
      setRevenueData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRevenueData(selectedPeriod)
  }, [selectedPeriod])

  const formatMonth = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
  }

  const calculateTotalRevenue = () => {
    const total = revenueData.reduce((sum, item) => {
      const paid = parseFloat(String(item.paid || 0))
      return sum + (isNaN(paid) ? 0 : paid)
    }, 0)
    return total
  }

  const calculateTotalUnpaid = () => {
    const total = revenueData.reduce((sum, item) => {
      const unpaid = parseFloat(String(item.unpaid || 0))
      return sum + (isNaN(unpaid) ? 0 : unpaid)
    }, 0)
    return total
  }

  const calculateGrowth = () => {
    if (revenueData.length < 2) return 0
    const latest = parseFloat(String(revenueData[revenueData.length - 1]?.paid || 0))
    const previous = parseFloat(String(revenueData[revenueData.length - 2]?.paid || 0))
    if (previous === 0 || isNaN(latest) || isNaN(previous)) return 0
    return Math.round(((latest - previous) / previous) * 100)
  }

  const maxRevenue = Math.max(...revenueData.map(item => {
    const paid = parseFloat(String(item.paid || 0))
    const unpaid = parseFloat(String(item.unpaid || 0))
    return (isNaN(paid) ? 0 : paid) + (isNaN(unpaid) ? 0 : unpaid)
  }), 1)

  const periodOptions = [
    { value: '1month', label: '1 Bulan' },
    { value: '3months', label: '3 Bulan' },
    { value: '6months', label: '6 Bulan' },
    { value: '1year', label: '1 Tahun' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-destructive mb-2">
          <TrendingUp className="h-8 w-8 mx-auto mb-2" />
          <p>Error loading revenue data</p>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRevenueData(selectedPeriod)}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (revenueData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-center text-muted-foreground">
        <div>
          <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No revenue data available for this period</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Period Selector and Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {periodOptions.find(opt => opt.value === selectedPeriod)?.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {periodOptions.map((option) => (
            <Button
              key={option.value}
              variant={selectedPeriod === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
            Total Revenue
          </div>
          <div className="text-2xl font-bold text-green-800 dark:text-green-300">
            {formatCurrency(calculateTotalRevenue())}
          </div>
          <div className="text-xs text-green-700 dark:text-green-400 mt-1">
            {revenueData.reduce((sum, item) => sum + parseInt(String(item.paid_count || 0)), 0)} payments
          </div>
        </div>

        <div className="bg-red-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">
            Outstanding
          </div>
          <div className="text-2xl font-bold text-red-800 dark:text-red-300">
            {formatCurrency(calculateTotalUnpaid())}
          </div>
          <div className="text-xs text-red-700 dark:text-red-400 mt-1">
            {revenueData.reduce((sum, item) => sum + parseInt(String(item.unpaid_count || 0)), 0)} pending
          </div>
        </div>

        <div className="bg-blue-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">
            Growth
          </div>
          <div className="text-2xl font-bold text-blue-800 dark:text-blue-300">
            {calculateGrowth()}%
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
            vs previous month
          </div>
        </div>
      </div>

      {/* Simple Bar Chart */}
      <div className="bg-card rounded-lg border p-4">
        <div className="space-y-3">
          {revenueData.map((item, index) => {
            const paidAmount = parseFloat(String(item.paid || 0))
            const unpaidAmount = parseFloat(String(item.unpaid || 0))
            const paidCount = parseInt(String(item.paid_count || 0))
            const unpaidCount = parseInt(String(item.unpaid_count || 0))
            const totalAmount = (isNaN(paidAmount) ? 0 : paidAmount) + (isNaN(unpaidAmount) ? 0 : unpaidAmount)
            const totalCount = (isNaN(paidCount) ? 0 : paidCount) + (isNaN(unpaidCount) ? 0 : unpaidCount)

            return (
              <div key={index} className="flex items-center gap-3">
                <div className="w-16 text-sm text-muted-foreground text-right">
                  {formatMonth(item.month)}
                </div>

                <div className="flex-1 relative">
                  <div className="h-8 bg-muted rounded-full overflow-hidden flex">
                    {paidAmount > 0 && !isNaN(paidAmount) && (
                      <div
                        className="bg-green-500 h-full flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${(paidAmount / maxRevenue) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">
                          {formatCurrency(paidAmount)}
                        </span>
                      </div>
                    )}
                    {unpaidAmount > 0 && !isNaN(unpaidAmount) && (
                      <div
                        className="bg-red-500 h-full flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${(unpaidAmount / maxRevenue) * 100}%` }}
                      >
                        <span className="text-xs text-white font-medium">
                          {formatCurrency(unpaidAmount)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-20 text-right">
                  <div className="text-sm font-medium text-foreground">
                    {formatCurrency(totalAmount)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {totalCount} invoices
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-sm text-muted-foreground">Paid</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded"></div>
            <span className="text-sm text-muted-foreground">Outstanding</span>
          </div>
        </div>
      </div>
    </div>
  )
}