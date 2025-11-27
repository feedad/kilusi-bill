'use client'

import React, { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useAuthStore } from '@/store/authStore'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false })
const CircleMarker = dynamic(() => import('react-leaflet').then(mod => mod.CircleMarker), { ssr: false })

// Types
interface ODPData {
  id: string
  name: string
  latitude: number
  longitude: number
  status: string
  utilization_percentage: number
  customer_count: number
  capacity: number
  address: string
  type: string
  parent_odp_id?: string
}

interface Customer {
  id: string
  name: string
  latitude: number
  longitude: number
  status: string
  address?: string
  email?: string
  phone?: string
  odp_id?: string
}

interface CableRoute {
  id: string
  name: string
  from_odp_id: string
  to_odp_id: string
  coordinates: number[][]
  status: string
  cable_type: string
  length: number
  odp_latitude?: number
  odp_longitude?: number
  customer_latitude?: number
  customer_longitude?: number
  odp_name?: string
  customer_name?: string
  port_number?: number
  cable_length?: number
  notes?: string
}

export interface SimpleNetworkMapRef {
  refreshData: () => Promise<void>
  centerOnODP: (odpId: string) => void
  centerOnCustomer: (customerId: string) => void
}

interface SimpleNetworkMapProps {
  height?: string
  showODPs?: boolean
  showCustomers?: boolean
  showCableRoutes?: boolean
  centerLat?: number
  centerLng?: number
  zoom?: number
  className?: string
}

