'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, Gift, Headset } from 'lucide-react'

const items = [
  { href: '/customer/portal-v2', icon: Home, label: 'Home' },
  { href: '/customer/billing', icon: FileText, label: 'Tagihan' },
  { href: '/customer/referrals', icon: Gift, label: 'Referral' },
  { href: '/customer/support', icon: Headset, label: 'Support' },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-background border-t border-border lg:hidden z-30">
      <div className="flex justify-around items-center h-14 max-w-5xl mx-auto">
        {items.map(item => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/')
          return <Link key={item.href} href={item.href} className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${active?'text-primary':'text-muted-foreground hover:text-foreground'}`}><item.icon className="w-5 h-5" /><span className="text-[10px] font-medium">{item.label}</span></Link>
        })}
      </div>
    </nav>
  )
}
