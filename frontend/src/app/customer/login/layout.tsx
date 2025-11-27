'use client'

import { CustomerAuthProvider } from '@/contexts/CustomerAuthContext'

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CustomerAuthProvider>
      <div className="min-h-screen">
        {children}
      </div>
    </CustomerAuthProvider>
  )
}