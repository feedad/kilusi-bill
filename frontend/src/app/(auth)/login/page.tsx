'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAppStore } from '@/store/appStore'
import { Button, Input, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { Server } from 'lucide-react'
import { LoginFormData } from '@/types'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading } = useAuthStore()
  const { addNotification } = useAppStore()

  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
    remember: false,
  })

  const [errors, setErrors] = useState<Partial<LoginFormData>>({})

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginFormData> = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    try {
      await login(formData.username, formData.password)

      addNotification({
        type: 'success',
        title: 'Login Successful',
        message: 'Welcome back to Kilusi Bill!',
      })

      // Redirect based on user role
      const user = useAuthStore.getState().user
      if (user?.role === 'admin') {
        router.push('/admin/dashboard')
      } else if (user?.role === 'technician') {
        router.push('/technician/dashboard')
      } else {
        router.push('/customer/dashboard')
      }
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Login Failed',
        message: error instanceof Error ? error.message : 'Invalid credentials',
      })
    }
  }

  const handleInputChange = (field: keyof LoginFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary-600">
            <Server className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link href="/register" className="font-medium text-primary-600 hover:text-primary-500">
              register for a new account
            </Link>
          </p>
        </div>

        {/* Login Form */}
        <Card>
          <CardHeader>
            <CardTitle>Login</CardTitle>
            <CardDescription>
              Enter your credentials to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                id="username"
                type="text"
                label="Username"
                placeholder="Enter your username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                error={errors.username}
                disabled={isLoading}
                autoComplete="username"
                required
              />

              <Input
                id="password"
                type="password"
                label="Password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                error={errors.password}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={formData.remember}
                    onChange={(e) => handleInputChange('remember', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <Link href="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500">
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                loading={isLoading}
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            {/* Demo credentials */}
            <div className="mt-6 border-t pt-6">
              <div className="text-sm text-gray-600">
                <p className="font-medium mb-2">Demo Credentials:</p>
                <div className="space-y-1 text-xs">
                  <p><strong>Admin:</strong> admin / admin123</p>
                  <p><strong>Technician:</strong> tech / password</p>
                  <p><strong>Customer:</strong> customer / password</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}