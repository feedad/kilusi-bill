'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, MapPin, ExternalLink } from 'lucide-react'

interface Customer {
  id: string
  name?: string
  address?: string
  phone?: string
  latitude?: number | string
  longitude?: number | string
}

interface CustomerMapProps {
  customer: Customer
}

const CustomerMap = ({ customer }: CustomerMapProps) => {
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    const geocodeAddress = async () => {
      if (!customer.address || !isClient) return

      // If customer already has coordinates, use them
      // Handle both string and number coordinates from database
      if (customer.latitude && customer.longitude) {
        const lat = typeof customer.latitude === 'string' ? parseFloat(customer.latitude) : customer.latitude
        const lng = typeof customer.longitude === 'string' ? parseFloat(customer.longitude) : customer.longitude

        console.log('CustomerMap - Processing coordinates:', {
          original: { latitude: customer.latitude, longitude: customer.longitude },
          converted: { lat, lng },
          types: { latType: typeof lat, lngType: typeof lng, isValid: !isNaN(lat) && !isNaN(lng) }
        })

        if (!isNaN(lat) && !isNaN(lng)) {
          setCoordinates([lat, lng])
          setLoading(false)
          return
        } else {
          console.warn('CustomerMap - Invalid coordinates after conversion:', { lat, lng, original: { latitude: customer.latitude, longitude: customer.longitude } })
        }
      } else {
        console.log('CustomerMap - No coordinates available for customer:', {
          customerId: customer.id,
          latitude: customer.latitude,
          longitude: customer.longitude,
          address: customer.address
        })
      }

      // Otherwise, geocode the address
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customer.address)}&countrycodes=id&limit=1`
        )
        const data = await response.json()

        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat)
          const lon = parseFloat(data[0].lon)
          setCoordinates([lat, lon])
        } else {
          // Default to Indonesia coordinates if geocoding fails
          setCoordinates([-2.5, 118])
        }
      } catch (error) {
        console.error('Error geocoding address:', error)
        // Default to Indonesia coordinates
        setCoordinates([-2.5, 118])
      } finally {
        setLoading(false)
      }
    }

    geocodeAddress()
  }, [customer.address, customer.latitude, customer.longitude, isClient])

  // Simple placeholder while loading or if not client
  if (!isClient || loading) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center border">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-gray-600">Memuat peta...</span>
        </div>
      </div>
    )
  }

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center border">
        <div className="text-center">
          <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Lokasi tidak tersedia</p>
          {customer.latitude && customer.longitude && (
            <p className="text-xs text-gray-500 mt-1">
              Koordinat: {customer.latitude}, {customer.longitude}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border relative bg-white">
      {/* Interactive OpenStreetMap iframe */}
      {coordinates && Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1]) && (
        <iframe
          title={`Map for ${customer.name}`}
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${(typeof coordinates[1] === 'number' ? coordinates[1] : parseFloat(coordinates[1])) - 0.005},${(typeof coordinates[0] === 'number' ? coordinates[0] : parseFloat(coordinates[0])) - 0.005},${(typeof coordinates[1] === 'number' ? coordinates[1] : parseFloat(coordinates[1])) + 0.005},${(typeof coordinates[0] === 'number' ? coordinates[0] : parseFloat(coordinates[0])) + 0.005}&layer=mapnik&marker=${typeof coordinates[0] === 'number' ? coordinates[0] : parseFloat(coordinates[0])},${typeof coordinates[1] === 'number' ? coordinates[1] : parseFloat(coordinates[1])}`}
          className="w-full h-full border-0"
          style={{ minHeight: '384px' }}
          loading="lazy"
          allowFullScreen
        />
      )}

      {/* Customer info overlay */}
      {coordinates && (
        <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg shadow-lg p-3 max-w-xs">
          <div className="flex items-center space-x-2 mb-2">
            <MapPin className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-800 truncate">{customer.name || 'Lokasi Pelanggan'}</p>
          </div>
          <p className="text-xs text-gray-600 mb-2">{customer.address}</p>
          {coordinates && Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1]) && (
            <div className="bg-gray-50 rounded px-2 py-1">
              <p className="text-xs text-gray-700 font-mono">
                {typeof coordinates[0] === 'number' ? coordinates[0].toFixed(6) : parseFloat(coordinates[0]).toFixed(6)}, {typeof coordinates[1] === 'number' ? coordinates[1].toFixed(6) : parseFloat(coordinates[1]).toFixed(6)}
              </p>
            </div>
          )}
          {coordinates && (!Array.isArray(coordinates) || coordinates.length !== 2 || isNaN(coordinates[0]) || isNaN(coordinates[1])) && (
            <div className="bg-yellow-50 rounded px-2 py-1">
              <p className="text-xs text-yellow-700">Koordinat tidak valid</p>
              <p className="text-xs text-yellow-600">
                Data: {JSON.stringify(coordinates)}
              </p>
            </div>
          )}
          {!coordinates && !loading && (
            <div className="bg-yellow-50 rounded px-2 py-1">
              <p className="text-xs text-yellow-700">Koordinat tidak tersedia</p>
              <p className="text-xs text-yellow-600">
                Customer: {customer.latitude}, {customer.longitude}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Zoom controls info */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded px-2 py-1">
        <p className="text-xs text-gray-600">🖱️ Scroll untuk zoom • Drag untuk pan</p>
      </div>

      {/* External map link */}
      {coordinates && Array.isArray(coordinates) && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1]) && (
        <div className="absolute bottom-4 left-4">
          <a
            href={`https://www.openstreetmap.org/?mlat=${typeof coordinates[0] === 'number' ? coordinates[0] : parseFloat(coordinates[0])}&mlon=${typeof coordinates[1] === 'number' ? coordinates[1] : parseFloat(coordinates[1])}&zoom=17`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs inline-flex items-center space-x-1 transition-colors"
          >
            <span>Buka di OSM</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  )
}

export default CustomerMap