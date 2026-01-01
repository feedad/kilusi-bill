'use client'

import { useState, useEffect } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { useWhatsAppWebSocket } from '@/hooks/useWhatsAppWebSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  QrCode,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Trash2,
  X
} from 'lucide-react'

// QR code generation
import QRCode from 'qrcode'

export default function QRCodeModal() {
  const {
    status,
    qrCode,
    showQRCode,
    closeQRCodeModal,
    connecting,
    refreshQRCode,
    fetchStatus
  } = useWhatsAppStore()

  // Enhanced WebSocket connection for real-time QR updates
  useWhatsAppWebSocket({
    onConnectionChange: (connected) => {
      if (connected) {
        console.log('📱 WhatsApp connected via real-time update')
        // Auto-close modal when connected
        closeQRCodeModal()
      }
    },
    onMessageReceived: (data) => {
      console.log('📨 Real-time message in QR modal:', data)
      // Could show a notification or update UI
    }
  })

  const [refreshing, setRefreshing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)

  useEffect(() => {
    if (showQRCode && !status?.connected) {
      // Auto-refresh QR code when modal opens if we don't have a current one
      const checkAndRefreshQR = async () => {
        console.log('🔄 Modal opened, checking QR code status...', {
          hasQR: !!qrCode,
          qrLength: qrCode?.length || 0
        })

        if (!qrCode || qrCode.length < 50) { // QR codes should be substantial strings
          console.log('🔄 No valid QR code available, fetching fresh QR code...')
          try {
            // Use the store's refreshQRCode method to force fresh generation
            await useWhatsAppStore.getState().refreshQRCode()
            setTimeLeft(120) // Set 2 minutes timer
          } catch (error) {
            console.error('Failed to fetch fresh QR code:', error)
          }
        } else {
          console.log('✅ Valid QR code already available')
        }
      }

      // Check immediately when modal opens (with a smaller delay)
      setTimeout(checkAndRefreshQR, 500)

      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            refreshQRCode()
            return 120 // Increased to 2 minutes to reduce API calls
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [showQRCode, status?.connected, refreshQRCode, qrCode])

  useEffect(() => {
    if (showQRCode) {
      // Check connection status every 30 seconds (reduced to avoid rate limiting)
      const statusTimer = setInterval(() => {
        fetchStatus()
      }, 30000)

      return () => clearInterval(statusTimer)
    }
  }, [showQRCode, fetchStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    console.log('🔄 Manual QR refresh requested')
    try {
      // Clear current QR code to force regeneration
      setQrDataUrl(null)

      // Use the store's refreshQRCode method (faster and more reliable)
      await useWhatsAppStore.getState().refreshQRCode()
      setTimeLeft(120) // Set 2 minutes timer

      console.log('✅ QR refresh completed')
    } catch (error) {
      console.error('❌ Failed to refresh QR code:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  // Generate QR code data URL from string
  const generateQRDataURL = async (qrString: string) => {
    if (!qrString || qrString.length < 50) {
      console.log('🔍 No valid QR string provided', {
        hasString: !!qrString,
        length: qrString?.length || 0
      })
      return null
    }

    // Check if it's already a data URL (backend generated)
    if (qrString.startsWith('data:image/png;base64,')) {
      console.log('✅ QR code is already a data URL')
      return qrString
    }

    try {
      console.log('🔍 Generating QR code for string:', qrString.substring(0, 50) + '...')
      const dataUrl = await QRCode.toDataURL(qrString, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      })
      console.log('✅ QR code generated successfully, data URL length:', dataUrl.length)
      return dataUrl
    } catch (error) {
      console.error('❌ Error generating QR code:', error)
      return null
    }
  }

  // Update QR data URL when QR code string changes
  useEffect(() => {
    console.log('🔄 QR Code effect triggered, qrCode:', {
      hasQR: !!qrCode,
      length: qrCode?.length || 0,
      isDataURL: qrCode?.startsWith('data:image/png;base64,') || false,
      preview: qrCode ? qrCode.substring(0, 50) + '...' : 'null'
    })

    if (qrCode && qrCode.length > 50) {
      generateQRDataURL(qrCode).then(dataUrl => {
        setQrDataUrl(dataUrl)
        if (dataUrl) {
          console.log('✅ QR data URL set successfully')
        } else {
          console.log('❌ Failed to generate QR data URL')
        }
      })
    } else {
      console.log('🔄 Setting qrDataUrl to null - no valid QR code')
      setQrDataUrl(null)
    }
  }, [qrCode])

  const handleCopyLink = () => {
    if (qrCode) {
      navigator.clipboard.writeText(qrCode)
        .then(() => {
          // Show success notification
        })
        .catch(err => {
          console.error('Failed to copy QR code:', err)
        })
    }
  }

  // Clear WhatsApp session function
  const handleClearSession = async () => {
    const confirmed = window.confirm(
      'Apakah Anda yakin ingin menghapus session WhatsApp?\n\n' +
      'Ini akan:\n' +
      '• Menghapus semua session data\n' +
      '• Memutuskan koneksi WhatsApp saat ini\n' +
      '• Memerlukan scan QR code ulang\n\n' +
      'Lanjutkan?'
    )

    if (!confirmed) return

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/whatsapp/clear-session`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()

      if (result.success) {
        alert('✅ Session WhatsApp berhasil dihapus!\n\nQR code baru akan dibuat.')
        // Refresh status after clearing session
        await fetchStatus()
        // Generate new QR code
        await handleRefresh()
      } else {
        alert('❌ Gagal menghapus session: ' + (result.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error clearing WhatsApp session:', error)
      alert('❌ Terjadi kesalahan saat menghapus session')
    }
  }

  if (!showQRCode) return null

  return (
    <Dialog open={showQRCode} onOpenChange={closeQRCodeModal}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-center">
            <QrCode className="w-5 h-5" />
            WhatsApp QR Code
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {status?.connected ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                WhatsApp connected successfully!
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700">
                {connecting ? 'Connecting...' : 'Scan QR code below'}
              </AlertDescription>
            </Alert>
          )}

          {!status?.connected && (
            <div className="text-center">
              <div className="relative inline-block">
                <div className="w-64 h-64 bg-white rounded-lg p-2 border-2 border-gray-200 mx-auto">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="WhatsApp QR Code"
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        console.error('❌ QR code image failed to load')
                        e.currentTarget.style.display = 'none'
                        setQrDataUrl(null)
                      }}
                      onLoad={() => {
                        console.log('✅ QR code image loaded successfully')
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center">
                        <QrCode className="w-16 h-16 mx-auto text-gray-300 mb-2 animate-pulse" />
                        <p className="text-sm text-gray-500">
                          {qrCode && qrCode.length > 50 ? 'Generating image...' : 'Waiting for QR code...'}
                        </p>
                        {qrCode && (
                          <p className="text-xs text-gray-400 mt-1">
                            Raw QR length: {qrCode.length}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {connecting && (
                  <div className="absolute inset-0 bg-white bg-opacity-90 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <RefreshCw className="w-8 h-8 mx-auto text-blue-500 animate-spin mb-2" />
                      <p className="text-sm font-medium">Connecting...</p>
                    </div>
                  </div>
                )}

                {refreshing && (
                  <div className="absolute inset-0 bg-white bg-opacity-90 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <RefreshCw className="w-8 h-8 mx-auto text-orange-500 animate-spin mb-2" />
                      <p className="text-sm font-medium">Refreshing QR...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-xs text-gray-500">
                  Auto-refresh in {timeLeft}s
                </p>
                {qrCode && (
                  <p className="text-xs text-gray-400">
                    Status: {qrCode.startsWith('data:image/png;base64,') ? 'Ready to scan' : 'Processing...'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || connecting}
              className="flex-1"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Generate QR
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSession}
              disabled={connecting}
              className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Simple Instructions */}
          <div className="text-xs text-gray-600 text-center space-y-1">
            <p className="font-medium">How to connect:</p>
            <p>1. Open WhatsApp → Linked Devices</p>
            <p>2. Tap "Link a device"</p>
            <p>3. Scan this QR code</p>
          </div>

          {/* Status */}
          {status && (
            <div className="text-center">
              <Badge variant={status.connected ? 'default' : 'secondary'}>
                {status.connected ? '✓ Connected' : '⏳ Waiting'}
              </Badge>
            </div>
          )}

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={closeQRCodeModal}
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}