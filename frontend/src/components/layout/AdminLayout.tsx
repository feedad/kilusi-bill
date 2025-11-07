'use client'

import React, { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { FullPageLoader } from '@/components/ui'

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const { globalLoading } = useAppStore()

  if (!isAuthenticated || !user) {
    return <FullPageLoader />
  }

  if (globalLoading) {
    return <FullPageLoader />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar and Main Content Container */}
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-card shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:relative lg:inset-auto border-r border-border sidebar
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="relative z-30">
            <Header onMenuClick={() => setSidebarOpen(true)} />
          </div>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto py-4 lg:py-6">
            <div className="mx-auto max-w-full px-4 sm:px-6 lg:px-8 xl:max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}