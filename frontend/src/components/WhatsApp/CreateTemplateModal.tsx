'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { MessageSquare, Plus, X, Loader2 } from 'lucide-react'

interface TemplateForm {
  name: string
  category: string
  language: string
  header: {
    enabled: boolean
    type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
    text: string
  }
  body: {
    text: string
  }
  footer: {
    enabled: boolean
    text: string
  }
  buttons: {
    enabled: boolean
    buttons: Array<{
      type: 'QUICK_REPLY' | 'URL'
      text: string
      url?: string
      phoneNumber?: string
    }>
  }
}

interface CreateTemplateModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (template: any) => Promise<void>
}

export default function CreateTemplateModal({ open, onClose, onSubmit }: CreateTemplateModalProps) {
  const [form, setForm] = useState<TemplateForm>({
    name: '',
    category: 'MARKETING',
    language: 'id',
    header: {
      enabled: false,
      type: 'TEXT',
      text: ''
    },
    body: {
      text: ''
    },
    footer: {
      enabled: false,
      text: ''
    },
    buttons: {
      enabled: false,
      buttons: []
    }
  })

  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState(false)

  const handleSubmit = async () => {
    if (!form.name || !form.body.text) {
      alert('Template name dan Body wajib diisi!')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(form)
      onClose()
      // Reset form
      setForm({
        name: '',
        category: 'MARKETING',
        language: 'id',
        header: { enabled: false, type: 'TEXT', text: '' },
        body: { text: '' },
        footer: { enabled: false, text: '' },
        buttons: { enabled: false, buttons: [] }
      })
    } catch (error: any) {
      alert('Gagal membuat template: ' + (error.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  const extractVariables = (text: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g
    const matches = []
    let match
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1])
    }
    return matches
  }

  const variables = extractVariables(form.body.text)

  const getPreviewText = () => {
    let text = form.body.text
    variables.forEach(v => {
      text = text.replace(new RegExp(`{{${v}}}`, 'g'), `[${v}]`)
    })
    return text
  }

  const addButton = () => {
    setForm(prev => ({
      ...prev,
      buttons: {
        ...prev.buttons,
        buttons: [...prev.buttons.buttons, { type: 'QUICK_REPLY', text: '' }]
      }
    }))
  }

  const removeButton = (index: number) => {
    setForm(prev => ({
      ...prev,
      buttons: {
        ...prev.buttons,
        buttons: prev.buttons.buttons.filter((_, i) => i !== index)
      }
    }))
  }

  const updateButton = (index: number, field: string, value: any) => {
    const newButtons = [...form.buttons.buttons]
    newButtons[index] = { ...newButtons[index], [field]: value }

    setForm(prev => ({
      ...prev,
      buttons: {
        ...prev.buttons,
        buttons: newButtons
      }
    }))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Buat Meta Template
          </CardTitle>
          <CardDescription>
            Template akan dikirim ke Meta untuk approval sebelum bisa digunakan
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Template Name & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                placeholder="e.g., invoice_reminder"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
              />
              <p className="text-xs text-gray-500">Hanya lowercase, angka, dan underscore</p>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(value) => setForm(prev => ({ ...prev, category: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={form.language} onValueChange={(value) => setForm(prev => ({ ...prev, language: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">Bahasa Indonesia</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Header */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Header (Opsional)</Label>
              <Switch
                checked={form.header.enabled}
                onCheckedChange={(checked) => setForm(prev => ({
                  ...prev,
                  header: { ...prev.header, enabled: checked }
                }))}
              />
            </div>

            {form.header.enabled && (
              <div className="space-y-3">
                <Select value={form.header.type} onValueChange={(value: any) => setForm(prev => ({
                  ...prev,
                  header: { ...prev.header, type: value }
                }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXT">Text</SelectItem>
                    <SelectItem value="IMAGE">Image</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="DOCUMENT">Document</SelectItem>
                  </SelectContent>
                </Select>

                {form.header.type === 'TEXT' && (
                  <Input
                    placeholder="Header text (max 60 chars)"
                    maxLength={60}
                    value={form.header.text}
                    onChange={(e) => setForm(prev => ({
                      ...prev,
                      header: { ...prev.header, text: e.target.value }
                    }))}
                  />
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Body * (Wajib)</Label>
              <Badge variant="outline" className="text-xs">Required</Badge>
            </div>

            <Textarea
              placeholder="Halo {{customerName}}, tagihan Anda sebesar {{amount}} akan jatuh tempo pada {{dueDate}}."
              value={form.body.text}
              onChange={(e) => setForm(prev => ({ ...prev, body: { text: e.target.value } }))}
              rows={4}
              className="font-mono text-sm"
            />

            {variables.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-500">Variables:</span>
                {variables.map((v, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {'{{'} + v + {'}'}
                  </Badge>
                ))}
              </div>
            )}

            {preview && (
              <div className="mt-2 p-3 bg-white border rounded text-sm">
                <p className="text-xs text-gray-500 mb-1">Preview:</p>
                <p>{getPreviewText()}</p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreview(!preview)}
              className="w-full"
            >
              {preview ? 'Sembunyikan Preview' : 'Tampilkan Preview'}
            </Button>
          </div>

          {/* Footer */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Footer (Opsional)</Label>
              <Switch
                checked={form.footer.enabled}
                onCheckedChange={(checked) => setForm(prev => ({
                  ...prev,
                  footer: { ...prev.footer, enabled: checked }
                }))}
              />
            </div>

            {form.footer.enabled && (
              <Input
                placeholder="Footer text (max 60 chars)"
                maxLength={60}
                value={form.footer.text}
                onChange={(e) => setForm(prev => ({
                  ...prev,
                  footer: { ...prev.footer, text: e.target.value }
                }))}
              />
            )}
          </div>

          {/* Buttons */}
          <div className="space-y-3 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Buttons (Opsional - Max 3)</Label>
              <Switch
                checked={form.buttons.enabled}
                onCheckedChange={(checked) => setForm(prev => ({
                  ...prev,
                  buttons: { ...prev.buttons, enabled: checked }
                }))}
              />
            </div>

            {form.buttons.enabled && (
              <div className="space-y-2">
                {form.buttons.buttons.map((btn, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select
                      value={btn.type}
                      onValueChange={(value) => updateButton(i, 'type', value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QUICK_REPLY">Quick Reply</SelectItem>
                        <SelectItem value="URL">URL</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      placeholder="Button text"
                      value={btn.text}
                      onChange={(e) => updateButton(i, 'text', e.target.value)}
                    />

                    {btn.type === 'URL' && (
                      <Input
                        placeholder="URL (https://...)"
                        value={btn.url || ''}
                        onChange={(e) => updateButton(i, 'url', e.target.value)}
                      />
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeButton(i)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                {form.buttons.buttons.length < 3 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addButton}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah Button
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>

        <div className="flex justify-end gap-2 p-6 border-t">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4 mr-2" />
                Submit untuk Approval
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  )
}
