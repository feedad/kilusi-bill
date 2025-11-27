'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Wifi,
  MapPin,
  Users,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCw
} from 'lucide-react'

// Dynamically import map components to avoid SSR issues
const MapContainer = dynamic(
  () => import('react-leaflet').then((mod) => mod.MapContainer),
  { ssr: false }
)

const TileLayer = dynamic(
  () => import('react-leaflet').then((mod) => mod.TileLayer),
  { ssr: false }
)

const Marker = dynamic(
  () => import('react-leaflet').then((mod) => mod.Marker),
  { ssr: false }
)

const Popup = dynamic(
  () => import('react-leaflet').then((mod) => mod.Popup),
  { ssr: false }
)

const CircleMarker = dynamic(
  () => import('react-leaflet').then((mod) => mod.CircleMarker),
  { ssr: false }
)

const Polyline = dynamic(
  () => import('react-leaflet').then((mod) => mod.Polyline),
  { ssr: false }
)

// Import Leaflet CSS
import 'leaflet/dist/leaflet.css'

// Types
interface ODP {
  id: number
  name: string
  code: string
  address?: string
  latitude: number
  longitude: number
  capacity: number
  used_ports: number
  status: 'active' | 'maintenance' | 'inactive'
  connected_customers?: number
  active_connections?: number
  utilization_percentage?: number
  parent_name?: string
  parent_code?: string
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

interface NetworkMapProps {
  odps: ODP[]
  customers: Customer[]
  cableRoutes: CableRoute[]
  onODPClick?: (odp: ODP) => void
  onCustomerClick?: (customer: Customer) => void
  className?: string
}

export function NetworkMap({
  odps,
  customers,
  cableRoutes,
  onODPClick,
  onCustomerClick,
  className = ""
}: NetworkMapProps) {
  const mapRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [layers, setLayers] = useState({
    odps: true,
    customers: true,
    cables: true
  })
  const [stats, setStats] = useState({
    totalODPs: 0,
    activeODPs: 0,
    totalCustomers: 0,
    connectedRoutes: 0,
    disconnectedRoutes: 0
  })

  // Calculate statistics
  useEffect(() => {
    const activeODPs = odps.filter(odp => odp.status === 'active').length
    const connectedRoutes = cableRoutes.filter(route => route.status === 'connected').length
    const disconnectedRoutes = cableRoutes.filter(route => route.status === 'disconnected').length

    setStats({
      totalODPs: odps.length,
      activeODPs,
      totalCustomers: customers.length,
      connectedRoutes,
      disconnectedRoutes
    })
  }, [odps, customers, cableRoutes])

  // Initialize map and fix Leaflet markers
  useEffect(() => {
    const initializeMap = async () => {
      if (typeof window !== 'undefined') {
        const L = (await import('leaflet')).default

        // Fix for default markers in Leaflet with Next.js
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })
      }

      setMapReady(true)
    }

    initializeMap()
  }, [])

  // Get marker color based on status
  const getODPColor = (status: string) => {
    switch (status) {
      case 'active': return '#22c55e'
      case 'maintenance': return '#eab308'
      case 'inactive': return '#6b7280'
      default: return '#3b82f6'
    }
  }

  const getCustomerColor = (status: string) => {
    switch (status) {
      case 'online': return '#22c55e'
      case 'offline': return '#ef4444'
      case 'suspended': return '#eab308'
      default: return '#6b7280'
    }
  }

  const getCableColor = (status: string) => {
    switch (status) {
      case 'connected': return '#22c55e'
      case 'disconnected': return '#ef4444'
      case 'maintenance': return '#eab308'
      case 'damaged': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  // Filter data based on selected filter
  const filteredODPs = selectedFilter === 'all'
    ? odps
    : odps.filter(odp => odp.status === selectedFilter)

  const filteredCableRoutes = cableRoutes.filter(route => {
    const odp = odps.find(o => o.id === route.odp_id)
    return selectedFilter === 'all' || (odp && odp.status === selectedFilter)
  })

  // Get center point for map
  const getCenter = () => {
    if (odps.length === 0) return [-6.2088, 106.8456] // Default to Jakarta

    const validCoordinates = odps.filter(odp => odp.latitude && odp.longitude)
    if (validCoordinates.length === 0) return [-6.2088, 106.8456]

    const avgLat = validCoordinates.reduce((sum, odp) => sum + odp.latitude, 0) / validCoordinates.length
    const avgLng = validCoordinates.reduce((sum, odp) => sum + odp.longitude, 0) / validCoordinates.length

    return [avgLat, avgLng]
  }

  if (!mapReady) {
    return (
      <div className="flex items-center justify-center h-96 bg-muted rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Map Controls and Stats */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Statistics Card */}
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Network Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalODPs}</div>
                <div className="text-muted-foreground">Total ODPs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.activeODPs}</div>
                <div className="text-muted-foreground">Active ODPs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{stats.totalCustomers}</div>
                <div className="text-muted-foreground">Customers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.connectedRoutes}</div>
                <div className="text-muted-foreground">Connected</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Layer Controls */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Map Layers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="odps-layer"
                checked={layers.odps}
                onCheckedChange={(checked) => setLayers(prev => ({ ...prev, odps: checked }))}
              />
              <Label htmlFor="odps-layer" className="flex items-center gap-2">
                <Wifi className="h-4 w-4" />
                ODPs
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="customers-layer"
                checked={layers.customers}
                onCheckedChange={(checked) => setLayers(prev => ({ ...prev, customers: checked }))}
              />
              <Label htmlFor="customers-layer" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Customers
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="cables-layer"
                checked={layers.cables}
                onCheckedChange={(checked) => setLayers(prev => ({ ...prev, cables: checked }))}
              />
              <Label htmlFor="cables-layer" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Cable Routes
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="status-filter">Status:</Label>
              <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map Container */}
      <Card>
        <CardHeader>
          <CardTitle>Network Infrastructure Map</CardTitle>
          <CardDescription>
            Interactive map showing ODP locations, customers, and cable connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <MapContainer
              center={getCenter() as [number, number]}
              zoom={12}
              style={{ height: '600px', width: '100%' }}
              ref={mapRef}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* ODP Markers */}
              {layers.odps && filteredODPs.map((odp) => {
                if (!odp.latitude || !odp.longitude) return null

                const utilization = parseFloat(odp.utilization_percentage) || 0
                const color = getODPColor(odp.status)

                return (
                  <CircleMarker
                    key={`odp-${odp.id}`}
                    center={[odp.latitude, odp.longitude]}
                    radius={12}
                    pathOptions={{
                      fillColor: color,
                      color: '#fff',
                      weight: 2,
                      opacity: 1,
                      fillOpacity: 0.8
                    }}
                    eventHandlers={{
                      click: () => onODPClick?.(odp)
                    }}
                  >
                    <Popup>
                      <div className="text-center p-2 min-w-[200px]">
                        <div className="font-bold text-lg mb-2">{odp.name}</div>
                        <div className="space-y-1 text-sm">
                          <div><strong>Code:</strong> {odp.code}</div>
                          {odp.parent_name && (
                            <div><strong>Parent:</strong> {odp.parent_name}</div>
                          )}
                          <div><strong>Status:</strong>
                            <Badge variant={odp.status === 'active' ? 'default' : 'secondary'} className="ml-1">
                              {odp.status}
                            </Badge>
                          </div>
                          <div><strong>Capacity:</strong> {odp.used_ports}/{odp.capacity}</div>
                          <div><strong>Utilization:</strong> {utilization.toFixed(1)}%</div>
                          {odp.connected_customers && (
                            <div><strong>Customers:</strong> {odp.connected_customers}</div>
                          )}
                          {odp.address && (
                            <div><strong>Address:</strong> {odp.address}</div>
                          )}
                        </div>
                        {onODPClick && (
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => onODPClick(odp)}
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}

              {/* Customer Markers */}
              {layers.customers && customers.map((customer) => {
                if (!customer.latitude || !customer.longitude) return null

                const color = getCustomerColor(customer.status)

                return (
                  <CircleMarker
                    key={`customer-${customer.customer_id}`}
                    center={[customer.latitude, customer.longitude]}
                    radius={6}
                    pathOptions={{
                      fillColor: color,
                      color: '#fff',
                      weight: 1,
                      opacity: 1,
                      fillOpacity: 0.7
                    }}
                    eventHandlers={{
                      click: () => onCustomerClick?.(customer)
                    }}
                  >
                    <Popup>
                      <div className="text-center p-2 min-w-[180px]">
                        <div className="font-bold mb-2">{customer.name}</div>
                        <div className="space-y-1 text-sm">
                          <div><strong>ID:</strong> {customer.customer_id}</div>
                          {customer.phone && (
                            <div><strong>Phone:</strong> {customer.phone}</div>
                          )}
                          <div><strong>Status:</strong>
                            <Badge
                              variant={customer.status === 'online' ? 'default' : 'secondary'}
                              className="ml-1"
                            >
                              {customer.status}
                            </Badge>
                          </div>
                          {customer.address && (
                            <div><strong>Address:</strong> {customer.address}</div>
                          )}
                        </div>
                        {onCustomerClick && (
                          <Button
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => onCustomerClick(customer)}
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}

              {/* Cable Routes */}
              {layers.cables && filteredCableRoutes.map((route) => {
                const odp = odps.find(o => o.id === route.odp_id)
                if (!odp || !odp.latitude || !odp.longitude) return null
                if (!route.customer_latitude || !route.customer_longitude) return null

                const color = getCableColor(route.status)
                const dashArray = route.status === 'maintenance' ? '10, 5' :
                               route.status === 'disconnected' ? '5, 10' : undefined

                return (
                  <Polyline
                    key={`route-${route.id}`}
                    positions={[
                      [odp.latitude, odp.longitude],
                      [route.customer_latitude, route.customer_longitude]
                    ]}
                    pathOptions={{
                      color,
                      weight: route.status === 'connected' ? 3 : 2,
                      opacity: route.status === 'connected' ? 0.8 : 0.6,
                      dashArray
                    }}
                  />
                )
              })}
            </MapContainer>

            {/* Map Legend */}
            <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg border z-[1000]">
              <div className="font-semibold text-sm mb-2">Legend</div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span>Active ODP/Customer</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span>Maintenance</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>Disconnected/Offline</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                  <span>Inactive</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}