'use client'

import React, { useState, useEffect } from 'react'
import { Loader2, MapPin, Crosshair, Navigation, ExternalLink } from 'lucide-react'

interface CoordinateMapProps {
  latitude?: number
  longitude?: number
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
  const [currentLat, setCurrentLat] = useState<number>(latitude || -6.2088)
  const [currentLng, setCurrentLng] = useState<number>(longitude || 106.8456)
  const [loading, setLoading] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [error, setError] = useState<string>('')

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true)
    if (latitude && longitude) {
      setCurrentLat(latitude)
      setCurrentLng(longitude)
    }
  }, [latitude, longitude])

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
        setCurrentLat(lat)
        setCurrentLng(lng)
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
      onCoordinatesChange(lat, currentLng)
    }
  }

  const handleLngChange = (value: string) => {
    const lng = parseFloat(value)
    if (!isNaN(lng) && lng >= -180 && lng <= 180) {
      setCurrentLng(lng)
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
        setCurrentLat(lat)
        setCurrentLng(lng)
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

  if (!isClient) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center border">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Interactive Map */}
      <div className="w-full h-96 rounded-lg overflow-hidden border relative bg-white">
        <iframe
          title="Coordinate Selection Map"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${currentLng-0.01},${currentLat-0.01},${currentLng+0.01},${currentLat+0.01}&layer=mapnik&marker=${currentLat},${currentLng}`}
          className="w-full h-full border-0"
          loading="lazy"
          allowFullScreen
        />

        {/* Current Location Indicator */}
        <div className="absolute top-4 left-4 bg-white bg-opacity-95 rounded-lg shadow-lg p-3 max-w-xs">
          <div className="flex items-center space-x-2 mb-2">
            <MapPin className="h-5 w-5 text-red-500 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-800">
              {readOnly ? 'Lokasi Pelanggan' : 'Pilih Lokasi'}
            </span>
          </div>
          {address && (
            <p className="text-xs text-gray-600 mb-2">{address}</p>
          )}
          <div className="bg-gray-50 rounded px-2 py-1">
            <p className="text-xs text-gray-700 font-mono">
              {currentLat.toFixed(6)}, {currentLng.toFixed(6)}
            </p>
          </div>
        </div>

        {/* Controls Info */}
        <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded px-2 py-1">
          <p className="text-xs text-gray-600">
            {!readOnly ? '🖱️ Scroll: zoom • Drag: pan • Klik OSM: edit' : '🖱️ Scroll: zoom • Drag: pan'}
          </p>
        </div>

        {!readOnly && (
          <div className="absolute bottom-4 left-4 flex space-x-2">
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
        <div className="absolute top-4 right-4">
          <a
            href={`https://www.openstreetmap.org/?mlat=${currentLat}&mlon=${currentLng}&zoom=17`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 p-2 rounded text-xs transition-colors"
            title="Buka di OpenStreetMap untuk adjust manual"
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Latitude
            </label>
            <input
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              value={currentLat}
              onChange={(e) => handleLatChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="-6.2088"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Longitude
            </label>
            <input
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              value={currentLng}
              onChange={(e) => handleLngChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="106.8456"
            />
          </div>
        </div>
      )}

      {/* Read Only Display */}
      {readOnly && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Latitude
            </label>
            <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
              {currentLat.toFixed(6)}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Longitude
            </label>
            <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900">
              {currentLng.toFixed(6)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CoordinateMap