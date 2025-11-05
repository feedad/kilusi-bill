'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  Package,
  FileText,
  Activity,
  Wifi,
  Router,
  Smartphone,
  LogOut,
  X,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'technician'],
  },
  {
    name: 'Pelanggan',
    href: '/admin/customers',
    icon: Users,
    roles: ['admin'],
  },
  {
    name: 'Paket Layanan',
    href: '/admin/packages',
    icon: Package,
    roles: ['admin'],
  },
  {
    name: 'Billing',
    href: '/admin/billing',
    icon: CreditCard,
    roles: ['admin'],
  },
  {
    name: 'Invoice',
    href: '/admin/invoices',
    icon: FileText,
    roles: ['admin'],
  },
  {
    name: 'Pembayaran',
    href: '/admin/payments',
    icon: Activity,
    roles: ['admin'],
  },
  {
    name: 'Hotspot',
    href: '/admin/hotspot',
    icon: Wifi,
    roles: ['admin'],
  },
  {
    name: 'Mikrotik',
    href: '/admin/mikrotik',
    icon: Router,
    roles: ['admin'],
  },
  {
    name: 'RADIUS',
    href: '/admin/radius',
    icon: Smartphone,
    roles: ['admin'],
  },
  {
    name: 'Pengaturan',
    href: '/admin/settings',
    icon: Settings,
    roles: ['admin'],
  },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  const filteredNavigation = navigation.filter((item) =>
    user?.role ? item.roles.includes(user.role) : false
  )

  const handleLogout = () => {
    logout()
    onClose()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo and brand */}
      <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <img
              className="h-8 w-auto"
              src="/logo.png"
              alt="Kilusi Bill"
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzNiODJmNiIvPgo8cGF0aCBkPSJNOCAxNkgxNlY4SDhWMTZaTTggMjRIMTZWMTZIOFYyNFpNMTYgMjRIMjRWMTZIMTZWMjRaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K'
              }}
            />
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold text-gray-900">Kilusi Bill</h1>
            <p className="text-xs text-gray-500">ISP Management</p>
          </div>
        </div>
        <button
          type="button"
          className="lg:hidden"
          onClick={onClose}
        >
          <X className="h-6 w-6 text-gray-500 hover:text-gray-700" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => onClose()}
              className={cn(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-primary-100 text-primary-700 border-r-2 border-primary-700'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive
                    ? 'text-primary-700'
                    : 'text-gray-400 group-hover:text-gray-500'
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-200 p-3">
        <div className="flex items-center px-3 py-2">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.name || 'Admin User'}
            </p>
            <p className="text-xs text-gray-500 truncate capitalize">
              {user?.role || 'admin'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-3 flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}