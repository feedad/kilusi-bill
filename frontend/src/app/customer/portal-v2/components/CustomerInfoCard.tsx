'use client'
import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Phone, Mail, Gift, MapPin, Copy, Check } from 'lucide-react'

export default function CustomerInfoCard({ customer }: { customer: any }) {
  const [copied, setCopied] = React.useState(false)
  if (!customer) return null
  return (
    <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/5 to-primary/[0.02]">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-base truncate">{customer.name || '-'}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 shrink-0" />{customer.phone}</span>}
              {customer.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 shrink-0" />{customer.email}</span>}
            </div>
            {customer.address && <p className="flex items-start gap-1 mt-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3 mt-0.5 shrink-0" /><span className="line-clamp-1">{customer.address}</span></p>}
          </div>
          {customer.status && <Badge variant={customer.status==='active'?'default':'secondary'} className="shrink-0 ml-2">{customer.status==='active'?'Aktif':customer.status}</Badge>}
        </div>
        {customer.referral_code && (
          <button onClick={() => { navigator.clipboard.writeText(customer.referral_code); setCopied(true); setTimeout(()=>setCopied(false),2000) }} className="flex items-center gap-1.5 mt-3 text-xs bg-background rounded-lg px-3 py-1.5 border border-border hover:bg-accent transition-colors w-full sm:w-auto">
            <Gift className="w-3.5 h-3.5 text-primary" /><span className="text-muted-foreground">Kode Referral:</span><span className="font-mono font-semibold">{customer.referral_code}</span>
            {copied ? <Check className="w-3.5 h-3.5 text-green-500 ml-1" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground ml-1" />}
          </button>
        )}
      </CardContent>
    </Card>
  )
}
