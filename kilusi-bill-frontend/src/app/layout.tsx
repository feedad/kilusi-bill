import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Kilusi Bill - ISP Management System',
  description: 'Complete ISP billing and management solution',
  keywords: 'ISP, billing, management, mikrotik, radius',
  authors: [{ name: 'Kilusi Digital Network' }],
  viewport: 'width=device-width, initial-scale=1',
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
        <div id="root">
          {children}
        </div>
        <div id="modal-root" />
      </body>
    </html>
  )
}