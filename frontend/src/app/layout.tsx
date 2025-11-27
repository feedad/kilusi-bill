import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/components/providers/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Kilusi Bill - ISP Management System',
  description: 'Complete ISP billing and management solution',
  keywords: 'ISP, billing, management, mikrotik, radius',
  authors: [{ name: 'Kilusi Digital Network' }],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#3b82f6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <AuthProvider>
            <div id="root">
              {children}
            </div>
            <div id="modal-root" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}