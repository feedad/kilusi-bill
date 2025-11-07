'use client'

import React from 'react'
import { Menu, Bell, Search, Settings, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui'
import { Input } from '@/components/ui'

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme, notifications, addNotification } = useAppStore()
  const { user } = useAuthStore()
  const [searchQuery, setSearchQuery] = React.useState('')

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
    addNotification({
      type: 'info',
      title: 'Theme Changed',
      message: `Switched to ${theme === 'light' ? 'dark' : 'light'} mode`,
    })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      // Implement search functionality
      console.log('Searching for:', searchQuery)
    }
  }

  return (
    <header className="bg-card shadow-sm border-b border-border">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Menu button and Search */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Search Bar - Hidden on mobile */}
            <form onSubmit={handleSearch} className="hidden md:block">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  type="text"
                  placeholder="Search customers, invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64 lg:w-80"
                />
              </div>
            </form>
          </div>

          {/* Right side - Notifications, Theme, Settings */}
          <div className="flex items-center space-x-4">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </Button>

            {/* Notifications */}
            <div className="relative">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Settings */}
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>

            {/* User Avatar */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">
                    {user?.name || 'Admin User'}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user?.role || 'admin'}
                  </p>
                </div>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="md:hidden px-4 pb-3">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
        </form>
      </div>
    </header>
  )
}