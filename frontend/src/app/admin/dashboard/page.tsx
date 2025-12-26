'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import {
  Users,
  CreditCard,
  Activity,
  Package,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wifi,
  UserPlus,
  FileText
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { adminApi, endpoints } from '@/lib/api-clients'
import { CustomerStatusWidget } from '@/components/dashboard/CustomerStatusWidget'
import { MonthlyRevenueChart } from '@/components/dashboard/MonthlyRevenueChart'

interface DashboardStats {
  totalCustomers: number
  activeCustomers: number
  inactiveCustomers: number
  totalPackages: number
  monthlyRevenue: number
  pendingInvoices: number
  overdueInvoices: number
  overdueAmount: number
  onlineCustomers: number
  customerGrowth: {
    percentage: string
  }
  revenueMetrics: {
    averagePerCustomer: string
  }
}

interface Activity {
  id: string
  type: 'payment' | 'new_customer' | 'invoice'
  name: string
  date: string
  description: string
}

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'payment':
      return CreditCard
    case 'new_customer':
      return UserPlus
    case 'invoice':
      return FileText
    default:
      return Activity
  }
}

const getActivityColor = (type: string) => {
  switch (type) {
    case 'payment':
      return 'text-success'
    case 'new_customer':
      return 'text-info'
    case 'invoice':
      return 'text-primary'
    default:
      return 'text-muted-foreground'
  }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log('Fetching dashboard data via API')

      // Fetch dashboard stats via API
      const statsResponse = await adminApi.get('/api/v1/dashboard/stats')
      if (statsResponse.data.success) {
        setStats(statsResponse.data.data)
      }

      // Fetch recent activities via API
      const activitiesResponse = await adminApi.get('/api/v1/dashboard/recent-activities')
      if (activitiesResponse.data.success) {
        setActivities(activitiesResponse.data.data.activities)
      }

      setLastUpdated(new Date())
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
      return `${diffInMinutes} minutes ago`
    } else if (diffInHours < 24) {
      return `${diffInHours} hours ago`
    } else {
      const diffInDays = Math.floor(diffInHours / 24)
      return `${diffInDays} days ago`
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <Card key={`skeleton-${i}`} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p className="mb-2">Error loading dashboard data</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={fetchDashboardData}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              No dashboard data available
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-background min-h-screen">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Last updated:</span>
          <span className="text-sm font-medium text-foreground">{formatTimeAgo(lastUpdated.toISOString())}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-foreground">{stats.totalCustomers.toLocaleString()}</div>
            <div className="flex items-center text-xs text-success mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              {stats.customerGrowth.percentage}% active
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Online Customers</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-foreground">{stats.onlineCustomers}</div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              <Wifi className="h-3 w-3 mr-1" />
              {stats.activeCustomers} total active
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-foreground">{formatCurrency(stats.monthlyRevenue || 0)}</div>
            <div className="flex items-center text-xs text-success mt-1">
              <TrendingUp className="h-3 w-3 mr-1" />
              Avg: {formatCurrency(parseFloat(stats.revenueMetrics?.averagePerCustomer || '0'))}/customer
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Overdue Invoices</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-error">{stats.overdueInvoices}</div>
            <div className="flex items-center text-xs text-error mt-1">
              <TrendingDown className="h-3 w-3 mr-1" />
              {formatCurrency(stats.overdueAmount || 0)} outstanding
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Status Widget - Full Width */}
      <div className="mb-8">
        <CustomerStatusWidget limit={20} />
      </div>

      {/* Revenue Overview */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Revenue Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyRevenueChart />
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activities.length > 0 ? (
              activities.map((activity) => {
                const Icon = getActivityIcon(activity.type)
                return (
                  <div key={`${activity.id}-${activity.type}-${activity.date}`} className="flex items-start space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className={`p-2 rounded-full flex-shrink-0 ${getActivityColor(activity.type)} bg-opacity-10`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-tight">{activity.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatTimeAgo(activity.date)}</p>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No recent activity
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Pending Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold text-foreground">{stats.pendingInvoices}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Service Packages</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold text-foreground">{stats.totalPackages}</div>
            <p className="text-xs text-muted-foreground mt-1">Available packages</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Active Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold text-foreground">
              {stats.customerGrowth.percentage}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Customer retention</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Inactive Customers</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold text-warning">{stats.inactiveCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">Need attention</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}