import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui'
import { AlertCircle, Edit, Eye, EyeOff, Upload, X } from 'lucide-react'
import { GenieACSDevice } from '../types'

interface EditSSIDModalProps {
    device: GenieACSDevice
    isOpen: boolean
    onClose: () => void
    onSave: (ssid: string, password: string) => Promise<void>
    loading: boolean
}

export function EditSSIDModal({ device, isOpen, onClose, onSave, loading }: EditSSIDModalProps) {
    const [ssid, setSsid] = useState(device.ssid || '')
    const [password, setPassword] = useState(device.password || '')
    const [showPassword, setShowPassword] = useState(false)

    if (!isOpen) return null

    const handleSave = () => {
        onSave(ssid, password)
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="max-w-md w-full">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">
                        <div className="flex items-center space-x-2">
                            <Edit className="h-5 w-5 text-primary" />
                            <span>Edit SSID & Password WiFi</span>
                        </div>
                    </CardTitle>
                    <Button variant="ghost" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Device Info</label>
                            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Serial:</span>
                                    <span className="text-sm font-mono">{device.serialNumber}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">PPPoE:</span>
                                    <span className="text-sm font-mono">{device.pppoeUsername}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm text-muted-foreground">Customer:</span>
                                    <span className="text-sm font-mono">{device.tag}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">SSID WiFi</label>
                            <Input
                                value={ssid}
                                onChange={(e) => setSsid(e.target.value)}
                                placeholder="Masukkan SSID baru"
                                className="w-full"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Password WiFi</label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Masukkan password baru (min 8 karakter)"
                                    className="w-full pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <p className="text-xs text-blue-800 dark:text-blue-300">
                                Perubahan akan diterapkan langsung ke perangkat ONU. Pastikan device online.
                            </p>
                        </div>

                        <div className="flex space-x-3 pt-2">
                            <Button
                                onClick={handleSave}
                                disabled={loading || (!ssid && !password)}
                                className="flex-1"
                            >
                                {loading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-foreground border-t-transparent mr-2" />
                                        Menyimpan...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Simpan Perubahan
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Batal
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
