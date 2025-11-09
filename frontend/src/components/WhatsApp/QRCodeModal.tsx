'use client'

import { useState, useEffect } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
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
  Smartphone,
  QrCode,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Wifi,
  Clock,
  Copy,
  ExternalLink,
  X
} from 'lucide-react'

export default function QRCodeModal() {
  const {
    status,
    qrCode,
    showQRCode,
    showQRCodeModal,
    hideQRCodeModal,
    connecting,
    refreshQRCode,
    fetchStatus
  } = useWhatsAppStore()

  const [refreshing, setRefreshing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(60)

  useEffect(() => {
    if (showQRCode && !status?.connected) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            refreshQRCode()
            return 60
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [showQRCode, status?.connected, refreshQRCode])

  useEffect(() => {
    if (showQRCode) {
      // Check connection status every 2 seconds
      const statusTimer = setInterval(() => {
        fetchStatus()
      }, 2000)

      return () => clearInterval(statusTimer)
    }
  }, [showQRCode, fetchStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshQRCode()
      setTimeLeft(60)
    } finally {
      setRefreshing(false)
    }
  }

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

  const handleOpenWhatsApp = () => {
    window.open('https://web.whatsapp.com/', '_blank')
  }

  if (!showQRCode || !qrCode) return null

  return (
    <Dialog open={showQRCode} onOpenChange={hideQRCodeModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            Connect WhatsApp
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with your WhatsApp mobile app to connect
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {status?.connected ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">
                WhatsApp connected successfully! You can close this dialog.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-blue-200 bg-blue-50">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700">
                {connecting ? 'Connecting...' : 'Scan the QR code below with WhatsApp'}
              </AlertDescription>
            </Alert>
          )}

          {!status?.connected && (
            <Card className="text-center">
              <CardContent className="pt-6">
                <div className="relative inline-block">
                  <div className="w-64 h-64 bg-white rounded-lg p-2 border-2 border-gray-200">
                    {qrCode ? (
                      <img
                        src={qrCode}
                        alt="WhatsApp QR Code"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          // Fallback for broken QR code
                          e.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <QrCode className="w-16 h-16 mx-auto text-gray-300 mb-2" />
                          <p className="text-sm text-gray-500">Loading QR code...</p>
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
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-500">
                      Refreshes in {timeLeft}s
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      <Smartphone className="w-3 h-3 mr-1" />
                      Mobile App Required
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Wifi className="w-3 h-3 mr-1" />
                      Internet Connection
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <div className="text-sm text-gray-600 text-center">
              <p className="font-medium mb-1">How to connect:</p>
              <ol className="text-left space-y-1 text-xs">
                <li>1. Open WhatsApp on your mobile device</li>
                <li>2. Tap Menu or Settings &gt; Linked Devices</li>
                <li>3. Tap "Link a device" or "Connect device"</li>
                <li>4. Point your camera at the QR code</li>
              </ol>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing || connecting}
                  className="flex-1"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing...' : 'Refresh QR'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  disabled={!qrCode}
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenWhatsApp}
                className="w-full"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open WhatsApp Web
              </Button>
            </div>
          </div>

          {status && (
            <Card className="bg-gray-50">
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">Status:</span>
                    <Badge variant={status.connected ? 'default' : 'secondary'}>
                      {status.connected ? 'Connected' : 'Waiting for scan'}
                    </Badge>
                  </div>

                  {status.phoneNumber && (
                    <div className="flex justify-between">
                      <span className="font-medium">Phone:</span>
                      <span>{status.phoneNumber}</span>
                    </div>
                  )}

                  {status.profileName && (
                    <div className="flex justify-between">
                      <span className="font-medium">Profile:</span>
                      <span>{status.profileName}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={hideQRCodeModal}
            >
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}