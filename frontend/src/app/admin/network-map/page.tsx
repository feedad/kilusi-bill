'use client'

import React, { useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Filter, RefreshCw, Wifi, MapPin, Activity, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import SimpleNetworkMap from '@/components/SimpleNetworkMap'
import CoordinateMap from '@/components/CoordinateMap'
import { useAuthStore } from '@/store/authStore'
import { adminApi } from '@/lib/api-clients'

export default function ONUMapPage() {
  const { token, isAuthenticated } = useAuthStore()

  // Network map ref
  const networkMapRef = useRef<any>(null)

  return (
    <div className="space-y-6 bg-background min-h-screen">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Network Map</h1>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (networkMapRef.current) {
                networkMapRef.current.refreshData()
                toast.success('Map data refreshed')
              }
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Map Description */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Peta Jaringan ODP & ONU
          </CardTitle>
          <CardDescription>
            Visualisasi geografis dari Optical Distribution Points (ODP) dan Optical Network Units (ONU) dalam jaringan fiber optik.
            Map secara otomatis mendeteksi lokasi Anda dan menampilkan area terdekat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm">ODP Aktif</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-sm">ODP Maintenance</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-sm">ODP Tidak Aktif</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm">Pelanggan Terhubung</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              <span className="text-sm">Pelanggan Tidak Terhubung</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="text-sm">Kabel Route</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span className="text-sm">Lokasi Anda</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Network Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Wifi className="h-5 w-5" />
              Peta Jaringan
            </span>
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">Real-time</Badge>
              <Badge variant="outline">Interactive</Badge>
            </div>
          </CardTitle>
          <CardDescription>
            Klik pada ODP untuk melihat detail, zoom in/out untuk navigasi peta
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[600px] w-full">
            <SimpleNetworkMap ref={networkMapRef} />
          </div>
        </CardContent>
      </Card>

      {/* Map Controls & Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Legend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Legenda Peta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>
                <div>
                  <p className="text-sm font-medium">ODP Aktif</p>
                  <p className="text-xs text-muted-foreground">Beroperasi normal</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-yellow-500 rounded-full border-2 border-white shadow-sm"></div>
                <div>
                  <p className="text-sm font-medium">ODP Maintenance</p>
                  <p className="text-xs text-muted-foreground">Sedang dalam perawatan</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                <div>
                  <p className="text-sm font-medium">ODP Tidak Aktif</p>
                  <p className="text-xs text-muted-foreground">Tidak beroperasi</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm"></div>
                <div>
                  <p className="text-sm font-medium">Pelanggan Aktif</p>
                  <p className="text-xs text-muted-foreground">Koneksi tersambung</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-gray-400 rounded-full border-2 border-white shadow-sm"></div>
                <div>
                  <p className="text-sm font-medium">Pelanggan Non-aktif</p>
                  <p className="text-xs text-muted-foreground">Koneksi terputus</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-purple-500 rounded border-2 border-white shadow-sm"></div>
                <div>
                  <p className="text-sm font-medium">Kabel Route</p>
                  <p className="text-xs text-muted-foreground">Jalur kabel fiber</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Map Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kontrol Peta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Navigasi</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Scroll untuk zoom in/out</li>
                <li>• Drag untuk pindah peta</li>
                <li>• Double-click untuk zoom</li>
                <li>• Klik marker untuk detail</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Filter</h4>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Filter className="mr-2 h-3 w-3" />
                  Filter ODP
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Search className="mr-2 h-3 w-3" />
                  Cari Lokasi
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Statistik Jaringan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">-</div>
                <p className="text-xs text-muted-foreground">ODP Aktif</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">-</div>
                <p className="text-xs text-muted-foreground">ODP Non-aktif</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">-</div>
                <p className="text-xs text-muted-foreground">Pelanggan Aktif</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">-</div>
                <p className="text-xs text-muted-foreground">Total Pelanggan</p>
              </div>
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open('/admin/odp', '_blank')}
              >
                <Activity className="mr-2 h-3 w-3" />
                Kelola ODP
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}