const SimpleNetworkMap = forwardRef<SimpleNetworkMapRef, SimpleNetworkMapProps>(
  (
    {
      height = '600px',
      showODPs = true,
      showCustomers = true,
      showCableRoutes = true,
      centerLat = -6.2088,
      centerLng = 106.8456,
      zoom = 11,
      className = ''
    },
    ref
  ) => {
    const [mounted, setMounted] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [L, setL] = useState<any>(null)
    const [map, setMap] = useState<any>(null)
    const [odps, setOdps] = useState<ODPData[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [cableRoutes, setCableRoutes] = useState<CableRoute[]>([])
    const mapRef = useRef<any>(null)

    useEffect(() => {
      setMounted(true)
      import('leaflet').then((leaflet) => {
        setL(leaflet)
      })
    }, [])

    const parseCoordinate = (coord: any): number | null => {
      if (typeof coord === 'number' && !isNaN(coord)) return coord
      if (typeof coord === 'string') {
        const parsed = parseFloat(coord)
        if (!isNaN(parsed)) return parsed
      }
      return null
    }

    const isValidCoordinate = (lat: number | null, lng: number | null): boolean => {
      if (lat === null || lng === null) return false
      return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    }

    // Get status color for ODP
    const getODPStatusColor = (status: string, utilization: number) => {
      if (status === 'offline') return '#ef4444'
      if (status === 'warning') return '#eab308'
      if (utilization > 90) return '#dc2626'
      if (utilization > 75) return '#ea580c'
      return '#22c55e'
    }

    // Get color for customers based on status
    const getCustomerStatusColor = (status: string) => {
      switch (status?.toLowerCase()) {
        case 'active': return '#22c55e'
        case 'inactive': return '#6b7280'
        case 'pending': return '#eab308'
        case 'suspended': return '#ef4444'
        default: return '#3b82f6'
      }
    }

    // Get color for cable routes based on status
    const getCableRouteColor = (status: string) => {
      switch (status?.toLowerCase()) {
        case 'active': return '#22c55e'
        case 'maintenance': return '#f59e0b'
        case 'fault': return '#ef4444'
        case 'planned': return '#6b7280'
        default: return '#3b82f6'
      }
    }

    const fetchODPs = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/odp`, {
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          }
        })

        if (!response.ok) throw new Error('Failed to fetch ODPs')

        const result = await response.json()
        const odpData = Array.isArray(result.data) ? result.data : []

        const validODPs = odpData.filter((odp: any) => {
          const lat = parseCoordinate(odp.latitude)
          const lng = parseCoordinate(odp.longitude)
          return isValidCoordinate(lat, lng)
        })

        setOdps(validODPs)
      } catch (err) {
        console.error('Error fetching ODPs:', err)
        setError('Failed to fetch ODPs')
      }
    }

    const fetchCustomers = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/customers?limit=1000`, {
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          }
        })

        if (!response.ok) throw new Error('Failed to fetch customers')

        const result = await response.json()
        const customerData = Array.isArray(result.data?.customers) ? result.data.customers : []

        console.log('Fetched Customers:', customerData.length, 'entries')
        console.log('Sample customers:', customerData.slice(0, 2))

        const validCustomers = customerData.filter((customer: any) => {
          const lat = parseCoordinate(customer.latitude)
          const lng = parseCoordinate(customer.longitude)
          return isValidCoordinate(lat, lng)
        })

        console.log('Valid customers after filtering:', validCustomers.length)
        setCustomers(validCustomers)
      } catch (err) {
        console.error('Error fetching customers:', err)
      }
    }

    const fetchCableRoutes = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.235:3000'}/api/v1/cable-routes?limit=1000`, {
          headers: {
            'Authorization': `Bearer ${useAuthStore.getState().token}`
          }
        })

        if (!response.ok) throw new Error('Failed to fetch cable routes')

        const result = await response.json()
        const cableData = Array.isArray(result.data) ? result.data : []

        console.log('Fetched Cable Routes:', cableData.length, 'entries')
        console.log('Sample cable route data:', cableData.slice(0, 2))
        setCableRoutes(cableData)
      } catch (err) {
        console.error('Error fetching cable routes:', err)
        setCableRoutes([])
      }
    }

    const fetchAllData = async () => {
      setLoading(true)
      setError(null)
      try {
        await Promise.all([fetchODPs(), fetchCustomers(), fetchCableRoutes()])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    const whenCreated = (mapInstance: any) => {
      setMap(mapInstance)
      mapRef.current = mapInstance
    }

    useEffect(() => {
      if (mounted) {
        fetchAllData()
      }
    }, [mounted])

    useImperativeHandle(ref, () => ({
      refreshData: fetchAllData,
      centerOnODP: (odpId: string) => {
        const odp = odps.find(o => o.id === odpId)
        if (odp && map) {
          map.setView([parseCoordinate(odp.latitude)!, parseCoordinate(odp.longitude)!], 15)
        }
      },
      centerOnCustomer: (customerId: string) => {
        const customer = customers.find(c => c.id === customerId)
        if (customer && map) {
          map.setView([parseCoordinate(customer.latitude)!, parseCoordinate(customer.longitude)!], 15)
        }
      }
    }))

    if (!mounted) {
      return (
        <div
          className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}
          style={{ height }}
        >
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading map...</p>
          </div>
        </div>
      )
    }

    if (error) {
      return (
        <div
          className={`flex items-center justify-center bg-red-50 rounded-lg ${className}`}
          style={{ height }}
        >
          <div className="text-center p-4">
            <div className="text-red-600 mb-2">⚠️ {error}</div>
            <button
              onClick={fetchAllData}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className={`${className}`} style={{ height }}>
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white bg-opacity-75 rounded-lg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading network data...</p>
            </div>
          </div>
        )}

        <MapContainer
          center={[centerLat, centerLng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          whenCreated={whenCreated}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* ODP Markers */}
          {showODPs && L && odps.map((odp) => {
            const lat = parseCoordinate(odp.latitude)
            const lng = parseCoordinate(odp.longitude)

            if (!isValidCoordinate(lat, lng)) return null

            // Custom ODP icon
            const odpIcon = L.divIcon({
              html: `
                <div style="
                  background-color: ${getODPStatusColor(odp.status, odp.utilization_percentage)};
                  width: 28px;
                  height: 28px;
                  border-radius: 50%;
                  border: 3px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 12px;
                  font-family: Arial, sans-serif;
                ">O</div>
              `,
              className: 'custom-odp-marker',
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            })

            return (
              <Marker
                key={`odp-${odp.id}`}
                position={[lat, lng]}
                icon={odpIcon}
              >
                <Popup>
                  <div className="p-2">
                    <h3 className="font-semibold text-sm mb-1">ODP: {odp.name}</h3>
                    <div className="text-xs space-y-1">
                      <div>ID: {odp.id}</div>
                      <div>Status: <span className="font-medium capitalize">{odp.status}</span></div>
                      <div>Type: {odp.type}</div>
                      <div>Utilization: {parseFloat(odp.utilization_percentage || 0).toFixed(1)}%</div>
                      <div>Customers: {odp.customer_count}/{odp.capacity}</div>
                      <div className="text-gray-600 mt-1">{odp.address}</div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* Customer Markers */}
          {showCustomers && L && customers.map((customer) => {
            const lat = parseCoordinate(customer.latitude)
            const lng = parseCoordinate(customer.longitude)

            if (!isValidCoordinate(lat, lng)) return null

            // Custom Customer icon
            const customerIcon = L.divIcon({
              html: `
                <div style="
                  background-color: ${getCustomerStatusColor(customer.status)};
                  width: 20px;
                  height: 20px;
                  border-radius: 50%;
                  border: 2px solid white;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 10px;
                  font-family: Arial, sans-serif;
                ">C</div>
              `,
              className: 'custom-customer-marker',
              iconSize: [20, 20],
              iconAnchor: [10, 10]
            })

            return (
              <Marker
                key={`customer-${customer.id}`}
                position={[lat, lng]}
                icon={customerIcon}
              >
                <Popup>
                  <div className="p-2">
                    <h3 className="font-semibold text-sm mb-1">{customer.name}</h3>
                    <div className="text-xs space-y-1">
                      <div>ID: {customer.id}</div>
                      <div>Status: <span className="font-medium capitalize">{customer.status}</span></div>
                      {customer.email && <div>Email: {customer.email}</div>}
                      {customer.phone && <div>Phone: {customer.phone}</div>}
                      {customer.odp_id && <div>ODP: {customer.odp_id}</div>}
                      {customer.address && <div className="text-gray-600 mt-1">{customer.address}</div>}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* ODP to Sub-ODP Connections */}
          {showCableRoutes && odps.map((odp) => {
            if (!odp.parent_odp_id) return null

            const parentODP = odps.find(o => o.id === odp.parent_odp_id)
            if (!parentODP) return null

            const parentLat = parseCoordinate(parentODP.latitude)
            const parentLng = parseCoordinate(parentODP.longitude)
            const childLat = parseCoordinate(odp.latitude)
            const childLng = parseCoordinate(odp.longitude)

            if (!isValidCoordinate(parentLat, parentLng) || !isValidCoordinate(childLat, childLng)) {
              return null
            }

            return (
              <Polyline
                key={`odp-connection-${odp.id}`}
                positions={[[parentLat, parentLng], [childLat, childLng]]}
                pathOptions={{
                  color: '#4a90e2',
                  weight: 4,
                  opacity: 0.8,
                  dashArray: '8, 4'
                }}
              >
                <Popup>
                  <div className="p-2">
                    <h3 className="font-semibold text-sm mb-1">ODP Connection</h3>
                    <div className="text-xs space-y-1">
                      <div>Parent: {parentODP.name}</div>
                      <div>Child: {odp.name}</div>
                    </div>
                  </div>
                </Popup>
              </Polyline>
            )
          })}

          {/* Customer to ODP Connections (using customer.odp_id) */}
          {showCableRoutes && (() => {
            console.log('Processing customer-to-ODP connections...')
            console.log('Total customers:', customers.length)
            console.log('Total ODPs:', odps.length)

            const connections = customers.map((customer) => {
              console.log(`Processing customer ${customer.name} (ID: ${customer.id}, odp_id: ${customer.odp_id})`)

              if (!customer.odp_id) {
                console.log(`Customer ${customer.name} has no odp_id`)
                return null
              }

              const odp = odps.find(o => o.id === customer.odp_id || o.id === String(customer.odp_id))
              console.log(`Looking for ODP with ID ${customer.odp_id} (type: ${typeof customer.odp_id})`)
              console.log(`Available ODP IDs:`, odps.slice(0, 5).map(o => ({id: o.id, type: typeof o.id, name: o.name})))
              console.log(`Found ODP:`, odp ? {id: odp.id, name: odp.name} : 'Not found')
              if (!odp) {
                console.log(`No ODP found for customer ${customer.name} with odp_id ${customer.odp_id}`)
                return null
              }

              const customerLat = parseCoordinate(customer.latitude)
              const customerLng = parseCoordinate(customer.longitude)
              const odpLat = parseCoordinate(odp.latitude)
              const odpLng = parseCoordinate(odp.longitude)

              console.log(`Coordinates - Customer: [${customerLat}, ${customerLng}], ODP: [${odpLat}, ${odpLng}]`)

              if (!isValidCoordinate(customerLat, customerLng) || !isValidCoordinate(odpLat, odpLng)) {
                console.log(`Invalid coordinates for customer ${customer.name}`)
                return null
              }

              console.log(`Creating connection for ${customer.name} to ${odp.name}`)
              return (
                <Polyline
                  key={`customer-connection-${customer.id}`}
                  positions={[[customerLat, customerLng], [odpLat, odpLng]]}
                  pathOptions={{
                    color: '#ff0000',
                    weight: 5,
                    opacity: 1.0
                  }}
                >
                  <Popup>
                    <div className="p-2">
                      <h3 className="font-semibold text-sm mb-1">Customer Connection</h3>
                      <div className="text-xs space-y-1">
                        <div>Customer: {customer.name}</div>
                        <div>ODP: {odp.name}</div>
                        <div>Address: {customer.address}</div>
                      </div>
                    </div>
                  </Popup>
                </Polyline>
              )
            }).filter(Boolean)

            console.log('Total customer connections created:', connections.length)
            return connections
          })()}
        </MapContainer>
      </div>
    )
  }
)

SimpleNetworkMap.displayName = 'SimpleNetworkMap'

export default SimpleNetworkMap