'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  QrCodeIcon,
  WalletIcon,
  SmartphoneIcon,
  BanknoteIcon,
  ShoppingBagIcon,
  Search,
  Check,
  Info,
  Loader2
} from 'lucide-react';

interface PaymentMethod {
  gateway: string;
  method: string;
  name: string;
  icon: string;
  color: string;
  type: string;
  fee_customer: string;
  minimum_amount?: number;
  maximum_amount?: number;
  instructions?: string[];
  active: boolean;
  logo?: string;
  // Manual transfer specific fields
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
}

interface PaymentMethodSelectorProps {
  amount?: number;
  onMethodSelect: (method: PaymentMethod) => void;
  selectedMethod?: string;
  disabled?: boolean;
  loading?: boolean;
}

export default function PaymentMethodSelector({
  amount,
  onMethodSelect,
  selectedMethod,
  disabled = false,
  loading = false
}: PaymentMethodSelectorProps) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [groupedMethods, setGroupedMethods] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [error, setError] = useState('');

  // Group methods by type
  const groupMethods = (methodsList: PaymentMethod[]) => {
    return {
      popular: methodsList.filter(m => ['QRIS', 'DANA', 'GOPAY', 'OVO'].includes(m.method)),
      qris: methodsList.filter(m => m.method === 'QRIS'),
      ewallet: methodsList.filter(m => ['DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method)),
      bank_transfer: methodsList.filter(m => m.type === 'bank' || m.type === 'va'),
      manual_transfer: methodsList.filter(m => m.type === 'manual_transfer'),
      other: methodsList.filter(m =>
        !['QRIS', 'DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method) &&
        m.type !== 'bank' &&
        m.type !== 'va' &&
        m.type !== 'manual_transfer'
      )
    };
  };

  // Filter methods based on search and amount
  const getFilteredMethods = () => {
    let filtered = methods;

    // Filter by amount if provided
    if (amount) {
      filtered = filtered.filter(method => {
        // Ensure inputs are numbers for safe comparison
        const amountNum = Number(amount);
        const minAmount = method.minimum_amount ? Number(method.minimum_amount) : 0;
        const maxAmount = method.maximum_amount ? Number(method.maximum_amount) : Infinity;

        const inRange = amountNum >= minAmount && amountNum <= maxAmount;
        return inRange;
      });
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(method =>
        method.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        method.method.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort by fee amount (lowest first)
    return filtered.sort((a, b) => {
      const feeA = parseFloat(a.fee_customer?.replace(/[^\d]/g, '') || '0');
      const feeB = parseFloat(b.fee_customer?.replace(/[^\d]/g, '') || '0');
      return feeA - feeB;
    });
  };

  // Fetch payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        setLoadingMethods(true);
        setError('');

        // Get customer token from localStorage
        const customerToken = localStorage.getItem('customer_token');

        const response = await fetch(`/api/v1/customer-payments/methods${amount ? `?amount=${amount}` : ''}`, {
          headers: {
            'Authorization': `Bearer ${customerToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch payment methods');
        }

        const data = await response.json();

        if (data.success) {
          setMethods(data.data.methods || []);
          setGroupedMethods(data.data.grouped || {});
        } else {
          setError(data.error || 'Failed to load payment methods');
        }
      } catch (err) {
        setError('Failed to load payment methods');
        console.error('Error fetching payment methods:', err);
      } finally {
        setLoadingMethods(false);
      }
    };

    fetchPaymentMethods();
  }, [amount]);

  const getMethodIcon = (iconName: string) => {
    switch (iconName) {
      case 'bi-qr-code':
        return <QrCodeIcon className="w-6 h-6" />;
      case 'bi-wallet2':
      case 'bi-wallet':
        return <WalletIcon className="w-6 h-6" />;
      case 'bi-phone':
        return <SmartphoneIcon className="w-6 h-6" />;
      case 'bi-bank':
        return <BanknoteIcon className="w-6 h-6" />;
      case 'bi-bag':
        return <ShoppingBagIcon className="w-6 h-6" />;
      default:
        return <WalletIcon className="w-6 h-6" />;
    }
  };

  const getMethodColor = (color: string) => {
    // Adjusted for dark mode compatibility (lighter/brighter for contrast or dark variants)
    // We'll primarily rely on the white logo container, but these are for non-logo fallbacks and accents
    switch (color) {
      case 'info': return 'text-cyan-400 bg-cyan-900/30 border-cyan-700/50';
      case 'success': return 'text-emerald-400 bg-emerald-900/30 border-emerald-700/50';
      case 'warning': return 'text-amber-400 bg-amber-900/30 border-amber-700/50';
      case 'danger': return 'text-rose-400 bg-rose-900/30 border-rose-700/50';
      case 'secondary': return 'text-violet-400 bg-violet-900/30 border-violet-700/50';
      default: return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  const getFeeDisplay = (fee: string) => {
    if (!fee || fee === 'Gratis') return 'Gratis';
    if (typeof fee === 'string' && fee.includes('%')) return `${fee} transaksi`;
    // Clean up "Rp " prefix if double present or format nicely
    const cleanFee = fee.replace(/[^\d]/g, '');
    const numFee = parseInt(cleanFee);
    if (isNaN(numFee) || numFee === 0) return 'Gratis';
    return `Rp ${numFee.toLocaleString('id-ID')}`;
  };

  const PaymentMethodCard = ({ method, groupKey }: { method: PaymentMethod; groupKey: string }) => {
    const isSelected = selectedMethod === method.method;
    const colorClass = getMethodColor(method.color);

    return (
      <div
        key={`${groupKey}-${method.method}`}
        className={`group relative cursor-pointer rounded-xl border p-4 transition-all duration-300 overflow-hidden
          ${isSelected
            ? 'bg-blue-900/20 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/50'
            : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg'
          } ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
        onClick={() => !disabled && onMethodSelect(method)}
      >
        <div className="flex items-start gap-4">
          {/* Logo / Icon Container - Always White for proper logo display */}
          <div className={`w-14 h-14 shrink-0 flex items-center justify-center rounded-lg overflow-hidden transition-colors ${method.logo ? 'bg-white p-1.5' : `${colorClass} p-3`
            }`}>
            {method.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={method.logo}
                alt={method.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('fallback-icon');
                }}
              />
            ) : (
              getMethodIcon(method.icon)
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <h3 className={`font-semibold text-sm truncate pr-1 ${isSelected ? 'text-blue-100' : 'text-slate-200 group-hover:text-white'}`} title={method.name}>
                {method.name}
              </h3>
              {isSelected && (
                <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/50">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-medium bg-slate-700/50 text-slate-400 border border-slate-600 block w-fit">
                  {method.type === 'manual_transfer' ? 'MANUAL' : method.type.toUpperCase()}
                </Badge>
              </div>

              <p className="text-xs font-medium flex items-center gap-1.5">
                <span className="text-slate-500">Biaya:</span>
                <span className={method.fee_customer === 'Gratis' ? 'text-emerald-400' : 'text-amber-400'}>
                  {getFeeDisplay(method.fee_customer)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Show minimum amount warning */}
        {method.minimum_amount && amount && amount < method.minimum_amount && (
          <div className="mt-3 p-2 bg-amber-900/20 border border-amber-700/50 rounded text-xs text-amber-400 flex items-center">
            <Info className="w-3 h-3 mr-1 shrink-0" />
            Minimum: Rp {method.minimum_amount.toLocaleString('id-ID')}
          </div>
        )}

        {/* Show bank details for manual transfer */}
        {method.type === 'manual_transfer' && isSelected && (
          <div className="mt-3 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <p className="text-sm font-semibold text-blue-200 mb-2">Detail Rekening:</p>
            <div className="space-y-1 text-sm text-blue-300">
              <p><span className="font-medium">Bank:</span> {method.bank_name}</p>
              <p><span className="font-medium">No. Rekening:</span> {method.account_number}</p>
              <p><span className="font-medium">Atas Nama:</span> {method.account_holder}</p>
            </div>
            <p className="text-xs text-blue-400 mt-2 italic">
              Setelah transfer, upload bukti pembayaran untuk verifikasi.
            </p>
          </div>
        )}

        {/* Selected Highlight Overlay */}
        {isSelected && <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />}
      </div>
    );
  };

  const MethodSection = ({ title, methods, groupKey }: { title: string; methods: PaymentMethod[]; groupKey: string }) => {
    if (methods.length === 0) return null;

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {methods.map(method => (
            <PaymentMethodCard key={method.method} method={method} groupKey={groupKey} />
          ))}
        </div>
      </div>
    );
  };

  if (loadingMethods || loading) {
    return (
      <div className="border border-slate-700 rounded-xl p-12 bg-slate-800/30">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-slate-500 animate-pulse">Loading payment methods...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-900/50 rounded-xl p-8 bg-red-950/20">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()} className="border-red-800 text-red-400 hover:bg-red-950 hover:text-red-300">
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  const filteredMethods = getFilteredMethods();
  const filteredGroups = groupMethods(filteredMethods);

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4 group-focus-within:text-blue-500 transition-colors" />
        <Input
          type="text"
          placeholder="Cari metode pembayaran..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 bg-slate-900/50 border-slate-700 text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:ring-blue-500/20 h-12 rounded-xl transition-all"
          disabled={disabled}
        />
      </div>

      /* Amount Display */
      {amount && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-medium">Total Pembayaran</span>
            <span className="text-2xl font-bold text-white tracking-tight">
              Rp {amount.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      )}

      {/* Popular Methods */}
      <MethodSection
        title="✨ Popular Methods"
        methods={filteredGroups.popular}
        groupKey="popular"
      />

      {/* QRIS */}
      <MethodSection
        title="📱 QR Code"
        methods={filteredGroups.qris}
        groupKey="qris"
      />

      {/* E-Wallets */}
      <MethodSection
        title="💳 E-Wallets"
        methods={filteredGroups.ewallet}
        groupKey="ewallet"
      />

      {/* Bank Transfer */}
      <MethodSection
        title="🏦 Bank Transfer"
        methods={filteredGroups.bank_transfer}
        groupKey="bank_transfer"
      />

      {/* Other Methods */}
      {filteredGroups.other.length > 0 && (
        <MethodSection
          title="📋 Other Methods"
          methods={filteredGroups.other}
          groupKey="other"
        />
      )}

      {/* Manual Transfer */}
      {filteredGroups.manual_transfer?.length > 0 && (
        <MethodSection
          title="🏦 Transfer Manual"
          methods={filteredGroups.manual_transfer}
          groupKey="manual_transfer"
        />
      )}

      {/* No Methods Found */}
      {filteredMethods.length === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-8 text-center">
            <p className="text-slate-400">
              Tidak ada metode pembayaran yang tersedia untuk jumlah ini
              {amount && ` (Rp ${amount.toLocaleString('id-ID')})`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Selected Method Summary */}
      {selectedMethod && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-300 mb-1">Metode Terpilih:</p>
              <p className="font-semibold text-white text-lg">
                {methods.find(m => m.method === selectedMethod)?.name}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-blue-300 mb-1">Biaya Layanan:</p>
              <Badge variant="outline" className="border-blue-700 text-blue-200 bg-blue-900/50">
                {getFeeDisplay(methods.find(m => m.method === selectedMethod)?.fee_customer || 'Gratis')}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}