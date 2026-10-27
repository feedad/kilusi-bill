'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { adminApi } from '@/lib/api-clients'
import {
  Bot,
  Save,
  RefreshCw,
  Shield,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  KeyRound,
  Cpu,
  Users,
  History,
  Plus,
  Trash2,
  Sparkles,
  Lock,
  Unlock
} from 'lucide-react'

interface AgentConfig {
  enabled: boolean
  base_url: string
  api_key_masked: string
  has_api_key: boolean
  model: string
  daily_token_budget: number
  daily_write_limit: number
}

interface TokenUsage {
  date: string
  tokens_used: number
  token_budget: number
  tokens_remaining: number
}

interface WriteToolMeta {
  name: string
  label: string
  description: string
  roles: string[]
}

interface AgentMember {
  id: number
  member_type: 'superadmin' | 'admin' | 'mitra' | 'technician'
  ref_id: string | null
  name: string
  phone: string
  can_read: boolean
  can_write: boolean
  allowed_write_tools: string[]
  enabled: boolean
  scope_label: string
}

interface AuditLogItem {
  id: number
  phone: string
  member_name: string
  role: string
  tool_name: string
  tool_args: Record<string, unknown>
  status: string
  result_summary: string
  tokens_used: number
  created_at: string
}

interface PendingActionItem {
  id: number
  code: string
  phone: string
  member_name: string
  role: string
  tool: string
  summary: string
  status: string
  expires_at: string
  created_at: string
}

interface PlaygroundToolCall {
  name: string
  args: Record<string, unknown>
  status: string
  result: unknown
}

