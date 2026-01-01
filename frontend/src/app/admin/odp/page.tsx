'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Plus,
  Edit,
  Trash2,
  Info,
  Wifi,
  MapPin,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  Filter
} from 'lucide-react'
import { toast } from 'sonner'
import SimpleNetworkMap from '@/components/SimpleNetworkMap'
import CoordinateMap from '@/components/CoordinateMap'
import { useAuthStore } from '@/store/authStore'

// Types
interface ODP {
  id: number
  name: string
  code: string
  address?: string
  latitude?: number
  longitude?: number
  capacity: number
  used_ports: number
  status: 'active' | 'maintenance' | 'inactive'
  parent_odp_id?: number
  parent_name?: string
  parent_code?: string
  notes?: string
  connected_customers?: number
  active_connections?: number
  utilization_percentage?: number
  created_at: string
  updated_at: string
}

interface Customer {
  customer_id: string
  name: string
  phone?: string
  address?: string
  latitude?: number
  longitude?: number
  status: 'online' | 'offline' | 'suspended'
}

interface CableRoute {
  id: number
  odp_id: number
  customer_id: string
  status: 'connected' | 'disconnected' | 'maintenance' | 'damaged'
  cable_length?: number
  port_number?: number
  customer_name?: string
  customer_address?: string
  customer_latitude?: number
  customer_longitude?: number
}

interface ODPStats {
  total_odps: number
  active_odps: number
  maintenance_odps: number
  inactive_odps: number
  total_cable_routes: number
  connected_routes: number
  disconnected_routes: number
  maintenance_routes: number
  total_capacity: number
  total_used_ports: number
  mapped_customers: number
}

interface ODPCardProps {
  odp: ODP
  onEdit: (odp: ODP) => void
  onDelete: (odp: ODP) => void
  onViewDetails: (odp: ODP) => void
}

