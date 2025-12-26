'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NAS, NASFormData, DEFAULT_FORM_DATA } from '../types'
import { generateSecret } from '../utils'
import { Save, RefreshCw, Network, Server } from 'lucide-react'

interface Props {
    open: boolean
    onClose: () => void
    editingNAS: NAS | null
    onSave: (data: NASFormData, isEdit: boolean, id?: string) => Promise<void>
    saving?: boolean
}

export function NASFormModal({ open, onClose, editingNAS, onSave, saving }: Props) {
    const [formData, setFormData] = useState<NASFormData>(DEFAULT_FORM_DATA)
    const [localSaving, setLocalSaving] = useState(false)

    useEffect(() => {
        if (editingNAS) {
            setFormData({
                shortname: editingNAS.shortname || '',
                nasname: editingNAS.nasname || '',
                secret: editingNAS.secret || '',
                type: editingNAS.type || 'mikrotik',
                description: editingNAS.description || '',
                priority: editingNAS.priority || 1,
                snmp_enabled: editingNAS.snmp_enabled || false,
                snmp_community: editingNAS.snmp_community || 'kilusibill',
                snmp_community_trap: editingNAS.snmp_community_trap || 'kilusibill',
                snmp_version: editingNAS.snmp_version || '2c',
                snmp_port: editingNAS.snmp_port || 161,
                snmp_username: editingNAS.snmp_username || '',
                snmp_auth_protocol: editingNAS.snmp_auth_protocol || 'SHA',
                snmp_auth_password: editingNAS.snmp_auth_password || '',
                snmp_priv_protocol: editingNAS.snmp_priv_protocol || 'AES',
                snmp_priv_password: editingNAS.snmp_priv_password || '',
                snmp_security_level: editingNAS.snmp_security_level || 'authPriv'
            })
        } else {
            setFormData({ ...DEFAULT_FORM_DATA, secret: generateSecret() })
        }
    }, [editingNAS, open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLocalSaving(true)
        try {
            await onSave(formData, !!editingNAS, editingNAS?.id)
            onClose()
        } catch (err: any) {
            alert(err.message || 'Failed to save NAS')
        } finally {
            setLocalSaving(false)
        }
    }

    const isSaving = saving || localSaving

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={editingNAS ? `Edit NAS - ${editingNAS.shortname}` : 'Tambah NAS Baru'}
            size="lg"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div>
                    <h3 className="text-lg font-medium mb-4 flex items-center text-gray-900 dark:text-gray-100">
                        <Server className="h-5 w-5 mr-2" />
                        Informasi Dasar
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Nama NAS *</label>
                            <Input
                                value={formData.shortname}
                                onChange={(e) => setFormData({ ...formData, shortname: e.target.value })}
                                placeholder="ROUTER-1"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">IP Address *</label>
                            <Input
                                value={formData.nasname}
                                onChange={(e) => setFormData({ ...formData, nasname: e.target.value })}
                                placeholder="192.168.1.1"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Secret *</label>
                            <div className="flex space-x-2">
                                <Input
                                    value={formData.secret}
                                    onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                                    placeholder="RADIUS secret"
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setFormData({ ...formData, secret: generateSecret() })}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                            >
                                <option value="mikrotik">Mikrotik</option>
                                <option value="cisco">Cisco</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Description</label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Main router for customer connections"
                            />
                        </div>
                    </div>
                </div>

                {/* SNMP Configuration */}
                <div className="border-t pt-4 dark:border-gray-700">
                    <h3 className="text-lg font-medium mb-4 flex items-center text-gray-900 dark:text-gray-100">
                        <Network className="h-5 w-5 mr-2" />
                        SNMP Configuration
                    </h3>

                    <div className="flex items-center space-x-2 mb-4">
                        <input
                            type="checkbox"
                            id="snmp_enabled"
                            checked={formData.snmp_enabled}
                            onChange={(e) => setFormData({ ...formData, snmp_enabled: e.target.checked })}
                            className="rounded"
                        />
                        <label htmlFor="snmp_enabled" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Enable SNMP Monitoring
                        </label>
                    </div>

                    {formData.snmp_enabled && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">SNMP Version</label>
                                    <select
                                        value={formData.snmp_version}
                                        onChange={(e) => setFormData({ ...formData, snmp_version: e.target.value })}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                                    >
                                        <option value="1">SNMP v1</option>
                                        <option value="2c">SNMP v2c</option>
                                        <option value="3">SNMP v3</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">SNMP Port</label>
                                    <Input
                                        type="number"
                                        value={formData.snmp_port}
                                        onChange={(e) => setFormData({ ...formData, snmp_port: parseInt(e.target.value) || 161 })}
                                    />
                                </div>
                            </div>

                            {(formData.snmp_version === '1' || formData.snmp_version === '2c') && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">SNMP Community</label>
                                        <Input
                                            value={formData.snmp_community}
                                            onChange={(e) => setFormData({ ...formData, snmp_community: e.target.value })}
                                            placeholder="kilusibill"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">SNMP Trap Community</label>
                                        <Input
                                            value={formData.snmp_community_trap}
                                            onChange={(e) => setFormData({ ...formData, snmp_community_trap: e.target.value })}
                                            placeholder="kilusibill"
                                        />
                                    </div>
                                </div>
                            )}

                            {formData.snmp_version === '3' && (
                                <div className="space-y-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700">
                                    <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">SNMP v3 Security Settings</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Username</label>
                                            <Input
                                                value={formData.snmp_username}
                                                onChange={(e) => setFormData({ ...formData, snmp_username: e.target.value })}
                                                placeholder="snmpuser"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Security Level</label>
                                            <select
                                                value={formData.snmp_security_level}
                                                onChange={(e) => setFormData({ ...formData, snmp_security_level: e.target.value })}
                                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                                            >
                                                <option value="noAuthNoPriv">No Auth, No Privacy</option>
                                                <option value="authNoPriv">Auth, No Privacy</option>
                                                <option value="authPriv">Auth + Privacy</option>
                                            </select>
                                        </div>
                                        {formData.snmp_security_level !== 'noAuthNoPriv' && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Auth Protocol</label>
                                                    <select
                                                        value={formData.snmp_auth_protocol}
                                                        onChange={(e) => setFormData({ ...formData, snmp_auth_protocol: e.target.value })}
                                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                                                    >
                                                        <option value="MD5">MD5</option>
                                                        <option value="SHA">SHA</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Auth Password</label>
                                                    <Input
                                                        type="password"
                                                        value={formData.snmp_auth_password}
                                                        onChange={(e) => setFormData({ ...formData, snmp_auth_password: e.target.value })}
                                                    />
                                                </div>
                                            </>
                                        )}
                                        {formData.snmp_security_level === 'authPriv' && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Privacy Protocol</label>
                                                    <select
                                                        value={formData.snmp_priv_protocol}
                                                        onChange={(e) => setFormData({ ...formData, snmp_priv_protocol: e.target.value })}
                                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                                                    >
                                                        <option value="DES">DES</option>
                                                        <option value="AES">AES</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Privacy Password</label>
                                                    <Input
                                                        type="password"
                                                        value={formData.snmp_priv_password}
                                                        onChange={(e) => setFormData({ ...formData, snmp_priv_password: e.target.value })}
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-2 pt-4 border-t dark:border-gray-700">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                            <>
                                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4 mr-1" />
                                {editingNAS ? 'Update NAS' : 'Simpan NAS'}
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </Modal>
    )
}
