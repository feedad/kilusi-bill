import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import 'leaflet/dist/leaflet.css'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from 'react-hot-toast'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Kilusi Bill - ISP Management System',
  description: 'Complete ISP billing and management solution',
  keywords: 'ISP, billing, management, mikrotik, radius',
  authors: [{ name: 'Kilusi Digital Network' }],
  icons: {
    icon: '/favicon.ico',
  },
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
      <body className={dmSans.className}>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <div id="root">
                {children}
              </div>
              <div id="modal-root" />
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'hsl(var(--background))',
                    color: 'hsl(var(--foreground))',
                    border: '1px solid hsl(var(--border))',
                  },
                  success: {
                    iconTheme: {
                      primary: 'hsl(142, 76%, 36%)',
                      secondary: 'hsl(var(--background))',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: 'hsl(0, 84%, 60%)',
                      secondary: 'hsl(var(--background))',
                    },
                  },
                }}
              />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}