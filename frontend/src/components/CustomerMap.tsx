'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, MapPin, ExternalLink } from 'lucide-react'

interface Customer {
  id: string
  name?: string
  address?: string
  phone?: string
  latitude?: number
  longitude?: number
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
      if (customer.latitude && customer.longitude) {
        setCoordinates([customer.latitude, customer.longitude])
        setLoading(false)
        return
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

  if (!coordinates) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center border">
        <div className="text-center">
          <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Lokasi tidak tersedia</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border relative bg-white">
      {/* Interactive OpenStreetMap iframe */}
      {coordinates && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number' && (
        <iframe
          title={`Map for ${customer.name}`}
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${coordinates[1] - 0.005},${coordinates[0] - 0.005},${coordinates[1] + 0.005},${coordinates[0] + 0.005}&layer=mapnik&marker=${coordinates[0]},${coordinates[1]}`}
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
          {coordinates && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number' && (
            <div className="bg-gray-50 rounded px-2 py-1">
              <p className="text-xs text-gray-700 font-mono">
                {coordinates[0].toFixed(6)}, {coordinates[1].toFixed(6)}
              </p>
            </div>
          )}
          {coordinates && (typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') && (
            <div className="bg-yellow-50 rounded px-2 py-1">
              <p className="text-xs text-yellow-700">Koordinat tidak valid</p>
            </div>
          )}
          {!coordinates && !loading && (
            <div className="bg-yellow-50 rounded px-2 py-1">
              <p className="text-xs text-yellow-700">Koordinat tidak tersedia</p>
            </div>
          )}
        </div>
      )}

      {/* Zoom controls info */}
      <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded px-2 py-1">
        <p className="text-xs text-gray-600">🖱️ Scroll untuk zoom • Drag untuk pan</p>
      </div>

      {/* External map link */}
      {coordinates && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number' && (
        <div className="absolute bottom-4 left-4">
          <a
            href={`https://www.openstreetmap.org/?mlat=${coordinates[0]}&mlon=${coordinates[1]}&zoom=17`}
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