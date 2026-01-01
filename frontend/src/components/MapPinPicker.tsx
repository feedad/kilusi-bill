'use client'

import React, { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin, Crosshair } from 'lucide-react'

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false })

export interface MapPinPickerRef {
  getCoordinates: () => { latitude: number; longitude: number } | null
  resetCoordinates: () => void
}

interface MapPinPickerProps {
  initialLatitude?: number
  initialLongitude?: number
  onCoordinatesChange?: (coordinates: { latitude: number; longitude: number } | null) => void
  height?: string
  className?: string
}

const MapPinPicker = forwardRef<MapPinPickerRef, MapPinPickerProps>(
  ({
    initialLatitude = -6.5715,
    initialLongitude = 107.7547,
    onCoordinatesChange,
    height = '300px',
    className = ''
  }, ref) => {
    const [mounted, setMounted] = useState(false)
    const [L, setL] = useState<any>(null)
    const [map, setMap] = useState<any>(null)
    const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(
      initialLatitude && initialLongitude
        ? { latitude: initialLatitude, longitude: initialLongitude }
        : null
    )
    const [isSelecting, setIsSelecting] = useState(false)

    useEffect(() => {
      setMounted(true)
      import('leaflet').then((leaflet) => {
        setL(leaflet)
      })
    }, [])

    useEffect(() => {
      if (coordinates && onCoordinatesChange) {
        onCoordinatesChange(coordinates)
      }
    }, [coordinates, onCoordinatesChange])

    const handleMapClick = useCallback((e: any) => {
      if (isSelecting && e.latlng) {
        const { lat, lng } = e.latlng
        setCoordinates({ latitude: lat, longitude: lng })
        setIsSelecting(false)
      }
    }, [isSelecting])

    const whenMapCreated = useCallback((mapInstance: any) => {
      setMap(mapInstance)

      // Add click handler to map
      if (mapInstance) {
        mapInstance.on('click', handleMapClick)
      }
    }, [handleMapClick])

    useImperativeHandle(ref, () => ({
      getCoordinates: () => coordinates,
      resetCoordinates: () => {
        setCoordinates(null)
        if (onCoordinatesChange) {
          onCoordinatesChange(null)
        }
      }
    }))

    const customIcon = L?.divIcon({
      html: `
        <div style="
          background-color: #ef4444;
          width: 24px;
          height: 24px;
          border-radius: 50% 50% 0 50%;
          border: 3px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          transform: rotate(-45deg);
        ">
          <Crosshair className="w-4 h-4" />
        </div>
      `,
      className: 'custom-pin-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 24]
    })

    const toggleSelecting = () => {
      setIsSelecting(!isSelecting)
    }

    const clearLocation = () => {
      setCoordinates(null)
      if (onCoordinatesChange) {
        onCoordinatesChange(null)
      }
    }

    if (!mounted) {
      return (
        <div className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`} style={{ height }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading map...</p>
          </div>
        </div>
      )
    }

    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium">Location Pin Pointer</h3>
            <p className="text-sm text-muted-foreground">
              Click on the map to pin the ODP location
            </p>
          </div>
          <div className="flex items-center gap-2">
            {coordinates && (
              <div className="text-sm">
                <Badge variant="secondary">
                  {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
                </Badge>
              </div>
            )}
            <Button
              onClick={toggleSelecting}
              variant={isSelecting ? "default" : "outline"}
              size="sm"
            >
              {isSelecting ? (
                <>
                  <Crosshair className="w-4 h-4 mr-2" />
                  Click on map...
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 mr-2" />
                  Pin Location
                </>
              )}
            </Button>
          </div>
        </div>

        <div className={`border-2 border-dashed rounded-lg ${isSelecting ? 'border-blue-500 bg-blue-50' : 'border-gray-300'} transition-colors`}>
          <div style={{ height, position: 'relative' }}>
            <MapContainer
              center={[
                coordinates?.latitude || initialLatitude,
                coordinates?.longitude || initialLongitude
              ]}
              zoom={15}
              style={{ height: '100%', width: '100%', cursor: isSelecting ? 'crosshair' : 'default' }}
              whenCreated={whenMapCreated}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Marker for selected location */}
              {coordinates && L && customIcon && (
                <Marker position={[coordinates.latitude, coordinates.longitude]} icon={customIcon}>
                  <Popup>
                    <div className="p-2 text-sm">
                      <strong>ODP Location</strong><br />
                      Lat: {coordinates.latitude.toFixed(6)}<br />
                      Lng: {coordinates.longitude.toFixed(6)}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>

            {!coordinates && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/10 bg-opacity-10 pointer-events-none">
                <Card className="pointer-events-auto">
                  <CardContent className="p-4 text-center">
                    <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                    <p className="text-sm font-medium">Pin Location Required</p>
                    <p className="text-xs text-muted-foreground">
                      Click &quot;Pin Location&quot; button and then click on the map
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {isSelecting && (
              <div className="absolute top-2 left-2 z-10">
                <Badge variant="default" className="bg-blue-600">
                  <Crosshair className="w-4 h-4 mr-1" />
                  Click on map to place pin
                </Badge>
              </div>
            )}
          </div>
        </div>

        {coordinates && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearLocation}
          >
            Clear Location
          </Button>
        )}
      </div>
    )
  }
)

MapPinPicker.displayName = 'MapPinPicker'

export default MapPinPicker