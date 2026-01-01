'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui'
import { Calendar, DollarSign, TrendingUp, BarChart3, RefreshCw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { adminApi } from '@/lib/api-clients'

interface RevenueData {
  dates: string[]
  revenues: number[]
  totalRevenue: number
  avgRevenue: number
  maxRevenue: number
  daysWithRevenue: number
  period: string
  startDate: string
  endDate: string
}

export function MonthlyRevenueChart() {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRevenueData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await adminApi.get('/api/v1/dashboard/monthly-revenue')

      if (response.data.success) {
        setData(response.data.data)
      } else {
        setError('Failed to load revenue data')
      }
    } catch (err: any) {
      console.error('Error fetching revenue data:', err)
      setError(err.message || 'Connection error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRevenueData()
  }, [])

  const maxBarHeight = 200 // Maximum height for bars in pixels

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
          <BarChart3 className="h-8 w-8 mx-auto mb-2" />
          <p>Error loading revenue data</p>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRevenueData()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-center text-muted-foreground">
        <div>
          <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No revenue data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Grafik Pendapatan Harian</h3>
            <p className="text-sm text-muted-foreground">{data.period}</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchRevenueData()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-green-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-green-700 dark:text-green-400 mb-1">
            Total Revenue
          </div>
          <div className="text-2xl font-bold text-green-800 dark:text-green-300">
            {formatCurrency(data.totalRevenue)}
          </div>
          <div className="text-xs text-green-700 dark:text-green-400 mt-1">
            {data.dates.length} hari
          </div>
        </div>

        <div className="bg-blue-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">
            Rata-rata
          </div>
          <div className="text-2xl font-bold text-blue-800 dark:text-blue-300">
            {formatCurrency(data.avgRevenue)}
          </div>
          <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
            per hari
          </div>
        </div>

        <div className="bg-purple-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-purple-700 dark:text-purple-400 mb-1">
            Tertinggi
          </div>
          <div className="text-2xl font-bold text-purple-800 dark:text-purple-300">
            {formatCurrency(data.maxRevenue)}
          </div>
          <div className="text-xs text-purple-700 dark:text-purple-400 mt-1">
            satu hari
          </div>
        </div>

        <div className="bg-orange-500/10 rounded-xl p-4">
          <div className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-1">
            Hari Aktif
          </div>
          <div className="text-2xl font-bold text-orange-800 dark:text-orange-300">
            {data.daysWithRevenue}
          </div>
          <div className="text-xs text-orange-700 dark:text-orange-400 mt-1">
            dari {data.dates.length} hari
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-card rounded-lg border p-6">
        <div className="mb-4">
          <h4 className="text-sm font-medium text-foreground mb-2">Pendapatan Harian</h4>
          <p className="text-xs text-muted-foreground">
            {data.startDate} - {data.endDate}
          </p>
        </div>

        <div className="relative">
          {/* Chart Container */}
          <div className="flex items-end gap-1 h-52 mb-2">
            {data.dates.map((date, index) => {
              const revenue = data.revenues[index]
              const barHeight = data.maxRevenue > 0 ? (revenue / data.maxRevenue) * maxBarHeight : 0
              const hasRevenue = revenue > 0

              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="relative w-full flex items-end justify-center h-full">
                    {hasRevenue ? (
                      <div
                        className="bg-blue-500 hover:bg-blue-600 transition-all duration-300 rounded-t cursor-pointer relative group min-w-[20px]"
                        style={{
                          height: `${barHeight}px`,
                          minHeight: '4px',
                          width: '100%'
                        }}
                        title={`${date}: ${formatCurrency(revenue)}`}
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          <div>{formatCurrency(revenue)}</div>
                          <div className="text-gray-300">{date}</div>
                          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="bg-gray-200 dark:bg-gray-700 rounded-t w-2 h-1"
                        title={`${date}: Tidak ada pendapatan`}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex gap-1 overflow-x-auto">
            {data.dates.map((date, index) => (
              <div key={index} className="flex-1 text-center">
                <div className="text-xs text-muted-foreground truncate">
                  {date}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-xs text-muted-foreground">Pendapatan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <span className="text-xs text-muted-foreground">Tidak ada pendapatan</span>
          </div>
        </div>
      </div>
    </div>
  )
}