function ODPCard({ odp, onEdit, onDelete, onViewDetails }: ODPCardProps) {
  const statusConfig = {
    active: { color: 'bg-green-500', icon: CheckCircle, label: 'Active' },
    maintenance: { color: 'bg-yellow-500', icon: AlertTriangle, label: 'Maintenance' },
    inactive: { color: 'bg-gray-500', icon: XCircle, label: 'Inactive' }
  }

  const status = statusConfig[odp.status] || statusConfig.active
  const utilization = parseFloat(odp.utilization_percentage) || 0

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${status.color}`}>
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{odp.name}</h3>
              <p className="text-sm text-muted-foreground">{odp.code}</p>
            </div>
          </div>
          <Badge variant={odp.status === 'active' ? 'default' : 'secondary'}>
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-start space-x-2 text-sm">
          <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
          <span className="text-muted-foreground line-clamp-2">
            {odp.address || 'No address specified'}
          </span>
        </div>

        {odp.parent_name && (
          <div className="text-xs text-info bg-blue-50 p-2 rounded">
            <strong>Sub ODP dari:</strong> {odp.parent_name} ({odp.parent_code})
          </div>
        )}

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Port Usage</span>
            <span>{odp.connected_customers || 0}/{odp.capacity}</span>
          </div>
          <Progress
            value={utilization}
            className={`h-2 ${utilization >= 90 ? 'bg-red-100' : utilization >= 70 ? 'bg-yellow-100' : 'bg-green-100'}`}
          />
          <p className="text-xs text-muted-foreground">{utilization.toFixed(1)}% utilized</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-primary">{odp.connected_customers || 0}</p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{odp.active_connections || 0}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
        </div>

        <div className="flex space-x-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(odp)}
            className="flex-1"
          >
            <Edit className="w-4 h-4 mr-1" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(odp)}
            className="flex-1"
          >
            <Info className="w-4 h-4 mr-1" /> Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(odp)}
            disabled={(odp.connected_customers || 0) > 0}
            title={(odp.connected_customers || 0) > 0 ? 'Cannot delete ODP with connected customers' : 'Delete ODP'}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ODPStatsCards({ stats }: { stats: ODPStats | null }) {
  if (!stats) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total ODPs</CardTitle>
          <Wifi className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total_odps}</div>
          <p className="text-xs text-muted-foreground">
            {stats.active_odps} active, {stats.maintenance_odps} maintenance
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Port Utilization</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.total_capacity > 0 ?
              ((stats.total_used_ports / stats.total_capacity) * 100).toFixed(1) : 0}%
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.total_used_ports} of {stats.total_capacity} ports used
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cable Routes</CardTitle>
          <MapPin className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total_cable_routes}</div>
          <p className="text-xs text-muted-foreground">
            {stats.connected_routes} connected, {stats.maintenance_routes} maintenance
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Mapped Customers</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.mapped_customers}</div>
          <p className="text-xs text-muted-foreground">
            Customers with location data
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ODPManagementPage() {
  const { token, isAuthenticated } = useAuthStore()

  // Debug token
  console.log('=== ODP Page Auth Debug ===')
  console.log('Is authenticated:', isAuthenticated)
  console.log('Token exists:', !!token)
  console.log('Token length:', token?.length || 0)
  console.log('Token preview:', token ? `${token.substring(0, 20)}...` : 'null')
  const [odps, setODPs] = useState<ODP[]>([])
  const [stats, setStats] = useState<ODPStats | null>(null)
  const [parentODPs, setParentODPs] = useState<ODP[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [cableRoutes, setCableRoutes] = useState<CableRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Network map ref
  const networkMapRef = useRef<any>(null)

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isNetworkMapModalOpen, setIsNetworkMapModalOpen] = useState(false)
  const [selectedODP, setSelectedODP] = useState<ODP | null>(null)
  const [selectedCableRoute, setSelectedCableRoute] = useState<CableRoute | null>(null)
  const [isCreateCableRouteModalOpen, setIsCreateCableRouteModalOpen] = useState(false)
  const [isEditCableRouteModalOpen, setIsEditCableRouteModalOpen] = useState(false)

  // Filter states
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [parentFilter, setParentFilter] = useState<string>('all')

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    latitude: '',
    longitude: '',
    capacity: '64',
    status: 'active' as 'active' | 'maintenance' | 'inactive',
    parent_odp_id: '',
    notes: ''
  })
  const [cableRouteFormData, setCableRouteFormData] = useState({
    odp_id: '',
    customer_id: '',
    cable_length: '',
    port_number: '',
    status: 'connected' as 'connected' | 'disconnected' | 'maintenance' | 'damaged',
    installation_date: '',
    notes: ''
  })
  const [formLoading, setFormLoading] = useState(false)
  const [cableFormLoading, setCableFormLoading] = useState(false)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  // Fetch data
  const fetchODPs = async () => {
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (parentFilter !== 'all') params.append('parent_odp_id', parentFilter)

      const response = await fetch(`${API_BASE}/api/v1/odp?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) throw new Error('Failed to fetch ODPs')

      const result = await response.json()
      setODPs(Array.isArray(result.data) ? result.data : [])
    } catch (err) {
      console.error('Error fetching ODPs:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch ODPs')
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/odp/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch stats')

      const result = await response.json()
      setStats(result.data)
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  const fetchParentODPs = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/odp/parents`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch parent ODPs')

      const result = await response.json()
      setParentODPs(Array.isArray(result.data) ? result.data : [])
    } catch (err) {
      console.error('Error fetching parent ODPs:', err)
    }
  }

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/customers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch customers')

      const result = await response.json()
      console.log('Customers API response:', result)
      // API returns { success: true, data: { customers: [...], pagination: {...} } }
      const customersData = result.data?.customers || []
      console.log('Extracted customers data:', customersData)
      setCustomers(Array.isArray(customersData) ? customersData : [])
    } catch (err) {
      console.error('Error fetching customers:', err)
      setCustomers([]) // Ensure customers is always an array
    }
  }

  const fetchCableRoutes = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/cable-routes`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch cable routes')

      const result = await response.json()
      setCableRoutes(Array.isArray(result.data) ? result.data : [])
    } catch (err) {
      console.error('Error fetching cable routes:', err)
      setCableRoutes([]) // Ensure cableRoutes is always an array
    }
  }

  useEffect(() => {
    const loadData = async () => {
      if (!isAuthenticated || !token) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        await Promise.all([fetchODPs(), fetchStats(), fetchParentODPs(), fetchCustomers(), fetchCableRoutes()])
        // Refresh network map after data is loaded
        if (networkMapRef.current) {
          await networkMapRef.current.refreshData()
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [searchTerm, statusFilter, parentFilter, isAuthenticated, token])

  // Form handlers
  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      address: '',
      latitude: '',
      longitude: '',
      capacity: '64',
      status: 'active',
      parent_odp_id: '',
      notes: ''
    })
  }

  const handleCreateODP = async () => {
    setFormLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/odp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create ODP')
      }

      toast.success('ODP created successfully')
      setIsCreateModalOpen(false)
      resetForm()
      fetchODPs()
      fetchStats()
    } catch (err) {
      console.error('Error creating ODP:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create ODP')
    } finally {
      setFormLoading(false)
    }
  }

  const handleEditODP = async () => {
    if (!selectedODP) return

    setFormLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/odp/${selectedODP.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update ODP')
      }

      toast.success('ODP updated successfully')
      setIsEditModalOpen(false)
      resetForm()
      setSelectedODP(null)
      fetchODPs()
      fetchStats()
    } catch (err) {
      console.error('Error updating ODP:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to update ODP')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteODP = async (odp: ODP) => {
    if (!confirm(`Are you sure you want to delete ODP "${odp.name}"?`)) return

    try {
      const response = await fetch(`${API_BASE}/api/v1/odp/${odp.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete ODP')
      }

      toast.success('ODP deleted successfully')
      fetchODPs()
      fetchStats()
    } catch (err) {
      console.error('Error deleting ODP:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to delete ODP')
    }
  }

  const openEditModal = (odp: ODP) => {
    setSelectedODP(odp)
    setFormData({
      name: odp.name,
      code: odp.code,
      address: odp.address || '',
      latitude: odp.latitude?.toString() || '',
      longitude: odp.longitude?.toString() || '',
      capacity: odp.capacity.toString(),
      status: odp.status,
      parent_odp_id: odp.parent_odp_id?.toString() || '',
      notes: odp.notes || ''
    })
    setIsEditModalOpen(true)
  }

  const openDetailModal = (odp: ODP) => {
    setSelectedODP(odp)
    setIsDetailModalOpen(true)
  }

  // Cable Route handlers
  const resetCableRouteForm = () => {
    setCableRouteFormData({
      odp_id: '',
      customer_id: '',
      cable_length: '',
      port_number: '',
      status: 'connected',
      installation_date: '',
      notes: ''
    })
  }

  const handleCreateCableRoute = async () => {
    setCableFormLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/cable-routes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cableRouteFormData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create cable route')
      }

      toast.success('Cable route created successfully')
      setIsCreateCableRouteModalOpen(false)
      resetCableRouteForm()
      fetchCableRoutes()
      fetchStats()
    } catch (err) {
      console.error('Error creating cable route:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to create cable route')
    } finally {
      setCableFormLoading(false)
    }
  }

  const handleEditCableRoute = async () => {
    if (!selectedCableRoute) return

    setCableFormLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/v1/cable-routes/${selectedCableRoute.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cableRouteFormData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update cable route')
      }

      toast.success('Cable route updated successfully')
      setIsEditCableRouteModalOpen(false)
      resetCableRouteForm()
      setSelectedCableRoute(null)
      fetchCableRoutes()
      fetchStats()
    } catch (err) {
      console.error('Error updating cable route:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to update cable route')
    } finally {
      setCableFormLoading(false)
    }
  }

  const handleDeleteCableRoute = async (route: CableRoute) => {
    if (!confirm(`Are you sure you want to delete cable route #${route.id}?`)) return

    try {
      const response = await fetch(`${API_BASE}/api/v1/cable-routes/${route.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to delete cable route')
      }

      toast.success('Cable route deleted successfully')
      fetchCableRoutes()
      fetchStats()
    } catch (err) {
      console.error('Error deleting cable route:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to delete cable route')
    }
  }

  const openEditCableRouteModal = (route: CableRoute) => {
    setSelectedCableRoute(route)
    setCableRouteFormData({
      odp_id: route.odp_id.toString(),
      customer_id: route.customer_id,
      cable_length: route.cable_length?.toString() || '',
      port_number: route.port_number?.toString() || '',
      status: route.status,
      installation_date: route.installation_date || '',
      notes: ''
    })
    setIsEditCableRouteModalOpen(true)
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Authentication Required</h3>
          <p className="text-muted-foreground">Please login to access ODP Management</p>
          <Button
            className="mt-4"
            onClick={() => window.location.href = '/admin/login'}
          >
            Go to Login
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ODP Management</h1>
          <p className="text-muted-foreground">
            Manage Optical Distribution Points and cable infrastructure
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsNetworkMapModalOpen(true)}
        >
          <Wifi className="mr-2 h-4 w-4" />
          Network Map Preview
        </Button>
      </div>

  
      {/* Create ODP Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
              <DialogTitle>Create New ODP</DialogTitle>
              <DialogDescription>
                Add a new Optical Distribution Point to the network
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">ODP Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter ODP name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">ODP Code *</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="Enter ODP code"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_odp_id">Parent ODP (Optional)</Label>
                <Select
                  value={formData.parent_odp_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, parent_odp_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent ODP (for Sub-ODP)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Main ODP)</SelectItem>
                    {parentODPs.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id.toString()}>
                        {parent.name} ({parent.code}) - {parent.used_ports}/{parent.capacity} ports
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Enter ODP address"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-medium">Lokasi ODP</Label>
                <CoordinateMap
                  latitude={formData.latitude ? parseFloat(formData.latitude) : -6.5715}
                  longitude={formData.longitude ? parseFloat(formData.longitude) : 107.7547}
                  address={formData.address}
                  onCoordinatesChange={(lat, lng) => {
                    setFormData(prev => ({
                      ...prev,
                      latitude: lat.toString(),
                      longitude: lng.toString()
                    }))
                  }}
                  readOnly={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    max="128"
                    value={formData.capacity}
                    onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: 'active' | 'maintenance' | 'inactive') =>
                      setFormData(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes about this ODP"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={formLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleCreateODP}
                disabled={formLoading || !formData.name || !formData.code}
              >
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create ODP
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* Main Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">ODP</TabsTrigger>
          <TabsTrigger value="cable-routes">Cable Routes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">ODP Management</h2>
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add ODP
            </Button>
          </div>

          {/* Statistics Cards */}
          <ODPStatsCards stats={stats} />

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search ODPs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={parentFilter} onValueChange={setParentFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Parent ODP" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Parents</SelectItem>
                    {parentODPs.map((parent) => (
                      <SelectItem key={parent.id} value={parent.id.toString()}>
                        {parent.name} ({parent.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* ODP List */}
          {error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : odps.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Wifi className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No ODPs Found</h3>
                <p className="text-muted-foreground text-center mb-4">
                  {searchTerm || statusFilter !== 'all' || parentFilter !== 'all'
                    ? 'Try adjusting your filters or search terms.'
                    : 'Get started by creating your first Optical Distribution Point.'}
                </p>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add First ODP
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {odps.map((odp) => (
                <ODPCard
                  key={odp.id}
                  odp={odp}
                  onEdit={openEditModal}
                  onDelete={handleDeleteODP}
                  onViewDetails={openDetailModal}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cable-routes" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cable Routes Management</h2>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">
                {cableRoutes.length} routes
              </Badge>
              <Button onClick={() => setIsCreateCableRouteModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Cable Route
              </Button>
            </div>
          </div>

          {/* Cable Routes Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Routes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{cableRoutes.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Connected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {cableRoutes.filter(r => r.status === 'connected').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Disconnected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-600">
                  {cableRoutes.filter(r => r.status === 'disconnected').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Maintenance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {cableRoutes.filter(r => r.status === 'maintenance').length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cable Routes List */}
          <Card>
            <CardHeader>
              <CardTitle>All Cable Routes</CardTitle>
              <CardDescription>
                Manage connections between ODPs and customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {cableRoutes.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Cable Routes Found</h3>
                  <p className="text-muted-foreground">
                    No cable routes have been created yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cableRoutes.map((route) => (
                    <div key={route.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <Badge variant={route.status === 'connected' ? 'default' : 'secondary'}>
                              {route.status}
                            </Badge>
                            <span className="font-medium">Route #{route.id}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <div>ODP ID: {route.odp_id} → Customer: {route.customer_name || route.customer_id}</div>
                            {route.cable_length && <div>Cable Length: {route.cable_length}m</div>}
                            {route.port_number && <div>Port: {route.port_number}</div>}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditCableRouteModal(route)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCableRoute(route)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Edit Modal (similar to create modal but with pre-filled data) */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit ODP</DialogTitle>
            <DialogDescription>
              Update ODP information and configuration
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Same form fields as create modal but pre-filled with selectedODP data */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">ODP Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter ODP name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-code">ODP Code *</Label>
                <Input
                  id="edit-code"
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="Enter ODP code"
                />
              </div>
            </div>

            {/* ... other form fields ... */}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleEditODP}
              disabled={formLoading || !formData.name || !formData.code}
            >
              {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update ODP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Network Map Preview Modal */}
      <Dialog open={isNetworkMapModalOpen} onOpenChange={setIsNetworkMapModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Network Map Preview</DialogTitle>
            <DialogDescription>
              Preview of the ODP and customer network map
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="h-[500px] w-full border rounded-lg overflow-hidden">
              <SimpleNetworkMap />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsNetworkMapModalOpen(false)}
              >
                Close
              </Button>
              <Button
                onClick={() => window.open('/admin/network-map', '_blank')}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Open Full Network Map
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Cable Route Modal */}
      <Dialog open={isCreateCableRouteModalOpen} onOpenChange={setIsCreateCableRouteModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Cable Route</DialogTitle>
            <DialogDescription>
              Add a new cable route connection between ODP and customer
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cable-odp">ODP *</Label>
                <Select
                  value={cableRouteFormData.odp_id}
                  onValueChange={(value) => setCableRouteFormData(prev => ({ ...prev, odp_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ODP" />
                  </SelectTrigger>
                  <SelectContent>
                    {odps.map((odp) => (
                      <SelectItem key={odp.id} value={odp.id.toString()}>
                        {odp.name} ({odp.code}) - {odp.used_ports}/{odp.capacity} ports used
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cable-customer">Customer ID *</Label>
                <Select
                  value={cableRouteFormData.customer_id}
                  onValueChange={(value) => setCableRouteFormData(prev => ({ ...prev, customer_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.customer_id} value={customer.customer_id}>
                        {customer.name} ({customer.customer_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cable-length">Cable Length (meters)</Label>
                <Input
                  id="cable-length"
                  type="number"
                  value={cableRouteFormData.cable_length}
                  onChange={(e) => setCableRouteFormData(prev => ({ ...prev, cable_length: e.target.value }))}
                  placeholder="Enter cable length"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port-number">Port Number</Label>
                <Input
                  id="port-number"
                  type="number"
                  value={cableRouteFormData.port_number}
                  onChange={(e) => setCableRouteFormData(prev => ({ ...prev, port_number: e.target.value }))}
                  placeholder="Enter port number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cable-status">Status</Label>
                <Select
                  value={cableRouteFormData.status}
                  onValueChange={(value: 'connected' | 'disconnected' | 'maintenance' | 'damaged') =>
                    setCableRouteFormData(prev => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="connected">Connected</SelectItem>
                    <SelectItem value="disconnected">Disconnected</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="installation-date">Installation Date</Label>
                <Input
                  id="installation-date"
                  type="date"
                  value={cableRouteFormData.installation_date}
                  onChange={(e) => setCableRouteFormData(prev => ({ ...prev, installation_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cable-notes">Notes</Label>
              <Textarea
                id="cable-notes"
                value={cableRouteFormData.notes}
                onChange={(e) => setCableRouteFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this cable route"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateCableRouteModalOpen(false)}
              disabled={cableFormLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleCreateCableRoute}
              disabled={cableFormLoading || !cableRouteFormData.odp_id || !cableRouteFormData.customer_id}
            >
              {cableFormLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Cable Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Cable Route Modal */}
      <Dialog open={isEditCableRouteModalOpen} onOpenChange={setIsEditCableRouteModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Cable Route</DialogTitle>
            <DialogDescription>
              Update cable route information and configuration
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cable-odp">ODP *</Label>
                <Select
                  value={cableRouteFormData.odp_id}
                  onValueChange={(value) => setCableRouteFormData(prev => ({ ...prev, odp_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select ODP" />
                  </SelectTrigger>
                  <SelectContent>
                    {odps.map((odp) => (
                      <SelectItem key={odp.id} value={odp.id.toString()}>
                        {odp.name} ({odp.code}) - {odp.used_ports}/{odp.capacity} ports used
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cable-customer">Customer ID *</Label>
                <Select
                  value={cableRouteFormData.customer_id}
                  onValueChange={(value) => setCableRouteFormData(prev => ({ ...prev, customer_id: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.customer_id} value={customer.customer_id}>
                        {customer.name} ({customer.customer_id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cable-length">Cable Length (meters)</Label>
                <Input
                  id="edit-cable-length"
                  type="number"
                  value={cableRouteFormData.cable_length}
                  onChange={(e) => setCableRouteFormData(prev => ({ ...prev, cable_length: e.target.value }))}
                  placeholder="Enter cable length"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-port-number">Port Number</Label>
                <Input
                  id="edit-port-number"
                  type="number"
                  value={cableRouteFormData.port_number}
                  onChange={(e) => setCableRouteFormData(prev => ({ ...prev, port_number: e.target.value }))}
                  placeholder="Enter port number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-cable-status">Status</Label>
                <Select
                  value={cableRouteFormData.status}
                  onValueChange={(value: 'connected' | 'disconnected' | 'maintenance' | 'damaged') =>
                    setCableRouteFormData(prev => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="connected">Connected</SelectItem>
                    <SelectItem value="disconnected">Disconnected</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-installation-date">Installation Date</Label>
                <Input
                  id="edit-installation-date"
                  type="date"
                  value={cableRouteFormData.installation_date}
                  onChange={(e) => setCableRouteFormData(prev => ({ ...prev, installation_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-cable-notes">Notes</Label>
              <Textarea
                id="edit-cable-notes"
                value={cableRouteFormData.notes}
                onChange={(e) => setCableRouteFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes about this cable route"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditCableRouteModalOpen(false)}
              disabled={cableFormLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleEditCableRoute}
              disabled={cableFormLoading || !cableRouteFormData.odp_id || !cableRouteFormData.customer_id}
            >
              {cableFormLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Cable Route
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}