'use client'

import { useState, useEffect } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { useWhatsAppWebSocket } from '@/hooks/useWhatsAppWebSocket'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Bell,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  X,
  Clock,
  User,
  Info,
  Trash2,
  Settings
} from 'lucide-react'

interface RealTimeNotification {
  id: string
  type: 'message' | 'status' | 'queue' | 'error' | 'success'
  title: string
  message: string
  timestamp: Date
  read: boolean
  metadata?: {
    recipient?: string
    status?: string
    count?: number
    error?: string
  }
}

export default function RealTimeNotifications() {
  const { status } = useWhatsAppStore()
  const [notifications, setNotifications] = useState<RealTimeNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  // WebSocket integration for real-time notifications
  useWhatsAppWebSocket({
    onConnectionChange: (connected) => {
      addNotification({
        type: 'status',
        title: connected ? 'WhatsApp Connected' : 'WhatsApp Disconnected',
        message: connected ? 'WhatsApp service is now online' : 'WhatsApp service has been disconnected',
        metadata: { status: connected ? 'connected' : 'disconnected' }
      })
    },
    onMessageReceived: (data) => {
      addNotification({
        type: 'message',
        title: 'New Message Received',
        message: `Message from ${data.recipient || 'Unknown sender'}`,
        metadata: { recipient: data.recipient }
      })
    },
    onQueueUpdate: (data) => {
      addNotification({
        type: 'queue',
        title: 'Queue Updated',
        message: `Queue status: ${data.status || 'updated'}`,
        metadata: { count: data.count }
      })
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Connection Error',
        message: error.message,
        metadata: { error: error.message }
      })
    }
  })

  // Add a new notification
  const addNotification = (notification: Omit<RealTimeNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: RealTimeNotification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false
    }

    setNotifications(prev => [newNotification, ...prev].slice(0, 50)) // Keep last 50
    setUnreadCount(prev => prev + 1)

    // Auto-remove error notifications after 10 seconds
    if (notification.type === 'error') {
      setTimeout(() => {
        removeNotification(newNotification.id)
      }, 10000)
    }
  }

  // Remove a notification
  const removeNotification = (id: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id)
      if (notification && !notification.read) {
        setUnreadCount(c => Math.max(0, c - 1))
      }
      return prev.filter(n => n.id !== id)
    })
  }

  // Mark notification as read
  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, read: true } : n
    ))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  // Mark all as read
  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  // Clear all notifications
  const clearAllNotifications = () => {
    setNotifications([])
    setUnreadCount(0)
  }

  // Get notification icon
  const getNotificationIcon = (type: RealTimeNotification['type']) => {
    switch (type) {
      case 'message':
        return <MessageSquare className="w-4 h-4 text-blue-500" />
      case 'status':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'queue':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      default:
        return <Info className="w-4 h-4 text-gray-500" />
    }
  }

  // Get notification color
  const getNotificationColor = (type: RealTimeNotification['type']) => {
    switch (type) {
      case 'message':
        return 'border-blue-200 bg-blue-50'
      case 'status':
        return 'border-green-200 bg-green-50'
      case 'queue':
        return 'border-yellow-200 bg-yellow-50'
      case 'error':
        return 'border-red-200 bg-red-50'
      case 'success':
        return 'border-green-200 bg-green-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-500" />
            Real-Time Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-4 h-4" />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
              >
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllNotifications}
              disabled={notifications.length === 0}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Bell className="w-12 h-12 mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold mb-2">No Notifications</h3>
              <p className="text-sm text-center">
                Real-time notifications will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`relative p-3 rounded-lg border transition-all ${
                    getNotificationColor(notification.type)
                  } ${!notification.read ? 'shadow-sm' : 'opacity-75'}`}
                >
                  <div className="flex items-start gap-3">
                    {getNotificationIcon(notification.type)}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-sm font-medium text-gray-900">
                          {notification.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(notification.timestamp)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeNotification(notification.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 mb-2">
                        {notification.message}
                      </p>

                      {notification.metadata && (
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {notification.metadata.recipient && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {notification.metadata.recipient}
                            </div>
                          )}
                          {notification.metadata.status && (
                            <Badge variant="outline" className="text-xs">
                              {notification.metadata.status}
                            </Badge>
                          )}
                          {notification.metadata.count !== undefined && (
                            <div className="flex items-center gap-1">
                              Count: {notification.metadata.count}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {!notification.read && (
                      <div className="absolute top-3 left-3">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      </div>
                    )}
                  </div>

                  {!notification.read && (
                    <div
                      className="absolute inset-0 cursor-pointer"
                      onClick={() => markAsRead(notification.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>

      {/* Settings Panel */}
      {showSettings && (
        <div className="border-t p-4">
          <h4 className="font-medium mb-3">Notification Settings</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Message notifications</span>
              <Badge variant="outline">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Status updates</span>
              <Badge variant="outline">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Queue updates</span>
              <Badge variant="outline">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Error notifications</span>
              <Badge variant="outline">Enabled</Badge>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}