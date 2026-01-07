'use client'

import { AdminLayout } from '@/components/layout/AdminLayout'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { FullPageLoader } from '@/components/ui'

export default function TechnicianLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, isAuthenticated } = useAuthStore()
    const router = useRouter()

    useEffect(() => {
        if (isAuthenticated && user && user.role !== 'technician' && user.role !== 'admin') {
            // Optional: Redirect if not technician or admin
            // router.push('/admin/dashboard') 
        }
    }, [isAuthenticated, user, router])

    if (!isAuthenticated) return null; // AdminLayout handles redirect

    return <AdminLayout>{children}</AdminLayout>
}
