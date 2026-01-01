'use client'

import { useState, useEffect } from 'react'
import { useWhatsAppStore } from '@/store/whatsappStore'
import { whatsappAPI } from '@/lib/whatsapp-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Clock,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  RefreshCw,
  Loader2,
  TrendingUp,
  Activity,
  Zap
} from 'lucide-react'

interface QueueMessage {
  id: string
  recipient: string
  message: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  priority: 'low' | 'medium' | 'high'
  attempts: number
  maxAttempts: number
  createdAt: string
  scheduledAt?: string
  error?: string
  broadcastId?: string
  templateId?: string
}

interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  total: number
  processingSpeed: number
  avgProcessingTime: number
}

export default function MessageQueueMonitor() {
  const {
    queueStatus,
    queueLength,
    pauseQueue,
    resumeQueue,
    clearQueue,
    fetchQueueStatus
  } = useWhatsAppStore()

  const [messages, setMessages] = useState<QueueMessage[]>([])
  const [stats, setStats] = useState<QueueStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
    processingSpeed: 0,
    avgProcessingTime: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [isOperating, setIsOperating] = useState(false)

  // Fetch queue data from backend
  const fetchQueueData = async () => {
    if (isLoading) return

    setIsLoading(true)
    try {
      const response = await whatsappAPI.getQueue()
      if (response.success && response.data) {
        const queueData = response.data

        // Transform messages to our format
        const transformedMessages = (queueData.messages || []).map((msg: any) => ({
          id: msg.id,
          recipient: msg.recipient,
          message: msg.message,
          status: msg.status,
          priority: msg.priority || 'medium',
          attempts: msg.attempts || 0,
          maxAttempts: msg.maxAttempts || 3,
          createdAt: msg.createdAt,
          scheduledAt: msg.scheduledAt,
          error: msg.error,
          broadcastId: msg.broadcastId,
          templateId: msg.templateId
        }))

        setMessages(transformedMessages)

        // Calculate stats
        const newStats: QueueStats = {
          pending: queueData.summary?.pending || 0,
          processing: queueData.summary?.processing || 0,
          completed: queueData.summary?.completed || 0,
          failed: queueData.summary?.failed || 0,
          total: queueData.summary?.total || 0,
          processingSpeed: calculateProcessingSpeed(transformedMessages),
          avgProcessingTime: calculateAvgProcessingTime(transformedMessages)
        }

        setStats(newStats)
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Error fetching queue data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate processing speed (messages per minute)
  const calculateProcessingSpeed = (messages: QueueMessage[]) => {
    const completedMessages = messages.filter(msg => msg.status === 'completed')
    if (completedMessages.length === 0) return 0

    const now = new Date()
    const oneMinuteAgo = new Date(now.getTime() - 60000)

    const recentCompleted = completedMessages.filter(msg =>
      new Date(msg.createdAt) > oneMinuteAgo
    )

    return recentCompleted.length
  }

  // Calculate average processing time
  const calculateAvgProcessingTime = (messages: QueueMessage[]) => {
    const completedMessages = messages.filter(msg => msg.status === 'completed')
    if (completedMessages.length === 0) return 0

    const totalTime = completedMessages.reduce((sum, msg) => {
      const created = new Date(msg.createdAt).getTime()
      const now = Date.now()
      return sum + (now - created)
    }, 0)

    return Math.round(totalTime / completedMessages.length / 1000) // Convert to seconds
  }

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchQueueData()

    const interval = setInterval(fetchQueueData, 5000)
    return () => clearInterval(interval)
  }, [])

  // Handle queue operations
  const handlePauseQueue = async () => {
    setIsOperating(true)
    try {
      await pauseQueue()
      setTimeout(fetchQueueData, 1000)
    } catch (error) {
      console.error('Error pausing queue:', error)
    } finally {
      setIsOperating(false)
    }
  }

  const handleResumeQueue = async () => {
    setIsOperating(true)
    try {
      await resumeQueue()
      setTimeout(fetchQueueData, 1000)
    } catch (error) {
      console.error('Error resuming queue:', error)
    } finally {
      setIsOperating(false)
    }
  }

  const handleClearQueue = async () => {
    if (!confirm('Are you sure you want to clear all pending messages? This action cannot be undone.')) {
      return
    }

    setIsOperating(true)
    try {
      await clearQueue()
      setTimeout(fetchQueueData, 1000)
    } catch (error) {
      console.error('Error clearing queue:', error)
    } finally {
      setIsOperating(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
      case 'processing':
        return 'bg-blue-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />
      case 'failed':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Message Queue Monitor</h3>
          <Badge variant="outline" className="text-xs">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <RefreshCw className="w-4 h-4 animate-spin text-gray-500" />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchQueueData}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Queue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
              <div className="flex-1">
                <Progress value={(stats.pending / stats.total) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-500" />
              Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
              <div className="flex-1">
                <Progress value={(stats.processing / stats.total) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="flex-1">
                <Progress value={(stats.completed / stats.total) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="flex-1">
                <Progress value={(stats.failed / stats.total) * 100} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              Processing Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.processingSpeed}
              <span className="text-sm font-normal text-gray-500 ml-1">msg/min</span>
            </div>
            <div className="text-xs text-gray-500">Last 1 minute</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-500" />
              Avg Processing Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {stats.avgProcessingTime}
              <span className="text-sm font-normal text-gray-500 ml-1">s</span>
            </div>
            <div className="text-xs text-gray-500">Per message</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0}
              <span className="text-sm font-normal text-gray-500 ml-1">%</span>
            </div>
            <div className="text-xs text-gray-500">Overall success rate</div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Queue Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge variant={queueStatus === 'processing' ? 'default' : 'secondary'}>
                Status: {queueStatus}
              </Badge>
              <span className="text-sm text-gray-500">
                ({stats.total} total messages)
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {queueStatus === 'processing' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePauseQueue}
                  disabled={isOperating}
                >
                  <Pause className="w-4 h-4 mr-2" />
                  {isOperating ? 'Pausing...' : 'Pause'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResumeQueue}
                  disabled={isOperating}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isOperating ? 'Resuming...' : 'Resume'}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleClearQueue}
                disabled={isOperating || stats.pending === 0}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {isOperating ? 'Clearing...' : 'Clear Pending'}
              </Button>
            </div>
          </div>

          {queueStatus === 'idle' && stats.pending > 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Queue is idle with {stats.pending} pending messages. Click Resume to start processing.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No messages in queue</p>
              </div>
            ) : (
              messages.slice(0, 10).map((message) => (
                <div
                  key={message.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className={`w-2 h-2 rounded-full mt-2 ${getStatusColor(message.status)}`}></div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 text-xs ${getStatusColor(message.status).replace('bg-', 'text-')}`}>
                        {getStatusIcon(message.status)}
                      </span>
                      <Badge variant="outline" className={`text-xs ${getPriorityColor(message.priority)}`}>
                        {message.priority}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </span>
                      {message.broadcastId && (
                        <Badge variant="outline" className="text-xs">
                          Broadcast
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium text-gray-900 mb-1">
                      {message.recipient}
                    </p>

                    <p className="text-sm text-gray-600 line-clamp-2 mb-1">
                      {message.message}
                    </p>

                    {message.error && (
                      <p className="text-xs text-red-600">
                        Error: {message.error}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Attempt {message.attempts}/{message.maxAttempts}</span>
                      {message.templateId && (
                        <span>Template: {message.templateId}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {messages.length > 10 && (
            <div className="text-center mt-4">
              <Button variant="outline" size="sm">
                View All Messages ({messages.length})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}