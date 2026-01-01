'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, MapPin, Crosshair, Navigation, ExternalLink } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { LatLngExpression } from 'leaflet'

// Dynamically import Leaflet components to avoid SSR issues
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

// Component to update map center when coordinates change
const MapController = ({ center }: { center: LatLngExpression }) => {
  const [UseMapComponent, setUseMapComponent] = React.useState<any>(null)

  React.useEffect(() => {
    import('react-leaflet').then((mod) => {
      setUseMapComponent(() => mod.useMap)
    })
  }, [])

  if (!UseMapComponent) return null

  return <MapControllerInner center={center} UseMapComponent={UseMapComponent} />
}

const MapControllerInner = ({ center, UseMapComponent }: { center: LatLngExpression; UseMapComponent: any }) => {
  const map = UseMapComponent()

  React.useEffect(() => {
    if (map && center) {
       // TYPE GUARD: Check if center is a valid array of numbers [lat, lng]
       if (Array.isArray(center) && center.length === 2 && 
           typeof center[0] === 'number' && !isNaN(center[0]) &&
           typeof center[1] === 'number' && !isNaN(center[1])) {
          try {
            map.setView(center, map.getZoom())
          } catch (e) {
            console.error('Leaflet setView error:', e)
          }
       }
    }
  }, [center, map])

  return null
}

