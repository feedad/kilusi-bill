'use client'

import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  MapPin,
  Building,
  Map,
  Power,
  PowerOff,
  CheckSquare,
  Square,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'
import RegionFormModal from './RegionFormModal'

interface Region {
  id: string
  name: string
  district: string
  regency: string
  province: string
  created_at: string
  updated_at: string
  disabled_at: string | null
}

interface RegionModalProps {
  isOpen: boolean
  onClose: () => void
}

const RegionModal = ({ isOpen, onClose }: RegionModalProps) => {
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingRegion, setEditingRegion] = useState<Region | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [includeDisabled, setIncludeDisabled] = useState(false)
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  })

  // Fetch regions when modal opens or includeDisabled changes
  useEffect(() => {
    if (isOpen) {
      fetchRegions()
    }
  }, [isOpen, includeDisabled])

  const fetchRegions = async (search = '', page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (includeDisabled) params.append('include_disabled', 'true')
      params.append('page', page.toString())
      params.append('limit', pagination.limit.toString())

      const response = await adminApi.get(`/api/v1/regions?${params}`)

      if (response.data.success) {
        setRegions(response.data.data)
        setPagination(prev => ({
          ...prev,
          page: response.data.pagination?.page || page,
          total: response.data.pagination?.total || 0,
          totalPages: response.data.pagination?.totalPages || 0
        }))
      }
    } catch (error) {
      console.error('Error fetching regions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPagination(prev => ({ ...prev, page: 1 }))
    fetchRegions(searchQuery, 1)
  }

  const handleAddRegion = () => {
    setEditingRegion(undefined)
    setShowFormModal(true)
  }

  const handleEditRegion = (region: Region) => {
    setEditingRegion(region)
    setShowFormModal(true)
  }

  const handleDeleteRegion = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus wilayah "${name}"?`)) {
      return
    }

    setDeletingId(id)
    try {
      const response = await adminApi.delete(`/api/v1/regions/${id}`)

      if (response.data.success) {
        // Refresh regions list
        fetchRegions(searchQuery)
      }
    } catch (error) {
      console.error('Error deleting region:', error)
      alert('Gagal menghapus wilayah')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleRegion = async (id: string, name: string, isDisabled: boolean) => {
    const action = isDisabled ? 'mengaktifkan' : 'menonaktifkan'
    if (!confirm(`Apakah Anda yakin ingin ${action} wilayah "${name}"?`)) {
      return
    }

    setTogglingId(id)
    try {
      const endpoint = isDisabled ? `/regions/${id}/enable` : `/regions/${id}/disable`
      const response = await adminApi.patch(endpoint.replace('/regions/', '/api/v1/regions/'))

      if (response.data.success) {
        // Refresh regions list
        fetchRegions(searchQuery)
      }
    } catch (error) {
      console.error(`Error ${isDisabled ? 'enabling' : 'disabling'} region:`, error)
      alert(`Gagal ${action} wilayah`)
    } finally {
      setTogglingId(null)
    }
  }

  const handleToggleSelected = async (isDisabled: boolean) => {
    if (selectedRegions.length === 0) {
      alert('Pilih minimal satu wilayah terlebih dahulu')
      return
    }

    const action = isDisabled ? 'mengaktifkan' : 'menonaktifkan'
    if (!confirm(`Apakah Anda yakin ingin ${action} ${selectedRegions.length} wilayah yang dipilih?`)) {
      return
    }

    setBulkActionLoading(true)
    try {
      const response = await adminApi.post('/api/v1/regions/bulk', {
        action: isDisabled ? 'enable' : 'disable',
        region_ids: selectedRegions
      })

      if (response.data.success) {
        setSelectedRegions([])
        fetchRegions(searchQuery, pagination.page)
        alert(`${action.charAt(0).toUpperCase() + action.slice(1)} ${response.data.summary.success} wilayah berhasil`)
      }
    } catch (error) {
      console.error(`Error bulk ${action}:`, error)
      alert(`Gagal ${action} wilayah`)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleSelectRegion = (id: string) => {
    setSelectedRegions(prev =>
      prev.includes(id)
        ? prev.filter(regionId => regionId !== id)
        : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    if (selectedRegions.length === regions.length) {
      setSelectedRegions([])
    } else {
      setSelectedRegions(regions.map(region => region.id))
    }
  }

  const handleBulkAction = async (action: 'delete' | 'disable' | 'enable') => {
    if (selectedRegions.length === 0) {
      alert('Pilih minimal satu wilayah terlebih dahulu')
      return
    }

    const actionText = {
      delete: 'menghapus',
      disable: 'menonaktifkan',
      enable: 'mengaktifkan'
    }[action]

    if (!confirm(`Apakah Anda yakin ingin ${actionText} ${selectedRegions.length} wilayah yang dipilih?`)) {
      return
    }

    setBulkActionLoading(true)
    try {
      const response = await adminApi.post('/api/v1/regions/bulk', {
        action,
        region_ids: selectedRegions
      })

      if (response.data.success) {
        setSelectedRegions([])
        fetchRegions(searchQuery, pagination.page)
        alert(`${actionText.charAt(0).toUpperCase() + actionText.slice(1)} ${response.data.summary.success} wilayah berhasil`)
      }
    } catch (error) {
      console.error(`Error bulk ${action}:`, error)
      alert(`Gagal ${actionText} wilayah`)
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleRowClick = (region: Region, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }
    if (!region.disabled_at) {
      setEditingRegion(region)
      setShowFormModal(true)
    }
  }

  const handleFormSubmit = async (formData: any) => {
    setSubmitting(true)
    try {
      if (editingRegion) {
        // Update existing region
        const response = await adminApi.put(`/api/v1/regions/${editingRegion.id}`, formData)

        if (response.data.success) {
          setShowFormModal(false)
          fetchRegions(searchQuery, pagination.page)
        }
      } else {
        // Create new region
        const response = await adminApi.post('/api/v1/regions', formData)

        if (response.data.success) {
          setShowFormModal(false)
          fetchRegions(searchQuery, 1)
        }
      }
    } catch (error: any) {
      console.error('Error saving region:', error)
      alert(error.response?.data?.message || 'Gagal menyimpan wilayah')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }))
      fetchRegions(searchQuery, newPage)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    })
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Kelola Wilayah
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col space-y-4">
            {/* Search and Add Section */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Cari wilayah, kecamatan, kabupaten, atau provinsi..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button type="submit" variant="outline" size="sm">
                    Cari
                  </Button>
                </form>

                <div className="flex items-center gap-2">
                  {/* Bulk Actions Dropdown - Always Visible */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        disabled={bulkActionLoading || selectedRegions.length === 0}
                      >
                        {bulkActionLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                        Aksi {selectedRegions.length > 0 && `(${selectedRegions.length})`}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleBulkAction('delete')}
                        disabled={selectedRegions.length === 0}
                      >
                        <Trash2 className="h-4 w-4 mr-2 text-red-600" />
                        Hapus yang dipilih
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleToggleSelected(false)}
                        disabled={selectedRegions.length === 0}
                      >
                        <PowerOff className="h-4 w-4 mr-2 text-orange-600" />
                        Nonaktifkan yang dipilih
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleSelected(true)}
                        disabled={selectedRegions.length === 0}
                      >
                        <Power className="h-4 w-4 mr-2 text-green-600" />
                        Aktifkan yang dipilih
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    onClick={handleAddRegion}
                    className="flex items-center gap-2"
                    size="sm"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Wilayah
                  </Button>
                </div>
              </div>

              {/* Filter Toggle */}
              <div className="flex items-center gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDisabled}
                    onChange={(e) => setIncludeDisabled(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">
                    Tampilkan wilayah yang dinonaktifkan
                  </span>
                </label>
              </div>
            </div>

            {/* Regions Table */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 border-b">
                  <TableRow>
                    <TableHead className="w-[50px] text-center">
                      <button
                        onClick={handleSelectAll}
                        className="flex items-center justify-center w-full"
                        title={selectedRegions.length === regions.length ? "Batalkan semua pilihan" : "Pilih semua"}
                      >
                        {selectedRegions.length === regions.length && regions.length > 0 ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                    <TableHead className="w-[200px] font-medium">Nama Wilayah</TableHead>
                    <TableHead className="w-[180px] font-medium">Kecamatan</TableHead>
                    <TableHead className="w-[180px] font-medium">Kabupaten/Kota</TableHead>
                    <TableHead className="w-[180px] font-medium">Provinsi</TableHead>
                    <TableHead className="w-[120px] font-medium">Tanggal Dibuat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="flex items-center justify-center space-x-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Memuat data wilayah...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : regions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="text-center space-y-3">
                          <Map className="h-12 w-12 text-gray-400 mx-auto" />
                          <div>
                            <p className="text-gray-600 font-medium">Belum ada data wilayah</p>
                            <p className="text-sm text-gray-500">
                              {searchQuery ? 'Coba ubah kata kunci pencarian' : 'Klik "Tambah Wilayah" untuk mulai'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    regions.map((region) => {
                      const isDisabled = !!region.disabled_at
                      const isSelected = selectedRegions.includes(region.id)
                      return (
                        <TableRow
                          key={region.id}
                          className={`${isDisabled ? 'opacity-50' : ''} ${isSelected ? 'border-l-2 border-l-blue-500' : ''} ${!isDisabled ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                          onClick={(e) => handleRowClick(region, e)}
                        >
                          <TableCell className="text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSelectRegion(region.id)
                              }}
                              className="flex items-center justify-center w-full"
                              title={isSelected ? "Batalkan pilihan" : "Pilih wilayah"}
                            >
                              {isSelected ? (
                                <CheckSquare className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Square className="h-4 w-4 opacity-40" />
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <MapPin className={`h-4 w-4 flex-shrink-0 ${isDisabled ? 'text-muted-foreground' : 'text-blue-600'}`} />
                              <div className="flex flex-col">
                                <span className={isDisabled ? 'text-muted-foreground line-through' : ''}>
                                  {region.name}
                                </span>
                                {isDisabled && (
                                  <span className="text-xs text-orange-600 font-medium">
                                    Dinonaktifkan
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {region.district ? (
                              <div className="flex items-center gap-1">
                                <Building className="h-3 w-3 text-muted-foreground" />
                                <span className={isDisabled ? 'text-muted-foreground' : ''}>
                                  {region.district}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {region.regency ? (
                              <div className="flex items-center gap-1">
                                <Map className="h-3 w-3 text-muted-foreground" />
                                <span className={isDisabled ? 'text-muted-foreground' : ''}>
                                  {region.regency}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={isDisabled ? 'text-muted-foreground' : ''}>
                              {region.province || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(region.created_at)}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Summary and Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600 py-2 border-t border-slate-200">
              <div className="text-center sm:text-left">
                {selectedRegions.length > 0 ? (
                  <span className="font-medium text-blue-600">
                    {selectedRegions.length} wilayah dipilih
                  </span>
                ) : (
                  <span>
                    Menampilkan <span className="font-medium">{regions.length}</span> dari <span className="font-medium">{pagination.total}</span> wilayah
                  </span>
                )}
              </div>

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center gap-1">
                    {[...Array(pagination.totalPages)].map((_, index) => {
                      const pageNumber = index + 1
                      const isCurrentPage = pageNumber === pagination.page

                      // Show max 5 pages with ellipsis
                      if (
                        pageNumber === 1 ||
                        pageNumber === pagination.totalPages ||
                        (pageNumber >= pagination.page - 1 && pageNumber <= pagination.page + 1)
                      ) {
                        return (
                          <Button
                            key={pageNumber}
                            variant={isCurrentPage ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(pageNumber)}
                            className="h-8 w-8 p-0"
                          >
                            {pageNumber}
                          </Button>
                        )
                      } else if (
                        pageNumber === pagination.page - 2 ||
                        pageNumber === pagination.page + 2
                      ) {
                        return (
                          <span key={pageNumber} className="px-2 text-muted-foreground">
                            ...
                          </span>
                        )
                      }
                      return null
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form Modal */}
      <RegionFormModal
        isOpen={showFormModal}
        onClose={() => setShowFormModal(false)}
        onSubmit={handleFormSubmit}
        editingRegion={editingRegion}
        isLoading={submitting}
      />
    </>
  )
}

export default RegionModal