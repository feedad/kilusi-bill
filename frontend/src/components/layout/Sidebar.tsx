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
  MessageSquare,
  LogOut,
  X,
  Menu,
  Server,
  Monitor,
  MapPin,
  Network,
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
    name: 'Teknisi Dashboard',
    href: '/admin/technician-dashboard',
    icon: Activity,
    roles: ['admin', 'technician'],
  },
  {
    name: 'Pelanggan',
    href: '/admin/customers',
    icon: Users,
    roles: ['admin'],
  },
  {
    name: 'Pelanggan Online',
    href: '/admin/online-customers',
    icon: Monitor,
    roles: ['admin', 'technician'],
  },
  {
    name: 'GenieACS',
    href: '/admin/genieacs',
    icon: Server,
    roles: ['admin', 'technician'],
  },
  {
    name: 'ODP',
    href: '/admin/odp',
    icon: Network,
    roles: ['admin'],
  },
  {
    name: 'Network Map',
    href: '/admin/onu-map',
    icon: MapPin,
    roles: ['admin', 'technician'],
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
    name: 'WhatsApp',
    href: '/admin/whatsapp',
    icon: MessageSquare,
    roles: ['admin'],
  },
  {
    name: 'Server',
    href: '/admin/radius',
    icon: Server,
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
      <div className="flex h-16 items-center justify-between px-6 border-b border-border">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Server className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="ml-3">
            <h1 className="text-lg font-semibold">Kilusi Bill</h1>
            <p className="text-xs text-muted-foreground">ISP Management</p>
          </div>
        </div>
        <button
          type="button"
          className="lg:hidden"
          onClick={onClose}
        >
          <X className="h-6 w-6 text-muted-foreground hover:text-white" />
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
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
                isActive
                  ? 'nav-link-active shadow-lg transform scale-[1.02]'
                  : 'nav-link-inactive'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive
                    ? 'text-white'
                    : 'text-muted-foreground group-hover:text-white'
                )}
              />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-border p-3">
        <div className="flex items-center px-3 py-2">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </span>
            </div>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.name || 'Admin User'}
            </p>
            <p className="text-xs text-muted-foreground truncate capitalize">
              {user?.role || 'admin'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="ml-3 flex-shrink-0 p-1 text-muted-foreground hover:text-white"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}