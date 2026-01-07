'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi as api } from '@/lib/api-clients'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Loader2, MapPin } from 'lucide-react'
import Link from 'next/link'

export default function ActivateServicePage() {
    const params = useParams()
    const router = useRouter()
    const customerId = params.id as string

    // Form State
    const [formData, setFormData] = useState({
        ont_sn: '',
        odp_id: '',
        odp_name: '', // fallback
        port_no: '',
        package_id: '',
        lat: '',
        lng: '',
        region_id: ''
    })

    // Fetch Customer
    const { data: customer, isLoading: loadingCustomer } = useQuery({
        queryKey: ['customer', customerId],
        queryFn: async () => {
            const res = await api.get(`/customers/${customerId}`)
            return res.data.data.customer
        }
    })

    // Fetch Packages (for selection)
    const { data: packages } = useQuery({
        queryKey: ['packages'],
        queryFn: async () => {
            const res = await api.get('/packages')
            return res.data.data
        }
    })

    // Fetch ODPs (for selection) - assume admin endpoint accessible or add to technician
    // We'll use /api/v1/odp if accessible. If not, we might need a technician/odps endpoint.
    // Assuming technician can list ODPs.
    const { data: odps } = useQuery({
        queryKey: ['odps'],
        queryFn: async () => {
            try {
                const res = await api.get('/odp') // Check if this works for technician
                return res.data.data || [] // Accessing array 
            } catch (e) {
                return []
            }
        }
    })

    const mutation = useMutation({
        mutationFn: async (data: any) => {
            return api.post(`/technician/customers/${customerId}/activate`, {
                ont_sn: data.ont_sn,
                odp_id: data.odp_id || null,
                odp_name: data.odp_name || null,
                port_no: parseInt(data.port_no),
                package_id: parseInt(data.package_id),
                region_id: data.region_id ? parseInt(data.region_id) : null,
                coordinates: {
                    lat: parseFloat(data.lat),
                    lng: parseFloat(data.lng)
                }
            })
        },
        onSuccess: () => {
            toast.success('Service Activated Successfully')
            router.push('/technician/tickets') // Go back to tickets
        },
        onError: (err: any) => {
            // toast.error(err.response?.data?.message || 'Failed to activate service')
            console.log(err)
            toast.error('Failed to activate service')
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
            // Mock for now if not https
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
            toast.error('Geolocation not supported')
        }
    }

    if (loadingCustomer) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin" /></div>

    return (
        <div className="space-y-6 max-w-3xl mx-auto pb-10">
            <div className="flex items-center gap-4">
                <Link href="/technician/tickets">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">Activate Service</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Customer Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <label className="text-muted-foreground">Name:</label>
                            <div className="font-medium">{customer?.name}</div>
                        </div>
                        <div>
                            <label className="text-muted-foreground">Address:</label>
                            <div className="font-medium">{customer?.address}</div>
                        </div>
                        <div>
                            <label className="text-muted-foreground">Phone:</label>
                            <div className="font-medium">{customer?.phone}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Technical Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">

                        <div className="space-y-2">
                            <Label>ONT / Modem Serial Number (SN)</Label>
                            <Input
                                value={formData.ont_sn}
                                onChange={e => setFormData({ ...formData, ont_sn: e.target.value })}
                                placeholder="ALCL..."
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Service Package</Label>
                                <Select
                                    value={formData.package_id ? formData.package_id.toString() : ""}
                                    onValueChange={val => setFormData({ ...formData, package_id: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Package" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {packages?.map((pkg: any) => (
                                            <SelectItem key={pkg.id} value={pkg.id.toString()}>{pkg.name} - {pkg.speed}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {/* Region handling could be added here if region API exists */}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Select ODP</Label>
                                <Select
                                    value={formData.odp_id ? formData.odp_id.toString() : "manual"}
                                    onValueChange={val => setFormData({ ...formData, odp_id: val === 'manual' ? '' : val, odp_name: val === 'manual' ? formData.odp_name : '' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose ODP" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="manual">Manual Entry / New</SelectItem>
                                        {odps?.map((odp: any) => (
                                            <SelectItem key={odp.id} value={odp.id.toString()}>{odp.name} ({odp.code})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Show ODP Name input if Manual or no ODP selected */}
                            {(!formData.odp_id) && (
                                <div className="space-y-2">
                                    <Label>ODP Name (Manual)</Label>
                                    <Input
                                        value={formData.odp_name}
                                        onChange={e => setFormData({ ...formData, odp_name: e.target.value })}
                                        placeholder="If ODP not in list"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 w-1/3">
                            <Label>Port Number</Label>
                            <Input
                                type="number"
                                value={formData.port_no}
                                onChange={e => setFormData({ ...formData, port_no: e.target.value })}
                                placeholder="1-8"
                                required
                            />
                        </div>

                        <div className="space-y-4 pt-4 border-t">
                            <Label>Coordinate Installation</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">Latitude</Label>
                                    <Input value={formData.lat} onChange={e => setFormData({ ...formData, lat: e.target.value })} required />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Longitude</Label>
                                    <Input value={formData.lng} onChange={e => setFormData({ ...formData, lng: e.target.value })} required />
                                </div>
                            </div>
                            <Button type="button" variant="secondary" className="w-full flex gap-2" onClick={handleGetCurrentLocation}>
                                <MapPin className="h-4 w-4" /> Get Current Location
                            </Button>
                        </div>

                        <Button type="submit" size="lg" className="w-full" disabled={mutation.isLoading}>
                            {mutation.isLoading ? 'Activating...' : 'Activate Service'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
