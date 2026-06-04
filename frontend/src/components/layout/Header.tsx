import React, { useEffect, useState } from 'react'
import { Menu, Bell, Clock, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme, unreadServerNotifications, serverNotifications, fetchServerNotifications, markServerNotificationRead, addNotification } = useAppStore()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [serverTime, setServerTime] = useState('')

  // Fetch notifications periodically
  useEffect(() => {
    fetchServerNotifications()
    const interval = setInterval(fetchServerNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  // Update server time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const timeStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        + ' WIB'
      setServerTime(timeStr)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
    addNotification({
      type: 'info',
      title: 'Theme Changed',
      message: `Switched to ${theme === 'light' ? 'dark' : 'light'} mode`,
    })
  }

  return (
    <header className="bg-card/80 backdrop-blur-sm shadow-sm sticky top-0 z-40 w-full border-b">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Menu button and Server Time */}
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Server Time */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              <Clock className="h-3.5 w-3.5 hidden sm:block" />
              <span className="hidden sm:inline font-medium">WAKTU SERVER :</span>
              <span className="font-mono tabular-nums">{serverTime || '...'}</span>
            </div>
          </div>

          {/* Right side - Notifications, Theme, Settings */}
          <div className="flex items-center space-x-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="rounded-xl hover:bg-muted"
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
            </Button>

            {/* Notifications */}
            <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <PopoverTrigger asChild>
                <div className="relative">
                  <Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    {unreadServerNotifications > 0 && (
                      <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                        {unreadServerNotifications > 9 ? '9+' : unreadServerNotifications}
                      </span>
                    )}
                  </Button>
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="p-4 border-b">
                  <h4 className="font-semibold leading-none">Notifikasi</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Anda memiliki {unreadServerNotifications} notifikasi belum dibaca
                  </p>
                </div>
                <ScrollArea className="h-[300px]">
                  {serverNotifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Tidak ada notifikasi
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      {serverNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-4 border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors ${!notif.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                          onClick={() => !notif.is_read && markServerNotificationRead(notif.id)}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-sm">{notif.title}</span>
                            {!notif.is_read && <span className="h-2 w-2 rounded-full bg-blue-500 block mt-1" />}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {notif.message}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: id })}
                            </span>
                            {notif.type === 'registration' && (
                              <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                                Pendaftaran
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>

          </div>
        </div>
      </div>
    </header>
  )
}