export default function InternalAgentTab() {
  const [config, setConfig] = useState<AgentConfig>({
    enabled: true,
    base_url: 'http://172.22.10.201:20128/v1',
    api_key_masked: '',
    has_api_key: false,
    model: 'cx/gpt-5.4',
    daily_token_budget: 200000,
    daily_write_limit: 30
  })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [usage, setUsage] = useState<TokenUsage>({
    date: '',
    tokens_used: 0,
    token_budget: 200000,
    tokens_remaining: 200000
  })
  const [members, setMembers] = useState<AgentMember[]>([])
  const [writeTools, setWriteTools] = useState<WriteToolMeta[]>([])
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [pendingActions, setPendingActions] = useState<PendingActionItem[]>([])

  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [syncingMembers, setSyncingMembers] = useState(false)
  const [savingMemberId, setSavingMemberId] = useState<number | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)

  // New member form
  const [showAddMember, setShowAddMember] = useState(false)
  const [newMember, setNewMember] = useState({
    member_type: 'admin' as 'admin' | 'mitra' | 'technician',
    name: '',
    phone: '',
    can_write: false
  })

  // Playground state
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [testPrompt, setTestPrompt] = useState('')
  const [testingAgent, setTestingAgent] = useState(false)
  const [testResult, setTestResult] = useState<{
    reply: string
    tool_calls: PlaygroundToolCall[]
    tokens_used: number
    identity: {
      name: string
      phone: string
      role: string
      can_write: boolean
      region_names: string[]
    }
  } | null>(null)

  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, logsRes] = await Promise.all([
        adminApi.get('/api/v1/whatsapp/internal-agent/config'),
        adminApi.get('/api/v1/whatsapp/internal-agent/logs?limit=30')
      ])

      if (cfgRes.data?.success && cfgRes.data?.data) {
        const d = cfgRes.data.data
        setConfig(d.config)
        setUsage(d.usage)
        setMembers(d.members || [])
        setWriteTools(d.available_write_tools || [])
        if (!selectedMemberId && d.members?.length > 0) {
          setSelectedMemberId(String(d.members[0].id))
        }
      }

      if (logsRes.data?.success && logsRes.data?.data) {
        setLogs(logsRes.data.data.logs || [])
        setPendingActions(logsRes.data.data.pending_actions || [])
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat data AI Agent'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setLoading(false)
    }
  }, [selectedMemberId])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    setAlertMsg(null)
    try {
      const payload: Record<string, unknown> = {
        enabled: config.enabled,
        base_url: config.base_url,
        model: config.model,
        daily_token_budget: Number(config.daily_token_budget),
        daily_write_limit: Number(config.daily_write_limit)
      }
      if (apiKeyInput.trim()) {
        payload.api_key = apiKeyInput.trim()
      }

      const res = await adminApi.put('/api/v1/whatsapp/internal-agent/config', payload)
      if (res.data?.success) {
        setConfig(res.data.data)
        setApiKeyInput('')
        setAlertMsg({ type: 'success', text: 'Konfigurasi AI Agent berhasil disimpan.' })
      } else {
        setAlertMsg({ type: 'error', text: res.data?.message || 'Gagal menyimpan konfigurasi' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan konfigurasi'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleFetchModels = async () => {
    setLoadingModels(true)
    setAlertMsg(null)
    try {
      const params = new URLSearchParams()
      if (config.base_url) params.set('base_url', config.base_url)
      if (apiKeyInput.trim()) params.set('api_key', apiKeyInput.trim())

      const res = await adminApi.get(`/api/v1/whatsapp/internal-agent/models?${params.toString()}`)
      if (res.data?.success && Array.isArray(res.data.data?.models)) {
        const ids = res.data.data.models.map((m: { id: string }) => m.id)
        setAvailableModels(ids)
        setAlertMsg({
          type: 'success',
          text: `Berhasil memuat ${ids.length} model dari endpoint LLM.`
        })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat daftar model'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSyncMembers = async () => {
    setSyncingMembers(true)
    setAlertMsg(null)
    try {
      const res = await adminApi.post('/api/v1/whatsapp/internal-agent/members/sync', {})
      if (res.data?.success) {
        setMembers(res.data.data.members || [])
        setAlertMsg({ type: 'success', text: 'Daftar anggota berhasil disinkronkan dari tabel Users & Mitra.' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal sinkronisasi anggota'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setSyncingMembers(false)
    }
  }

  const handleUpdateMember = async (member: AgentMember, patch: Partial<AgentMember>) => {
    setSavingMemberId(member.id)
    setAlertMsg(null)
    try {
      const updated = { ...member, ...patch }
      const res = await adminApi.put(`/api/v1/whatsapp/internal-agent/members/${member.id}`, {
        member_type: updated.member_type,
        name: updated.name,
        phone: updated.phone,
        can_read: updated.can_read,
        can_write: updated.can_write,
        allowed_write_tools: updated.allowed_write_tools,
        enabled: updated.enabled
      })
      if (res.data?.success) {
        setMembers(res.data.data.members || [])
        setAlertMsg({ type: 'success', text: `Izin untuk ${updated.name} berhasil diperbarui.` })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui izin anggota'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setSavingMemberId(null)
    }
  }

  const handleToggleMemberTool = (member: AgentMember, toolName: string) => {
    const current = Array.isArray(member.allowed_write_tools) ? member.allowed_write_tools : []
    const next = current.includes(toolName)
      ? current.filter(t => t !== toolName)
      : [...current, toolName]
    handleUpdateMember(member, { allowed_write_tools: next })
  }

  const handleAddMember = async () => {
    if (!newMember.name.trim() || !newMember.phone.trim()) {
      setAlertMsg({ type: 'error', text: 'Nama dan nomor WhatsApp wajib diisi.' })
      return
    }
    setSavingMemberId(-1)
    try {
      const defaultTools = newMember.can_write
        ? (newMember.member_type === 'technician'
            ? ['record_payment', 'update_ticket_status']
            : ['record_payment', 'resend_invoice', 'update_ticket_status', 'suspend_service', 'restore_service'])
        : []

      const res = await adminApi.post('/api/v1/whatsapp/internal-agent/members', {
        member_type: newMember.member_type,
        name: newMember.name.trim(),
        phone: newMember.phone.trim(),
        can_read: true,
        can_write: newMember.can_write,
        allowed_write_tools: defaultTools,
        enabled: true
      })
      if (res.data?.success) {
        setMembers(res.data.data.members || [])
        setShowAddMember(false)
        setNewMember({ member_type: 'admin', name: '', phone: '', can_write: false })
        setAlertMsg({ type: 'success', text: 'Nomor anggota baru berhasil ditambahkan.' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menambahkan anggota'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setSavingMemberId(null)
    }
  }

  const handleDeleteMember = async (member: AgentMember) => {
    if (member.member_type === 'superadmin') return
    setSavingMemberId(member.id)
    try {
      const res = await adminApi.delete(`/api/v1/whatsapp/internal-agent/members/${member.id}`)
      if (res.data?.success) {
        setMembers(res.data.data.members || [])
        setAlertMsg({ type: 'success', text: `Anggota ${member.name} dihapus.` })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus anggota'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setSavingMemberId(null)
    }
  }

  const handleRefreshLogs = async () => {
    setLoadingLogs(true)
    try {
      const res = await adminApi.get('/api/v1/whatsapp/internal-agent/logs?limit=30')
      if (res.data?.success && res.data?.data) {
        setLogs(res.data.data.logs || [])
        setPendingActions(res.data.data.pending_actions || [])
      }
    } finally {
      setLoadingLogs(false)
    }
  }

  const handleRunTest = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? testPrompt).trim()
    if (!promptToSend) return

    setTestingAgent(true)
    setAlertMsg(null)
    try {
      const res = await adminApi.post('/api/v1/whatsapp/internal-agent/test', {
        member_id: selectedMemberId ? Number(selectedMemberId) : undefined,
        message: promptToSend
      })
      if (res.data?.success && res.data?.data) {
        setTestResult(res.data.data)
        if (res.data.data.usage) {
          setUsage(res.data.data.usage)
        }
        handleRefreshLogs()
      } else {
        setAlertMsg({ type: 'error', text: res.data?.message || 'Simulasi gagal dijalankan' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Simulasi gagal dijalankan'
      setAlertMsg({ type: 'error', text: msg })
    } finally {
      setTestingAgent(false)
    }
  }

  const roleBadge = (role: string) => {
    switch (role) {
      case 'superadmin':
        return <Badge className="bg-purple-600 text-white">Superadmin</Badge>
      case 'admin':
        return <Badge className="bg-blue-600 text-white">Admin</Badge>
      case 'mitra':
        return <Badge className="bg-emerald-600 text-white">Mitra Wilayah</Badge>
      case 'technician':
        return <Badge className="bg-amber-600 text-white">Teknisi</Badge>
      default:
        return <Badge variant="outline">{role}</Badge>
    }
  }

  const usagePercent = usage.token_budget > 0
    ? Math.min(100, Math.round((usage.tokens_used / usage.token_budget) * 100))
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-600" />
        <span>Memuat pengaturan AI Asisten Internal...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {alertMsg && (
        <Alert variant={alertMsg.type === 'error' ? 'destructive' : 'default'}>
          {alertMsg.type === 'error' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          <AlertDescription>{alertMsg.text}</AlertDescription>
        </Alert>
      )}

      {/* 1. LLM Configuration & Token Budget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bot className="w-5 h-5 text-blue-600" />
                <CardTitle>Konfigurasi AI Asisten Internal (Baileys)</CardTitle>
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="ai-agent-enabled" className="text-sm font-medium">
                  {config.enabled ? 'Aktif' : 'Nonaktif'}
                </Label>
                <Switch
                  id="ai-agent-enabled"
                  checked={config.enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
                />
              </div>
            </div>
            <CardDescription>
              Asisten AI khusus nomor internal (Superadmin, Admin, Mitra, Teknisi) melalui koneksi Baileys. Tidak mengubah alur Omnichat pelanggan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>OpenAI-Compatible Base URL</Label>
                <Input
                  value={config.base_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, base_url: e.target.value }))}
                  placeholder="http://172.22.10.201:20128/v1"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>API Key Endpoint</span>
                  {config.has_api_key && (
                    <span className="text-xs text-emerald-600 font-normal">
                      Tersimpan: {config.api_key_masked}
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                  <Input
                    type="password"
                    className="pl-9"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={config.has_api_key ? 'Kosongkan jika tidak ingin mengubah API Key' : 'Masukkan sk-...'}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Model LLM</Label>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={loadingModels}
                    className="text-xs text-blue-600 hover:underline flex items-center"
                  >
                    {loadingModels ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Muat Model
                  </button>
                </div>
                {availableModels.length > 0 ? (
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={config.model}
                    onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                  >
                    {!availableModels.includes(config.model) && (
                      <option value={config.model}>{config.model}</option>
                    )}
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={config.model}
                    onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                    placeholder="cx/gpt-5.4"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Batas Token Harian</Label>
                <Input
                  type="number"
                  value={config.daily_token_budget}
                  onChange={(e) => setConfig(prev => ({ ...prev, daily_token_budget: Number(e.target.value) }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Batas Eksekusi Tulis / Hari</Label>
                <Input
                  type="number"
                  value={config.daily_write_limit}
                  onChange={(e) => setConfig(prev => ({ ...prev, daily_write_limit: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveConfig} disabled={savingConfig}>
                {savingConfig ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Simpan Konfigurasi AI
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Daily Token Usage Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-emerald-600" />
              <CardTitle>Pemakaian Token Hari Ini</CardTitle>
            </div>
            <CardDescription>Tanggal (WIB): {usage.date || '-'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Terpakai</span>
                <span className="font-semibold">
                  {usage.tokens_used.toLocaleString('id-ID')} / {usage.token_budget.toLocaleString('id-ID')}
                </span>
              </div>
              <Progress value={usagePercent} className="h-2.5" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                <span>{usagePercent}% dari kuota harian</span>
                <span>Sisa: {usage.tokens_remaining.toLocaleString('id-ID')}</span>
              </div>
            </div>

            <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1.5">
              <div className="font-medium flex items-center">
                <Shield className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Keamanan Aksi Tulis (2-Tahap):
              </div>
              <p className="text-muted-foreground">
                Semua aksi perubahan data (Catat Pembayaran, Isolir, Buka Isolir, Tiket) menghasilkan kode 6 karakter dan <strong>wajib dibalas YA &lt;KODE&gt;</strong> dalam 5 menit.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Role & Write Permission Matrix */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <CardTitle>Daftar Nomor Internal & Matriks Izin Akses</CardTitle>
              </div>
              <CardDescription>
                Atur nomor WhatsApp Superadmin, Admin, Mitra Wilayah, dan Teknisi beserta izin eksekusi tulis (Write Permission) per orang.
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleSyncMembers} disabled={syncingMembers}>
                {syncingMembers ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                )}
                Sinkronkan User & Mitra
              </Button>
              <Button size="sm" onClick={() => setShowAddMember(prev => !prev)}>
                <Plus className="w-4 h-4 mr-1.5" />
                Tambah Nomor
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showAddMember && (
            <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
              <div className="font-medium text-sm">Tambah Nomor Internal Baru</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Peran (Role)</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
                    value={newMember.member_type}
                    onChange={(e) => setNewMember(prev => ({
                      ...prev,
                      member_type: e.target.value as 'admin' | 'mitra' | 'technician'
                    }))}
                  >
                    <option value="admin">Admin Operasional</option>
                    <option value="mitra">Mitra Wilayah</option>
                    <option value="technician">Teknisi</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Nama Lengkap</Label>
                  <Input
                    className="h-9 mt-1"
                    value={newMember.name}
                    onChange={(e) => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Contoh: Budi (Admin)"
                  />
                </div>
                <div>
                  <Label className="text-xs">Nomor WhatsApp (628...)</Label>
                  <Input
                    className="h-9 mt-1"
                    value={newMember.phone}
                    onChange={(e) => setNewMember(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="628123456789"
                  />
                </div>
                <div className="flex items-end space-x-2">
                  <Button size="sm" onClick={handleAddMember} disabled={savingMemberId === -1}>
                    Simpan
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddMember(false)}>
                    Batal
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2.5 px-3">Nama & Peran</th>
                  <th className="py-2.5 px-3">No. WhatsApp</th>
                  <th className="py-2.5 px-3">Cakupan Wilayah / Data</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Izin Tulis (Write)</th>
                  <th className="py-2.5 px-3">Aksi Tulis yang Diizinkan</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((m) => {
                  const isSuper = m.member_type === 'superadmin'
                  const roleTools = writeTools.filter(t => t.roles.includes(m.member_type))
                  return (
                    <tr key={m.id} className={!m.enabled ? 'opacity-60 bg-muted/20' : ''}>
                      <td className="py-3 px-3">
                        <div className="font-medium">{m.name}</div>
                        <div className="mt-1">{roleBadge(m.member_type)}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">{m.phone}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground max-w-xs">
                        {m.scope_label}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Switch
                          checked={m.enabled}
                          disabled={isSuper || savingMemberId === m.id}
                          onCheckedChange={(checked) => handleUpdateMember(m, { enabled: checked })}
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <Switch
                            checked={isSuper ? true : m.can_write}
                            disabled={isSuper || savingMemberId === m.id}
                            onCheckedChange={(checked) => {
                              const defaultTools = checked && (!m.allowed_write_tools || m.allowed_write_tools.length === 0)
                                ? roleTools.map(rt => rt.name)
                                : m.allowed_write_tools
                              handleUpdateMember(m, {
                                can_write: checked,
                                allowed_write_tools: defaultTools
                              })
                            }}
                          />
                          {isSuper || m.can_write ? (
                            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {isSuper ? (
                          <span className="text-xs text-emerald-600 font-medium">
                            Semua Aksi Tulis Aktif (Default Superadmin)
                          </span>
                        ) : !m.can_write ? (
                          <span className="text-xs text-muted-foreground">
                            Hanya Baca (Read-Only)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {roleTools.map(rt => {
                              const active = (m.allowed_write_tools || []).includes(rt.name)
                              return (
                                <button
                                  key={rt.name}
                                  type="button"
                                  disabled={savingMemberId === m.id}
                                  onClick={() => handleToggleMemberTool(m, rt.name)}
                                  className={`px-2 py-0.5 rounded text-xs border transition ${
                                    active
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-background text-muted-foreground border-border hover:border-blue-400'
                                  }`}
                                >
                                  {rt.label}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {!isSuper && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={savingMemberId === m.id}
                            onClick={() => handleDeleteMember(m)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 3. Interactive Playground & Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playground Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <CardTitle>Simulasi & Uji Coba Chat (Safe Preview)</CardTitle>
            </div>
            <CardDescription>
              Uji respons AI sebagai Superadmin, Mitra, atau Teknisi. Aksi tulis di sini hanya menampilkan draf kartu konfirmasi (tidak mengubah data produksi).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Simulasikan Pengirim Sebagai</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
              >
                {members.map(m => (
                  <option key={m.id} value={String(m.id)}>
                    [{m.member_type.toUpperCase()}] {m.name} ({m.phone}) — {m.can_write || m.member_type === 'superadmin' ? 'Read+Write' : 'Read-Only'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Contoh Perintah Cepat:</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Tampilkan 5 tagihan belum lunas',
                  'Rekap pendapatan hari ini',
                  'Cek status perangkat OLT dan NAS',
                  'Daftar layanan yang sedang terisolir',
                  'Cek tiket gangguan yang masih open'
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setTestPrompt(sample)
                      handleRunTest(sample)
                    }}
                    className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-blue-50 dark:hover:bg-blue-950/50 border text-left transition"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pesan WhatsApp</Label>
              <Textarea
                rows={3}
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                placeholder="Ketik pertanyaan atau instruksi operasional..."
              />
              <div className="flex justify-end">
                <Button onClick={() => handleRunTest()} disabled={testingAgent || !testPrompt.trim()}>
                  {testingAgent ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Kirim Simulasi
                </Button>
              </div>
            </div>

            {testResult && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground border-b pb-2">
                  <span>
                    Identitas: <strong>{testResult.identity.name}</strong> ({testResult.identity.role})
                  </span>
                  <span>Token: {testResult.tokens_used}</span>
                </div>

                {testResult.tool_calls?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Tool Dipanggil:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {testResult.tool_calls.map((tc, idx) => (
                        <Badge
                          key={idx}
                          variant={tc.status === 'permission_denied' ? 'destructive' : 'secondary'}
                          className="text-xs font-mono"
                        >
                          {tc.name} ({tc.status})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-md bg-emerald-950/90 text-emerald-50 p-3 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {testResult.reply}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit Logs & Pending Confirmations Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-blue-600" />
                <CardTitle>Log Audit & Konfirmasi Tertunda</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefreshLogs} disabled={loadingLogs}>
                {loadingLogs ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </div>
            <CardDescription>
              Riwayat pemanggilan tool AI dan kode konfirmasi aksi tulis terbaru.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingActions.filter(p => p.status === 'pending').length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                  Menunggu Konfirmasi YA &lt;KODE&gt;
                </div>
                <div className="space-y-2">
                  {pendingActions
                    .filter(p => p.status === 'pending')
                    .map(p => (
                      <div key={p.id} className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs space-y-1">
                        <div className="flex justify-between font-medium">
                          <span>Kode: <strong className="font-mono">{p.code}</strong> ({p.tool})</span>
                          <span>{p.member_name}</span>
                        </div>
                        <div className="text-muted-foreground whitespace-pre-line">{p.summary}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Belum ada aktivitas AI Asisten.
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="rounded border p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold">{log.member_name}</span>
                        <span className="text-muted-foreground">({log.role})</span>
                        <Badge variant="outline" className="font-mono text-[10px] py-0">
                          {log.tool_name}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {new Date(log.created_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="text-muted-foreground truncate">
                      {log.result_summary}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                      <span>Status: <strong>{log.status}</strong></span>
                      {log.tokens_used > 0 && <span>{log.tokens_used} token</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
