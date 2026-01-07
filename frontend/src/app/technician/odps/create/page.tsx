'use client'

import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function CreateOdpPage() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        lat: '',
        lng: '',
        address: '',
        capacity: 8
    })

    const mutation = useMutation({
        mutationFn: async (data: any) => {
            return api.post('/technician/odps', {
                name: data.name,
                code: data.code,
                coordinates: {
                    lat: parseFloat(data.lat),
                    lng: parseFloat(data.lng)
                },
                address: data.address,
                capacity: parseInt(data.capacity)
            })
        },
        onSuccess: () => {
            toast.success('ODP Created Successfully')
            router.push('/technician')
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to create ODP')
        }
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.lat || !formData.lng) {
            toast.error('Coordinates are required')
            return;
        }
        mutation.mutate(formData)
    }

    const handleGetCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        lat: position.coords.latitude.toString(),
                        lng: position.coords.longitude.toString()
                    }))
                    toast.success('Location updated')
                },
                (error) => {
                    toast.error('Error getting location: ' + error.message)
                }
            )
        } else {
            toast.error('Geolocation is not supported by this browser.')
        }
    }

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
                <Link href="/technician">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">Add New ODP</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>ODP Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>ODP Name</Label>
                                <Input
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="ODP-01-T01"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>ODP Code</Label>
                                <Input
                                    value={formData.code}
                                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                                    placeholder="Unique Code"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Address / Description</Label>
                            <Input
                                value={formData.address}
                                onChange={e => setFormData({ ...formData, address: e.target.value })}
                                placeholder="Location detail"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Capacity (Ports)</Label>
                                <Input
                                    type="number"
                                    value={formData.capacity}
                                    onChange={e => setFormData({ ...formData, capacity: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Latitude</Label>
                                <Input
                                    value={formData.lat}
                                    onChange={e => setFormData({ ...formData, lat: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Longitude</Label>
                                <Input
                                    value={formData.lng}
                                    onChange={e => setFormData({ ...formData, lng: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <Button type="button" variant="secondary" className="w-full" onClick={handleGetCurrentLocation}>
                            Get Current Location
                        </Button>

                        <Button type="submit" className="w-full" disabled={mutation.isLoading}>
                            {mutation.isLoading ? 'Creating...' : 'Create ODP'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
