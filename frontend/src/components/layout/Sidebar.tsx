'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { useBranding } from '@/hooks/useBranding'
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  Package,
  Activity,
  Wifi,
  MessageSquare,
  LogOut,
  X,
  Server,
  Monitor,
  MapPin,
  Network,
  Calculator,
  Gift,
  Loader2,
  Headset,
  Megaphone,
  Calendar,
  UserCog,
  ChevronDown,
  ChevronRight,
  Globe,
  Wallet,
  Radio,
  BookOpen,
  TicketCheck,
  Wrench,
  PlusCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  roles: string[]
}

interface NavGroup {
  name: string
  icon: React.ElementType
  roles: string[]
  items: NavItem[]
}

// Grouped navigation structure
const navigationGroups: NavGroup[] = [
  {
    name: 'Overview',
    icon: LayoutDashboard,
    roles: ['admin'],
    items: [
      {
        name: 'Dashboard',
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        roles: ['admin'],
      },
    ],
  },
  {
    name: 'Technical',
    icon: Activity,
    roles: ['technician'],
    items: [
      {
        name: 'Dashboard',
        href: '/technician',
        icon: LayoutDashboard,
        roles: ['technician'],
      },
      {
        name: 'My Tickets',
        href: '/technician/tickets',
        icon: TicketCheck,
        roles: ['technician'],
      },
      {
        name: 'Installations',
        href: '/technician/installations', // Placeholder or same as tickets filtered
        icon: Wrench,
        roles: ['technician'],
      },
      {
        name: 'Online Customers',
        href: '/technician/online',
        icon: Users,
        roles: ['technician'],
      },
      {
        name: 'Network Map',
        href: '/admin/network-map', // Shared
        icon: MapPin,
        roles: ['technician'],
      }
    ],
  },
  {
    name: 'Pelanggan',
    icon: Users,
    roles: ['admin'],
    items: [
      {
        name: 'Data Pelanggan',
        href: '/admin/customers',
        icon: Users,
        roles: ['admin'],
      },
      {
        name: 'Pendaftaran Baru',
        href: '/admin/registrations',
        icon: UserCog,
        roles: ['admin'],
      },
      {
        name: 'Pelanggan Online',
        href: '/admin/online-customers',
        icon: Monitor,
        roles: ['admin'],
      },
      {
        name: 'Paket Layanan',
        href: '/admin/packages',
        icon: Package,
        roles: ['admin'],
      },
      {
        name: 'Support Tiket',
        href: '/admin/support',
        icon: Headset,
        roles: ['admin'],
      },
    ],
  },
  {
    name: 'Jaringan',
    icon: Network,
    roles: ['admin', 'technician'],
    items: [
      {
        name: 'ACS / TR-069',
        href: '/admin/genieacs',
        icon: Server,
        roles: ['admin', 'technician'],
      },
      {
        name: 'ODP Management',
        href: '/admin/odp', // Admin view
        icon: Network,
        roles: ['admin'],
      },
      {
        name: 'Add ODP',
        href: '/technician/odps/create',
        icon: PlusCircle,
        roles: ['technician'],
      },
      {
        name: 'Data OLT',
        href: '/technician/olts',
        icon: Server,
        roles: ['technician'],
      },
      {
        name: 'Manajemen OLT',
        href: '/admin/olts',
        icon: Server,
        roles: ['admin'],
      },
      {
        name: 'Server RADIUS',
        href: '/admin/radius',
        icon: Server,
        roles: ['admin'],
      },
      {
        name: 'Hotspot',
        href: '/admin/hotspot',
        icon: Wifi,
        roles: ['admin'],
      },
    ],
  },
  {
    name: 'Keuangan',
    icon: Wallet,
    roles: ['admin'],
    items: [
      {
        name: 'Billing & Invoice',
        href: '/admin/billing',
        icon: CreditCard,
        roles: ['admin'],
      },
      {
        name: 'Akunting',
        href: '/admin/accounting',
        icon: Calculator,
        roles: ['admin'],
      },
      {
        name: 'Diskon & Referral',
        href: '/admin/discounts-referrals',
        icon: Gift,
        roles: ['admin'],
      },
      {
        name: 'Setting Pembayaran',
        href: '/admin/payment-settings',
        icon: CreditCard,
        roles: ['admin'],
      },
    ],
  },
  {
    name: 'Komunikasi',
    icon: Radio,
    roles: ['admin'],
    items: [
      {
        name: 'WhatsApp',
        href: '/admin/whatsapp',
        icon: MessageSquare,
        roles: ['admin'],
      },
      {
        name: 'Broadcast',
        href: '/admin/broadcast',
        icon: Megaphone,
        roles: ['admin'],
      },
      {
        name: 'Maintenance',
        href: '/admin/maintenance',
        icon: Calendar,
        roles: ['admin'],
      },
    ],
  },
  {
    name: 'Sistem',
    icon: Settings,
    roles: ['admin'],
    items: [
      {
        name: 'Manajemen User',
        href: '/admin/users',
        icon: UserCog,
        roles: ['admin'],
      },
      {
        name: 'Pengaturan',
        href: '/admin/settings',
        icon: Settings,
        roles: ['admin'],
      },
      {
        name: 'Landing Page',
        href: '/admin/landing-content',
        icon: Globe,
        roles: ['admin'],
      },
      {
        name: 'Blog',
        href: '/admin/blog',
        icon: BookOpen,
        roles: ['admin'],
      },
    ],
  },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { sidebarOpen, setSidebarOpen } = useAppStore()
  const { branding, getLogoUrl, isLogoMode, loading: brandingLoading } = useBranding()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<string[]>([])

  // Auto-expand group containing active item
  useEffect(() => {
    navigationGroups.forEach(group => {
      const hasActiveItem = group.items.some(item => pathname === item.href || pathname.startsWith(item.href.split('#')[0] + '/'))
      if (hasActiveItem && !expandedGroups.includes(group.name)) {
        setExpandedGroups(prev => [...prev, group.name])
      }
    })
  }, [pathname])

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupName)
        ? prev.filter(name => name !== groupName)
        : [...prev, groupName]
    )
  }

  // Normalize role to handle different naming conventions
  // 'administrator' and 'superadmin' are treated as 'admin'
  const normalizeRole = (role: string | undefined): string | undefined => {
    if (!role) return undefined
    if (role === 'administrator' || role === 'superadmin') return 'admin'
    return role
  }

  const normalizedRole = normalizeRole(user?.role)

  const filteredGroups = navigationGroups
    .filter(group => normalizedRole ? group.roles.includes(normalizedRole) : false)
    .map(group => ({
      ...group,
      items: group.items.filter(item => normalizedRole ? item.roles.includes(normalizedRole) : false)
    }))
    .filter(group => group.items.length > 0)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      onClose()
    } catch (error) {
      console.error('Logout error:', error)
      onClose()
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-card border-r border-border transition-all duration-200">
      {/* Logo and brand */}
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          {isLogoMode && getLogoUrl() ? (
            <img
              src={getLogoUrl()!}
              alt={branding.siteTitle}
              className="h-10 object-contain"
              onError={(e) => {
                // Fallback to text if image fails
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <>
              <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center text-primary-foreground font-bold text-lg shadow-sm">
                {branding.siteTitle?.substring(0, 2).toUpperCase() || 'KB'}
              </div>
              <div className="font-semibold text-foreground text-lg">
                {branding.siteTitle || 'KILUSI BILL'}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors"
          onClick={onClose}
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Navigation with scroll */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-hide">
        {filteredGroups.map((group) => {
          const isExpanded = expandedGroups.includes(group.name)
          const hasActiveItem = group.items.some(item => pathname === item.href || pathname.startsWith(item.href.split('#')[0] + '/'))
          const GroupIcon = group.icon

          return (
            <div key={group.name} className="relative">
              {/* Group Header */}
              {navigationGroups.length > 1 && (
                <div className="px-3 py-2 mt-4 first:mt-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.name}
                </div>
              )}

              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href.split('#')[0] + '/')
                  const ItemIcon = item.icon
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => onClose()}
                      className={cn(
                        'group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <ItemIcon
                        className={cn(
                          'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                          isActive
                            ? 'text-primary'
                            : 'text-muted-foreground group-hover:text-primary'
                        )}
                      />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div className="p-3 flex-shrink-0 border-t border-border">
        <div className="px-3 py-3 rounded-xl bg-muted/50">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold text-sm shadow-sm">
              {user?.name?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {user?.name || 'Admin User'}
              </p>
              <p className="text-xs text-muted-foreground truncate capitalize">
                {user?.role || 'admin'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="ml-2 p-2.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Logout"
            >
              {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}