// Component to handle map click events
const MapClickHandler = ({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) => {
  const [UseMapEventsComponent, setUseMapEventsComponent] = React.useState<any>(null)

  React.useEffect(() => {
    import('react-leaflet').then((mod) => {
      setUseMapEventsComponent(() => mod.useMapEvents)
    })
  }, [])

  if (!UseMapEventsComponent) return null

  return <MapClickHandlerInner onMapClick={onMapClick} UseMapEventsComponent={UseMapEventsComponent} />
}

const MapClickHandlerInner = ({ onMapClick, UseMapEventsComponent }: { onMapClick: (lat: number, lng: number) => void; UseMapEventsComponent: any }) => {
  UseMapEventsComponent({
    click: (e: any) => {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

interface CoordinateMapProps {
  latitude?: number | string
  longitude?: number | string
  address?: string
  onCoordinatesChange: (lat: number, lng: number) => void
  readOnly?: boolean
}

const CoordinateMap = ({
  latitude,
  longitude,
  address,
  onCoordinatesChange,
  readOnly = false
}: CoordinateMapProps) => {
  // Ensure latitude and longitude are numbers - accept both number and string
  const safeLatitude = (typeof latitude === 'number' && !isNaN(latitude)) ? latitude :
                      (typeof latitude === 'string' && !isNaN(parseFloat(latitude))) ? parseFloat(latitude) : -6.56380963;
  const safeLongitude = (typeof longitude === 'number' && !isNaN(longitude)) ? longitude :
                       (typeof longitude === 'string' && !isNaN(parseFloat(longitude))) ? parseFloat(longitude) : 107.74063468;

  const [currentLat, setCurrentLat] = useState<number>(safeLatitude)
  const [currentLng, setCurrentLng] = useState<number>(safeLongitude)
  const [loading, setLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)
  // Fix state type definition for error string
  const [error, setError] = useState<string>('')
  const [mapReady, setMapReady] = useState(false)
  const [markerPosition, setMarkerPosition] = useState<LatLngExpression>([safeLatitude, safeLongitude])
  const [mapCenter, setMapCenter] = useState<LatLngExpression>([safeLatitude, safeLongitude])

  // Ensure we're on the client side and load Leaflet CSS
  useEffect(() => {
    setIsClient(true)
    
    // Parse and validate latitude/longitude props
    let lat: number | undefined;
    let lng: number | undefined;

    if (typeof latitude === 'number') lat = latitude;
    else if (typeof latitude === 'string' && latitude.trim() !== '') lat = parseFloat(latitude);

    if (typeof longitude === 'number') lng = longitude;
    else if (typeof longitude === 'string' && longitude.trim() !== '') lng = parseFloat(longitude);

    // Strictly check for valid numbers (and not null)
    if (lat !== undefined && lat !== null && !isNaN(lat) &&
        lng !== undefined && lng !== null && !isNaN(lng)) {
      
      setCurrentLat(lat)
      setCurrentLng(lng)
      setMarkerPosition([lat, lng])
      setMapCenter([lat, lng])
    }


    // Load Leaflet CSS and fix marker icons
    if (typeof window !== 'undefined') {
      import('leaflet/dist/leaflet.css')
      import('leaflet').then((L) => {
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        })
        setMapReady(true)
      })
    }
  }, [latitude, longitude])

  // Handle marker position update
  // Handle marker position update
  const handleMapClick = (lat: number, lng: number) => {
    if (readOnly) return

    // Ensure we have valid numbers
    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : safeLatitude
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : safeLongitude
    
    console.log('📍 Map Clicked:', { lat, lng, validLat, validLng })

    setCurrentLat(validLat)
    setCurrentLng(validLng)
    setMarkerPosition([validLat, validLng])
    // Don't center map on every click to allow easier adjustments
    // setMapCenter([validLat, validLng]) 
    
    // Call parent callback immediately
    onCoordinatesChange(validLat, validLng)
  }

  // Handle marker drag end
  // Handle marker drag end
  const handleMarkerDragEnd = (e: any) => {
    if (readOnly) return
    const lat = e.target.getLatLng().lat
    const lng = e.target.getLatLng().lng
    
    // Validate
    const validLat = typeof lat === 'number' && !isNaN(lat) ? lat : safeLatitude
    const validLng = typeof lng === 'number' && !isNaN(lng) ? lng : safeLongitude

    console.log('📍 Map Dragged:', { lat, lng, validLat, validLng })

    setCurrentLat(validLat)
    setCurrentLng(validLng)
    setMarkerPosition([validLat, validLng])
    // setMapCenter([validLat, validLng]) // Don't auto center on drag

    onCoordinatesChange(validLat, validLng)
  }

  // Get current location using browser GPS
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation tidak didukung browser ini')
      return
    }

    setLoading(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setCurrentLat(typeof lat === 'number' && !isNaN(lat) ? lat : safeLatitude)
        setCurrentLng(typeof lng === 'number' && !isNaN(lng) ? lng : safeLongitude)
        setMarkerPosition([lat, lng])
        setMapCenter([lat, lng])
        onCoordinatesChange(lat, lng)
        setLoading(false)
      },
      (error) => {
        setError('Gagal mendapatkan lokasi: ' + error.message)
        setLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  // Handle coordinate input changes
  const handleLatChange = (value: string) => {
    const lat = parseFloat(value)
    if (!isNaN(lat) && lat >= -90 && lat <= 90) {
      setCurrentLat(lat)
      setMarkerPosition([lat, currentLng])
      setMapCenter([lat, currentLng])
      onCoordinatesChange(lat, currentLng)
    }
  }

  const handleLngChange = (value: string) => {
    const lng = parseFloat(value)
    if (!isNaN(lng) && lng >= -180 && lng <= 180) {
      setCurrentLng(lng)
      setMarkerPosition([currentLat, lng])
      setMapCenter([currentLat, lng])
      onCoordinatesChange(currentLat, lng)
    }
  }

  // Geocode address to coordinates
  const geocodeAddress = async () => {
    if (!address || !isClient) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=id&limit=1`
      )
      const data = await response.json()

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat)
        const lng = parseFloat(data[0].lon)
        setCurrentLat(typeof lat === 'number' && !isNaN(lat) ? lat : safeLatitude)
        setCurrentLng(typeof lng === 'number' && !isNaN(lng) ? lng : safeLongitude)
        setMarkerPosition([lat, lng])
        setMapCenter([lat, lng])
        onCoordinatesChange(lat, lng)
      } else {
        setError('Alamat tidak ditemukan')
      }
    } catch (error) {
      setError('Gagal geocoding alamat')
    } finally {
      setLoading(false)
    }
  }

  if (!isClient || !mapReady) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center border">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Interactive Leaflet Map */}
      <div className="w-full h-96 rounded-lg overflow-hidden border relative bg-white">
        <MapContainer
          center={mapCenter}
          zoom={17}
          style={{ height: '100%', width: '100%' }}
          className="z-10"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Map controller for auto-centering */}
          <MapController center={mapCenter} />

          {/* Draggable Marker */}
          {!readOnly && (
            <Marker
              position={markerPosition}
              draggable={true}
              eventHandlers={{
                dragend: handleMarkerDragEnd,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <strong>Lokasi Pelanggan</strong><br />
                  Koordinat: {typeof currentLat === 'number' ? currentLat.toFixed(6) : 'N/A'}, {typeof currentLng === 'number' ? currentLng.toFixed(6) : 'N/A'}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Static Marker for read-only mode */}
          {readOnly && (
            <Marker
              position={markerPosition}
              draggable={false}
            >
              <Popup>
                <div className="text-sm">
                  <strong>Lokasi Pelanggan</strong><br />
                  Koordinat: {typeof currentLat === 'number' ? currentLat.toFixed(6) : 'N/A'}, {typeof currentLng === 'number' ? currentLng.toFixed(6) : 'N/A'}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Map click handler for setting location */}
          {!readOnly && <MapClickHandler onMapClick={handleMapClick} />}
        </MapContainer>

        {/* Current Location Indicator */}
        <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg shadow-lg p-3 max-w-xs z-20">
          <div className="flex items-center space-x-2 mb-2">
            <MapPin className="h-5 w-5 text-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-800">
              {readOnly ? 'Lokasi Pelanggan' : 'Pindahkan Pin atau Klik Map'}
            </span>
          </div>
          {address && (
            <p className="text-xs text-gray-600 mb-2">{address}</p>
          )}
          <div className="bg-gray-50 rounded px-2 py-1">
            <p className="text-xs text-gray-700 font-mono">
              {typeof currentLat === 'number' ? currentLat.toFixed(6) : 'N/A'}, {typeof currentLng === 'number' ? currentLng.toFixed(6) : 'N/A'}
            </p>
          </div>
        </div>

        {/* Controls Info */}
        <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded px-2 py-1 z-20">
          <p className="text-xs text-gray-600">
            {!readOnly ? '🖱️ Scroll: zoom • Drag: pan • Klik: set posisi • Drag pin: adjust' : '🖱️ Scroll: zoom • Drag: pan'}
          </p>
        </div>

        {!readOnly && (
          <div className="absolute bottom-4 left-4 flex space-x-2 z-20">
            <button
              onClick={getCurrentLocation}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded text-xs inline-flex items-center space-x-1 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Navigation className="h-3 w-3" />
              )}
              <span>Current GPS</span>
            </button>

            {address && (
              <button
                onClick={geocodeAddress}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded text-xs inline-flex items-center space-x-1 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Crosshair className="h-3 w-3" />
                )}
                <span>Cari Lokasi</span>
              </button>
            )}
          </div>
        )}

        {/* Link to OpenStreetMap for manual adjustment */}
        <div className="absolute top-4 right-4 z-20">
          <a
            href={`https://www.openstreetmap.org/?mlat=${typeof currentLat === 'number' ? currentLat : -6.56380963}&mlon=${typeof currentLng === 'number' ? currentLng : 107.74063468}&zoom=17`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 p-2 rounded text-xs transition-colors"
            title="Buka di OpenStreetMap untuk detail"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Manual Coordinate Input */}
      {!readOnly && (
        <div className="bg-gray-50 dark:bg-background p-4 rounded-lg border border-gray-300 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Koordinat:</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={currentLat}
                onChange={(e) => handleLatChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="-6.56380963"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={currentLng}
                onChange={(e) => handleLngChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="107.74063468"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            💡 Koordinat otomatis terisi saat Anda drag pin atau klik map. Anda bisa juga menyesuaikan manual di sini.
          </p>
        </div>
      )}

      {/* Read Only Display */}
      {readOnly && (
        <div className="bg-gray-50 dark:bg-gray-950 p-4 rounded-lg border border-gray-300 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Koordinat Lokasi:</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Latitude
              </label>
              <div className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100">
                {currentLat.toFixed(6)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Longitude
              </label>
              <div className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100">
                {currentLng.toFixed(6)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CoordinateMap