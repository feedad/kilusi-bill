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
      other: methodsList.filter(m => !['QRIS', 'DANA', 'GOPAY', 'OVO', 'SHOPEEPAY'].includes(m.method) && m.type !== 'bank' && m.type !== 'va')
    };
  };

  // Filter methods based on search and amount
  const getFilteredMethods = () => {
    let filtered = methods;

    // Filter by amount if provided
    if (amount) {
      filtered = filtered.filter(method => {
        const minAmount = method.minimum_amount || 0;
        const maxAmount = method.maximum_amount || Infinity;
        return amount >= minAmount && amount <= maxAmount;
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
      const feeA = parseFloat(a.fee_customer?.replace(/[^\d]/g, '') || 0);
      const feeB = parseFloat(b.fee_customer?.replace(/[^\d]/g, '') || 0);
      return feeA - feeB;
    });
  };

  // Fetch payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        setLoadingMethods(true);
        setError('');

        const response = await fetch(`/api/v1/customer-payments/methods${amount ? `?amount=${amount}` : ''}`);

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
        return <QrCodeIcon className="w-5 h-5" />;
      case 'bi-wallet2':
      case 'bi-wallet':
        return <WalletIcon className="w-5 h-5" />;
      case 'bi-phone':
        return <SmartphoneIcon className="w-5 h-5" />;
      case 'bi-bank':
        return <BanknoteIcon className="w-5 h-5" />;
      case 'bi-bag':
        return <ShoppingBagIcon className="w-5 h-5" />;
      default:
        return <WalletIcon className="w-5 h-5" />;
    }
  };

  const getMethodColor = (color: string) => {
    switch (color) {
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'success': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'danger': return 'text-red-600 bg-red-50 border-red-200';
      case 'dark': return 'text-gray-600 bg-gray-50 border-gray-200';
      case 'secondary': return 'text-purple-600 bg-purple-50 border-purple-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getFeeDisplay = (fee: string) => {
    if (fee === 'Gratis') return 'Gratis';
    if (fee.includes('%')) return `${fee} transaksi`;
    return `Rp ${parseInt(fee).toLocaleString('id-ID')}`;
  };

  const PaymentMethodCard = ({ method, groupKey }: { method: PaymentMethod; groupKey: string }) => {
    const isSelected = selectedMethod === method.method;
    const colorClass = getMethodColor(method.color);

    return (
      <Card
        key={`${groupKey}-${method.method}`}
        className={`cursor-pointer transition-all hover:shadow-md ${
          isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && onMethodSelect(method)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${colorClass}`}>
                {getMethodIcon(method.icon)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{method.name}</h3>
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {method.type.toUpperCase()}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    Biaya: {getFeeDisplay(method.fee_customer)}
                  </span>
                </div>
              </div>
            </div>
            {isSelected && (
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          {method.minimum_amount && amount && amount < method.minimum_amount && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
              <div className="flex items-center">
                <Info className="w-3 h-3 mr-1" />
                Minimum: Rp {method.minimum_amount.toLocaleString('id-ID')}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const MethodSection = ({ title, methods, groupKey }: { title: string; methods: PaymentMethod[]; groupKey: string }) => {
    if (methods.length === 0) return null;

    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {methods.map(method => (
            <PaymentMethodCard key={method.method} method={method} groupKey={groupKey} />
          ))}
        </div>
      </div>
    );
  };

  if (loadingMethods || loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
            <p className="text-gray-500">Loading payment methods...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center">
            <p className="text-red-500 mb-2">Error loading payment methods</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const filteredMethods = getFilteredMethods();
  const filteredGroups = groupMethods(filteredMethods);

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search payment methods..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          disabled={disabled}
        />
      </div>

      {/* Amount Display */}
      {amount && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-700">Amount to Pay:</span>
            <span className="text-2xl font-bold text-blue-600">
              Rp {amount.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      )}

      {/* Popular Methods */}
      <MethodSection
        title="🌟 Popular Methods"
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

      {/* No Methods Found */}
      {filteredMethods.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">
              No payment methods available for this amount
              {amount && ` (Rp ${amount.toLocaleString('id-ID')})`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Selected Method Summary */}
      {selectedMethod && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Selected Payment Method:</p>
                <p className="font-semibold text-gray-900">
                  {methods.find(m => m.method === selectedMethod)?.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Fee:</p>
                <p className="font-semibold text-gray-900">
                  {getFeeDisplay(methods.find(m => m.method === selectedMethod)?.fee_customer || 'Gratis')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}