'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
    Plus,
    Edit2,
    Trash2,
    Search,
    UserCog,
    Shield,
    Wrench,
    DollarSign,
    User,
    Loader2,
    Key,
    Eye,
    EyeOff,
    Clock
} from 'lucide-react'
import { adminApi } from '@/lib/api-clients'

interface Admin {
    id: string
    username: string
    role: 'superadmin' | 'administrator' | 'technician' | 'finance' | 'operator' | 'admin' // Added legacy admin
    is_active: boolean
    last_login: string | null
    created_at: string
    updated_at: string
}

const ROLES = [
    { value: 'superadmin', label: 'Super Admin', icon: Shield, color: 'bg-purple-600' },
    { value: 'administrator', label: 'Administrator', icon: Shield, color: 'bg-red-500' },
    { value: 'technician', label: 'Teknisi', icon: Wrench, color: 'bg-blue-500' },
    { value: 'finance', label: 'Finance', icon: DollarSign, color: 'bg-green-500' },
    { value: 'operator', label: 'Operator', icon: User, color: 'bg-gray-500' },
    // Hidden legacy role 'admin' will map to 'administrator' functionality if needed, 
    // but new users should use explicit roles
]

export default function AdminUsersPage() {
    const [admins, setAdmins] = useState<Admin[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('all')

    // Dialogs
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [showEditDialog, setShowEditDialog] = useState(false)
    const [showPasswordDialog, setShowPasswordDialog] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Selected admin
    const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)

    // Form states
    const [formLoading, setFormLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'operator',
        is_active: true
    })
    const [passwordData, setPasswordData] = useState({
        password: '',
        confirmPassword: ''
    })

    const fetchAdmins = async () => {
        try {
            setLoading(true)
            const response = await adminApi.get('/api/v1/admins')

            if (response.data.success) {
                setAdmins(response.data.data.admins)
            } else {
                alert('Gagal memuat data admin: ' + (response.data.message || 'Unknown error'))
            }
        } catch (error: any) {
            console.error('Error fetching admins:', error)
            if (error.response?.status === 401) {
                alert('Session habis, silakan login ulang')
                window.location.href = '/admin/login'
            } else {
                alert('Terjadi kesalahan saat memuat data admin')
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAdmins()
    }, [])

    const handleCreateAdmin = async () => {
        if (!formData.username || !formData.password) {
            alert('Username dan password wajib diisi')
            return
        }

        try {
            setFormLoading(true)
            const response = await adminApi.post('/api/v1/admins', {
                username: formData.username,
                password: formData.password,
                role: formData.role
            })

            if (response.data.success) {
                setShowCreateDialog(false)
                resetForm()
                fetchAdmins()
                alert('Admin berhasil dibuat')
            } else {
                alert(response.data.message || 'Gagal membuat admin')
            }
        } catch (error: any) {
            console.error('Error creating admin:', error)
            alert(error.response?.data?.message || 'Gagal membuat admin')
        } finally {
            setFormLoading(false)
        }
    }

    const handleUpdateAdmin = async () => {
        if (!selectedAdmin) return

        try {
            setFormLoading(true)
            const response = await adminApi.put(`/api/v1/admins/${selectedAdmin.id}`, {
                username: formData.username,
                role: formData.role,
                is_active: formData.is_active
            })

            if (response.data.success) {
                setShowEditDialog(false)
                resetForm()
                fetchAdmins()
                alert('Admin berhasil diperbarui')
            } else {
                alert(response.data.message || 'Gagal memperbarui admin')
            }
        } catch (error: any) {
            console.error('Error updating admin:', error)
            alert(error.response?.data?.message || 'Gagal memperbarui admin')
        } finally {
            setFormLoading(false)
        }
    }

    const handleChangePassword = async () => {
        if (!selectedAdmin) return

        if (passwordData.password !== passwordData.confirmPassword) {
            alert('Password dan konfirmasi password tidak sama')
            return
        }

        if (passwordData.password.length < 6) {
            alert('Password minimal 6 karakter')
            return
        }

        try {
            setFormLoading(true)
            const response = await adminApi.put(`/api/v1/admins/${selectedAdmin.id}/password`, {
                password: passwordData.password
            })

            if (response.data.success) {
                setShowPasswordDialog(false)
                setPasswordData({ password: '', confirmPassword: '' })
                setSelectedAdmin(null)
                alert('Password berhasil diubah')
            } else {
                alert(response.data.message || 'Gagal mengubah password')
            }
        } catch (error: any) {
            console.error('Error changing password:', error)
            alert(error.response?.data?.message || 'Gagal mengubah password')
        } finally {
            setFormLoading(false)
        }
    }

    const handleDeleteAdmin = async () => {
        if (!selectedAdmin) return

        try {
            setFormLoading(true)
            const response = await adminApi.delete(`/api/v1/admins/${selectedAdmin.id}`)

            if (response.data.success) {
                setShowDeleteConfirm(false)
                setSelectedAdmin(null)
                fetchAdmins()
                alert('Admin berhasil dihapus')
            } else {
                alert(response.data.message || 'Gagal menghapus admin')
            }
        } catch (error: any) {
            console.error('Error deleting admin:', error)
            alert(error.response?.data?.message || 'Gagal menghapus admin')
        } finally {
            setFormLoading(false)
        }
    }

    const openEditDialog = (admin: Admin) => {
        setSelectedAdmin(admin)
        setFormData({
            username: admin.username,
            password: '',
            role: admin.role,
            is_active: admin.is_active
        })
        setShowEditDialog(true)
    }

    const openPasswordDialog = (admin: Admin) => {
        setSelectedAdmin(admin)
        setPasswordData({ password: '', confirmPassword: '' })
        setShowPasswordDialog(true)
    }

    const openDeleteConfirm = (admin: Admin) => {
        setSelectedAdmin(admin)
        setShowDeleteConfirm(true)
    }

    const resetForm = () => {
        setFormData({
            username: '',
            password: '',
            role: 'operator',
            is_active: true
        })
        setSelectedAdmin(null)
        setShowPassword(false)
    }

    const getRoleInfo = (role: string) => {
        const found = ROLES.find(r => r.value === role || r.value === role?.toLowerCase()?.trim())
        if (!found) {
            console.warn(`Unknown role: "${role}", defaulting to first role`)
        }
        return found || ROLES[0] // Fallback to superadmin instead of operator
    }

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-'
        return new Date(dateString).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const filteredAdmins = admins.filter(admin => {
        const matchesSearch = admin.username.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesRole = roleFilter === 'all' || admin.role === roleFilter
        return matchesSearch && matchesRole
    })

    // Stats
    const stats = {
        total: admins.length,
        active: admins.filter(a => a.is_active).length,
        byRole: ROLES.map(role => ({
            ...role,
            count: admins.filter(a => a.role === role.value).length
        }))
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Manajemen User</h1>
                    <p className="text-muted-foreground">Kelola akun admin, teknisi, dan finance</p>
                </div>
                <Button onClick={() => { resetForm(); setShowCreateDialog(true) }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah User
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <UserCog className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-xs text-muted-foreground">Total User</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center space-x-2">
                            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                                <User className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.active}</p>
                                <p className="text-xs text-muted-foreground">Aktif</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {stats.byRole.map(role => {
                    const Icon = role.icon
                    return (
                        <Card key={role.value}>
                            <CardContent className="pt-4">
                                <div className="flex items-center space-x-2">
                                    <div className={`w-10 h-10 rounded-full ${role.color}/10 flex items-center justify-center`}>
                                        <Icon className={`h-5 w-5 ${role.color.replace('bg-', 'text-')}`} />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">{role.count}</p>
                                        <p className="text-xs text-muted-foreground">{role.label}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* Main Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Daftar User</CardTitle>
                    <CardDescription>
                        Total {filteredAdmins.length} user ditemukan
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-4 mb-6">
                        <div className="flex items-center space-x-2 flex-1">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cari username..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="max-w-sm"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter Role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Semua Role</SelectItem>
                                {ROLES.map(role => (
                                    <SelectItem key={role.value} value={role.value}>
                                        {role.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-4 font-medium">Username</th>
                                        <th className="text-left py-3 px-4 font-medium">Role</th>
                                        <th className="text-left py-3 px-4 font-medium">Status</th>
                                        <th className="text-left py-3 px-4 font-medium">Login Terakhir</th>
                                        <th className="text-left py-3 px-4 font-medium">Dibuat</th>
                                        <th className="text-right py-3 px-4 font-medium">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAdmins.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-8 text-muted-foreground">
                                                Tidak ada data user
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAdmins.map(admin => {
                                            const roleInfo = getRoleInfo(admin.role)
                                            const RoleIcon = roleInfo.icon
                                            return (
                                                <tr key={admin.id} className="border-b hover:bg-muted/50">
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center space-x-3">
                                                            <div className={`w-8 h-8 rounded-full ${roleInfo.color} flex items-center justify-center text-white`}>
                                                                {admin.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-medium">{admin.username}</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <Badge variant="outline" className="flex items-center w-fit space-x-1">
                                                            <RoleIcon className="h-3 w-3 mr-1" />
                                                            {roleInfo.label}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <Badge variant={admin.is_active ? 'default' : 'secondary'}>
                                                            {admin.is_active ? 'Aktif' : 'Nonaktif'}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex items-center text-sm text-muted-foreground">
                                                            <Clock className="h-3 w-3 mr-1" />
                                                            {formatDate(admin.last_login)}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-muted-foreground">
                                                        {formatDate(admin.created_at)}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <div className="flex justify-end space-x-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openPasswordDialog(admin)}
                                                                title="Ubah Password"
                                                            >
                                                                <Key className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openEditDialog(admin)}
                                                                title="Edit"
                                                            >
                                                                <Edit2 className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openDeleteConfirm(admin)}
                                                                className="text-destructive hover:text-destructive"
                                                                title="Hapus"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Tambah User Baru</DialogTitle>
                        <DialogDescription>
                            Buat akun administrator, teknisi, atau finance baru
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="create-username">Username</Label>
                            <Input
                                id="create-username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="Masukkan username"
                            />
                        </div>
                        <div>
                            <Label htmlFor="create-password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="create-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Masukkan password"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="create-role">Role</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Pilih role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.map(role => (
                                        <SelectItem key={role.value} value={role.value}>
                                            <div className="flex items-center">
                                                <role.icon className="h-4 w-4 mr-2" />
                                                {role.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={formLoading}>
                            Batal
                        </Button>
                        <Button onClick={handleCreateAdmin} disabled={formLoading || !formData.username || !formData.password}>
                            {formLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Menyimpan...
                                </>
                            ) : (
                                'Simpan'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                        <DialogDescription>
                            Ubah informasi user {selectedAdmin?.username}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="edit-username">Username</Label>
                            <Input
                                id="edit-username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="Masukkan username"
                            />
                        </div>
                        <div>
                            <Label htmlFor="edit-role">Role</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Pilih role" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ROLES.map(role => (
                                        <SelectItem key={role.value} value={role.value}>
                                            <div className="flex items-center">
                                                <role.icon className="h-4 w-4 mr-2" />
                                                {role.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Switch
                                id="edit-active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                            <Label htmlFor="edit-active">Aktif</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={formLoading}>
                            Batal
                        </Button>
                        <Button onClick={handleUpdateAdmin} disabled={formLoading || !formData.username}>
                            {formLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Menyimpan...
                                </>
                            ) : (
                                'Update'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Password Dialog */}
            <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ubah Password</DialogTitle>
                        <DialogDescription>
                            Ubah password untuk {selectedAdmin?.username}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="new-password">Password Baru</Label>
                            <div className="relative">
                                <Input
                                    id="new-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={passwordData.password}
                                    onChange={(e) => setPasswordData({ ...passwordData, password: e.target.value })}
                                    placeholder="Masukkan password baru"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="confirm-password">Konfirmasi Password</Label>
                            <Input
                                id="confirm-password"
                                type={showPassword ? 'text' : 'password'}
                                value={passwordData.confirmPassword}
                                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                placeholder="Konfirmasi password baru"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPasswordDialog(false)} disabled={formLoading}>
                            Batal
                        </Button>
                        <Button
                            onClick={handleChangePassword}
                            disabled={formLoading || !passwordData.password || !passwordData.confirmPassword}
                        >
                            {formLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Menyimpan...
                                </>
                            ) : (
                                'Ubah Password'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Konfirmasi Hapus</DialogTitle>
                        <DialogDescription>
                            Apakah Anda yakin ingin menghapus user <strong>{selectedAdmin?.username}</strong>?
                            Tindakan ini tidak dapat dibatalkan.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={formLoading}>
                            Batal
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteAdmin} disabled={formLoading}>
                            {formLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Menghapus...
                                </>
                            ) : (
                                'Hapus'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
