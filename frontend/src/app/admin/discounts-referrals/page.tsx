'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
// Using standard HTML table instead of custom Table component
import { Plus, Edit, Trash2, Users, Percent, DollarSign, Target, AlertCircle, Search, Calendar } from 'lucide-react';
import { adminApi, handleApiError } from '@/lib/api-clients';
import { format } from 'date-fns';

interface ReferralCode {
  id: number;
  code: string;
  customer_name: string;
  customer_code: string;
  is_active: boolean;
  usage_count: number;
  max_uses: number;
  created_at: string;
  expires_at?: string;
}

interface BillingDiscount {
  id: number;
  name: string;
  description?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  target_type: 'all' | 'area' | 'package' | 'customer';
  target_ids?: string[];
  compensation_reason?: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  max_discount_amount?: number;
  status_text: string;
  application_count: number;
  total_discount_applied?: number;
}

interface ReferralSettings {
  referral_enabled: boolean;
  referrer_discount_fixed: string;
  referrer_cash_amount: string;
  referred_installation_discount_fixed: string;
  referred_service_discount_fixed: string;
  referral_code_expiry_days: string;
  referral_max_uses: string;
}

export default function DiscountsReferralsPage() {
  const [activeTab, setActiveTab] = useState('discounts');
  const [showBulkPaymentSettings, setShowBulkPaymentSettings] = useState(false);
  const [discounts, setDiscounts] = useState<BillingDiscount[]>([]);
  const [referralCodes, setReferralCodes] = useState<ReferralCode[]>([]);
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(null);
  const [discountStats, setDiscountStats] = useState<any>(null);
  const [referralStats, setReferralStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showReferralSettings, setShowReferralSettings] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<BillingDiscount | null>(null);
  const [targetOptions, setTargetOptions] = useState<any[]>([]);
  const [loadingTargetOptions, setLoadingTargetOptions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [discountForm, setDiscountForm] = useState({
    name: '',
    description: '',
    discountType: 'fixed' as 'percentage' | 'fixed',
    discountValue: '',
    targetType: 'all' as 'all' | 'area' | 'package' | 'customer',
    targetIds: [] as string[],
    compensationReason: '',
    startDate: '',
    endDate: '',
    maxDiscountAmount: '',
    applyToExistingInvoices: false
  });

  const [referralForm, setReferralForm] = useState({
    referral_enabled: true,
    referrer_discount_enabled: true,
    referrer_cash_enabled: true,
    referred_installation_discount_enabled: true,
    referred_service_discount_enabled: true,
    referrer_discount_fixed: '0',
    referrer_cash_amount: '0',
    referred_installation_discount_fixed: '0',
    referred_service_discount_fixed: '0',
    referral_code_expiry_days: '365',
    referral_max_uses: '50'
  });

  const [bulkPaymentForm, setBulkPaymentForm] = useState({
    enabled: true,
    discount_1_month_type: 'percentage',
    discount_1_month_value: '0',
    discount_2_months_type: 'percentage',
    discount_2_months_value: '0',
    discount_3_months_type: 'percentage',
    discount_3_months_value: '10',
    discount_6_months_type: 'free_months',
    discount_6_months_value: '1',
    discount_12_months_type: 'free_months',
    discount_12_months_value: '2'
  });

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Load target options when type or search changes (with debounce)
  useEffect(() => {
    if (discountForm.targetType && discountForm.targetType !== 'all') {
      const timeoutId = setTimeout(() => {
        loadTargetOptions(discountForm.targetType as 'area' | 'customer' | 'package');
      }, 300);

      return () => clearTimeout(timeoutId);
    }
  }, [discountForm.targetType, searchTerm]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'discounts') {

        const [discountsRes, statsRes] = await Promise.all([
          adminApi.get('/api/v1/discounts'),
          adminApi.get('/api/v1/discounts/stats/summary')
        ]);

        setDiscounts(discountsRes.data.data.data || []);
        setDiscountStats(statsRes.data.data);
      } else {
        // Fetch referral data would go here
        // For now, using mock data
        setReferralStats({
          total_referrals: 156,
          applied_referrals: 142,
          total_benefits: 3560000
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load target options based on target type
  const loadTargetOptions = async (targetType: 'area' | 'package' | 'customer') => {
    try {
      setLoadingTargetOptions(true);
      let options = [];

      // Build API URL with search parameter if there's a search term
      let apiUrl = '';
      const searchParams = new URLSearchParams();

      if (targetType === 'area') {
        if (searchTerm) {
          searchParams.append('search', searchTerm);
        }
        searchParams.append('limit', '1000');
        apiUrl = `/api/v1/regions?${searchParams.toString()}`;

        const response = await adminApi.get(apiUrl);
        if (response.data.success) {
          options = response.data.data?.map((region: any) => ({
            value: region.id.toString(),
            label: region.name
          })) || [];
        }
      } else if (targetType === 'package') {
        if (searchTerm) {
          searchParams.append('search', searchTerm);
        }
        searchParams.append('status', 'active');
        searchParams.append('limit', '1000');
        apiUrl = `/api/v1/packages?${searchParams.toString()}`;

        const response = await adminApi.get(apiUrl);
        if (response.data.success) {
          options = response.data.data?.packages?.map((pkg: any) => ({
            value: pkg.id.toString(),
            label: `${pkg.name} - ${pkg.speed} (Rp ${pkg.price.toLocaleString('id-ID')}/bulan)`
          })) || [];
        }
      } else if (targetType === 'customer') {
        if (searchTerm) {
          searchParams.append('search', searchTerm);
        }
        searchParams.append('status', 'active');
        searchParams.append('limit', '1000');
        apiUrl = `/api/v1/customers?${searchParams.toString()}`;

        const response = await adminApi.get(apiUrl);
        if (response.data.success) {
          options = response.data.data?.customers?.map((customer: any) => ({
            value: customer.id.toString(),
            label: `${customer.name} (${customer.customer_id})`
          })) || [];
        }
      }

      setTargetOptions(options);
    } catch (error) {
      console.error('Error loading target options:', error);
      // Fallback to empty options
      setTargetOptions([]);
    } finally {
      setLoadingTargetOptions(false);
    }
  };

  // Handle discount form submission
  const handleDiscountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingDiscount) {
        await adminApi.put(`/api/v1/discounts/${editingDiscount.id}`, discountForm);
      } else {
        await adminApi.post('/api/v1/discounts', discountForm);
      }

      setShowDiscountDialog(false);
      setEditingDiscount(null);
      resetDiscountForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving discount:', error);
      alert(error.response?.data?.error || 'Gagal menyimpan diskon');
    }
  };

  // Handle discount deletion
  const handleDeleteDiscount = async (discountId: number) => {
    if (!confirm('Apakah Anda yakin ingin menghapus diskon ini?')) {
      return;
    }

    try {
      await adminApi.delete(`/api/v1/discounts/${discountId}`);
      fetchData();
    } catch (error: any) {
      console.error('Error deleting discount:', error);
      alert(handleApiError(error, 'Terjadi kesalahan saat menghapus diskon'));
    }
  };

  // Handle apply discount to existing invoices
  const handleApplyDiscount = async (discountId: number) => {
    try {
      const response = await adminApi.post(`/api/v1/discounts/${discountId}/apply`);
      alert(`Diskon berhasil diterapkan ke ${response.data.data.appliedCount} tagihan`);
      fetchData();
    } catch (error: any) {
      console.error('Error applying discount:', error);
      alert(error.response?.data?.error || 'Terjadi kesalahan saat menerapkan diskon');
    }
  };

  // Reset discount form
  const resetDiscountForm = () => {
    setDiscountForm({
      name: '',
      description: '',
      discountType: 'fixed',
      discountValue: '',
      targetType: 'all',
      targetIds: [],
      compensationReason: '',
      startDate: '',
      endDate: '',
      maxDiscountAmount: '',
      applyToExistingInvoices: false
    });
  };

  // Edit discount
  const handleEditDiscount = (discount: BillingDiscount) => {
    setEditingDiscount(discount);
    setDiscountForm({
      name: discount.name,
      description: discount.description || '',
      discountType: discount.discount_type,
      discountValue: discount.discount_value.toString(),
      targetType: discount.target_type,
      targetIds: discount.target_ids || [],
      compensationReason: discount.compensation_reason || '',
      startDate: discount.start_date,
      endDate: discount.end_date,
      maxDiscountAmount: discount.max_discount_amount?.toString() || '',
      applyToExistingInvoices: false
    });
    setShowDiscountDialog(true);
  };

  // Handle saving referral settings
  const handleSaveReferral = async () => {
    try {
      const response = await adminApi.put('/api/v1/referrals/settings', referralForm);

      if (response.data.success) {
        alert('Pengaturan referral berhasil disimpan!');
        setShowReferralSettings(false);
        // Refresh referral settings
        fetchData();
      } else {
        alert(response.data.error || 'Gagal menyimpan pengaturan referral');
      }
    } catch (error: any) {
      console.error('Error saving referral settings:', error);
      alert(error.response?.data?.error || 'Terjadi kesalahan saat menyimpan pengaturan referral');
    }
  };

  // Function to format discount display
  const formatDiscountDisplay = (type: string, value: string, months: number) => {
    const numValue = parseInt(value);
    switch (type) {
      case 'percentage':
        return `Diskon ${numValue}%`;
      case 'free_months':
        return `Gratis ${numValue} bulan`;
      case 'fixed_amount':
        return `Diskon Rp ${numValue.toLocaleString('id-ID')}`;
      default:
        return `Diskon ${numValue}%`;
    }
  };

  // Function to calculate discount amount
  const calculateDiscountAmount = (type: string, value: string, months: number, packagePrice: number) => {
    const numValue = parseInt(value);
    switch (type) {
      case 'percentage':
        return packagePrice * months * (numValue / 100);
      case 'free_months':
        return packagePrice * numValue;
      case 'fixed_amount':
        return numValue;
      default:
        return 0;
    }
  };

  // Fetch bulk payment settings
  const fetchBulkPaymentSettings = async () => {
    try {
      const response = await adminApi.get('/api/v1/billing/bulk-payment-settings');
      if (response.data.success && response.data.data) {
        setBulkPaymentForm(response.data.data);
      }
    } catch (error: any) {
      console.error('Error fetching bulk payment settings:', error);
    }
  };

  // Handle saving bulk payment settings
  const handleSaveBulkPayment = async () => {
    try {
      const response = await adminApi.put('/api/v1/billing/bulk-payment-settings', bulkPaymentForm);

      if (response.data.success) {
        alert('Pengaturan diskon pembayaran di muka berhasil disimpan!');
        setShowBulkPaymentSettings(false);
        fetchData();
      } else {
        alert(response.data.error || 'Gagal menyimpan pengaturan diskon pembayaran di muka');
      }
    } catch (error: any) {
      console.error('Error saving bulk payment settings:', error);
      alert(error.response?.data?.error || 'Terjadi kesalahan saat menyimpan pengaturan diskon pembayaran di muka');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Manajemen Diskon & Referral</h1>
          <p className="text-muted-foreground">Kelola diskon kompensasi dan sistem referral pelanggan</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Diskon Aktif</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{discountStats?.active_discounts || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Diskon Diberikan</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              Rp {(discountStats?.total_discount_applied || 0).toLocaleString('id-ID')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pelanggan Terpengaruh</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{discountStats?.customers_affected || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referral</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referralStats?.total_referrals || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="discounts">Diskon Kompensasi</TabsTrigger>
          <TabsTrigger value="bulk-payments">Diskon Pembayaran di Muka</TabsTrigger>
          <TabsTrigger value="referrals">Sistem Referral</TabsTrigger>
        </TabsList>

        {/* Discounts Tab */}
        <TabsContent value="discounts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Diskon Kompensasi</h2>
            <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetDiscountForm(); setEditingDiscount(null); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Diskon
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingDiscount ? 'Edit Diskon' : 'Tambah Diskon Baru'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingDiscount
                      ? 'Edit diskon kompensasi yang sudah ada'
                      : 'Buat diskon kompensasi untuk pelanggan terdampak'
                    }
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleDiscountSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Nama Diskon</Label>
                      <Input
                        id="name"
                        value={discountForm.name}
                        onChange={(e) => setDiscountForm({...discountForm, name: e.target.value})}
                        placeholder="Contoh: Kompensasi Gangguan Area X"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="discountType">Tipe Diskon</Label>
                      <select
                        value={discountForm.discountType}
                        onChange={(e) => setDiscountForm({...discountForm, discountType: e.target.value as 'percentage' | 'fixed'})}
                        className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="fixed">Nominal Tetap</option>
                        <option value="percentage">Persentase</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="description">Deskripsi</Label>
                    <Textarea
                      id="description"
                      value={discountForm.description}
                      onChange={(e) => setDiscountForm({...discountForm, description: e.target.value})}
                      placeholder="Deskripsi diskon (opsional)"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="discountValue">
                        Nilai Diskon ({discountForm.discountType === 'percentage' ? '%' : 'Rp'})
                      </Label>
                      <Input
                        id="discountValue"
                        type="number"
                        value={discountForm.discountValue}
                        onChange={(e) => setDiscountForm({...discountForm, discountValue: e.target.value})}
                        placeholder={discountForm.discountType === 'percentage' ? '10' : '50000'}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="maxDiscountAmount">Maksimal Diskon (Rp)</Label>
                      <Input
                        id="maxDiscountAmount"
                        type="number"
                        value={discountForm.maxDiscountAmount}
                        onChange={(e) => setDiscountForm({...discountForm, maxDiscountAmount: e.target.value})}
                        placeholder="Opsional, untuk tipe persentase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="targetType">Target Diskon</Label>
                      <select
                        value={discountForm.targetType}
                        onChange={(e) => {
                          const newType = e.target.value as 'all' | 'area' | 'package' | 'customer';
                          setDiscountForm({...discountForm, targetType: newType, targetIds: []});
                          if (newType !== 'all') {
                            loadTargetOptions(newType as 'area' | 'customer' | 'package');
                          }
                        }}
                        className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">Semua Pelanggan</option>
                        <option value="area">Per Area</option>
                        <option value="package">Per Paket</option>
                        <option value="customer">Pelanggan Spesifik</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="compensationReason">Alasan Kompensasi</Label>
                      <Input
                        id="compensationReason"
                        value={discountForm.compensationReason}
                        onChange={(e) => setDiscountForm({...discountForm, compensationReason: e.target.value})}
                        placeholder="Contoh: Gangguan jaringan"
                      />
                    </div>
                  </div>

                  {/* Parameter Checkbox - muncul ketika target bukan 'all' */}
                  {discountForm.targetType !== 'all' && (
                    <div>
                      <Label className="text-base font-medium">
                        Pilih {discountForm.targetType === 'area' ? 'Area' :
                               discountForm.targetType === 'package' ? 'Paket' : 'Pelanggan'}
                      </Label>

                      {/* Search Input */}
                      <div className="mt-2 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          placeholder={`Cari ${discountForm.targetType === 'area' ? 'area' :
                                      discountForm.targetType === 'package' ? 'paket' : 'pelanggan'}...`}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-muted-foreground"
                        />
                      </div>

                      <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-input rounded-md p-3 bg-background">
                        {loadingTargetOptions ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            <span className="ml-2 text-sm text-muted-foreground">Memuat data...</span>
                          </div>
                        ) : targetOptions?.length > 0 ? (
                          targetOptions.map((option: any) => (
                            <div key={option.value} className="flex items-start space-x-3 hover:bg-accent/50 p-2 rounded-md transition-colors">
                              <input
                                type="checkbox"
                                id={`target-${option.value}`}
                                checked={discountForm.targetIds.includes(option.value)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setDiscountForm(prev => ({
                                      ...prev,
                                      targetIds: [...prev.targetIds, option.value]
                                    }));
                                  } else {
                                    setDiscountForm(prev => ({
                                      ...prev,
                                      targetIds: prev.targetIds.filter(id => id !== option.value)
                                    }));
                                  }
                                }}
                                className="h-4 w-4 mt-0.5 text-primary border-input rounded focus:ring-primary focus:ring-2 cursor-pointer"
                              />
                              <label
                                htmlFor={`target-${option.value}`}
                                className="text-sm font-medium text-foreground cursor-pointer flex-1 leading-tight"
                              >
                                {option.label}
                              </label>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground text-center py-4">Tidak ada data tersedia</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-sm text-muted-foreground">
                          {discountForm.targetIds.length} {discountForm.targetType === 'area' ? 'area' :
                            discountForm.targetType === 'package' ? 'paket' : 'pelanggan'} dipilih
                        </p>
                        {discountForm.targetIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDiscountForm(prev => ({...prev, targetIds: []}))}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Hapus Semua
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="startDate">Tanggal Mulai</Label>
                      <div className="relative">
                      <Input
                        id="startDate"
                        type="date"
                        value={discountForm.startDate}
                        onChange={(e) => setDiscountForm({...discountForm, startDate: e.target.value})}
                        className="mt-1 pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                      />
                      <Calendar
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-300 pointer-events-none"
                      />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="endDate">Tanggal Selesai</Label>
                      <div className="relative">
                      <Input
                        id="endDate"
                        type="date"
                        value={discountForm.endDate}
                        onChange={(e) => setDiscountForm({...discountForm, endDate: e.target.value})}
                        className="mt-1 pr-10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                      />
                      <Calendar
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-300 pointer-events-none"
                      />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="applyToExistingInvoices"
                      checked={discountForm.applyToExistingInvoices}
                      onChange={(e) => setDiscountForm({...discountForm, applyToExistingInvoices: e.target.checked})}
                    />
                    <Label htmlFor="applyToExistingInvoices">
                      Terapkan ke tagihan yang sudah ada
                    </Label>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setShowDiscountDialog(false)}>
                      Batal
                    </Button>
                    <Button type="submit">
                      {editingDiscount ? 'Update' : 'Simpan'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Discounts Table */}
          <Card>
            <CardHeader>
              <CardTitle>Daftar Diskon</CardTitle>
              <CardDescription>
                Daftar diskon kompensasi yang aktif dan tidak aktif
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Nama</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Tipe</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Nilai</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Target</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Periode</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Status</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Digunakan</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Aksi</th>
                    </tr>
                  </thead>
                <tbody className="[&_tr:last-child]:border-0">
                    {discounts.length === 0 ? (
                      <tr className="border-b transition-colors hover:bg-muted/50">
                        <td colSpan={8} className="p-4 text-center py-8">
                          Belum ada data diskon
                        </td>
                      </tr>
                    ) : (
                      discounts.map((discount) => (
                        <tr key={discount.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle">
                          <div>
                            <div className="font-medium">{discount.name}</div>
                            {discount.description && (
                              <div className="text-sm text-muted-foreground">
                                {discount.description}
                              </div>
                            )}
                            {discount.compensation_reason && (
                              <Badge variant="outline" className="mt-1">
                                {discount.compensation_reason}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge variant={discount.discount_type === 'percentage' ? 'default' : 'secondary'}>
                            {discount.discount_type === 'percentage' ? 'Persentase' : 'Nominal'}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle">
                          {discount.discount_type === 'percentage'
                            ? `${discount.discount_value}%`
                            : `Rp ${discount.discount_value.toLocaleString('id-ID')}`
                          }
                          {discount.max_discount_amount && (
                            <div className="text-sm text-muted-foreground">
                              Max: Rp {discount.max_discount_amount.toLocaleString('id-ID')}
                            </div>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          {discount.target_type === 'all' ? (
                            'Semua Pelanggan'
                          ) : (
                            <Badge variant="outline">
                              {discount.target_type === 'area' && 'Area'}
                              {discount.target_type === 'package' && 'Paket'}
                              {discount.target_type === 'customer' && 'Pelanggan'}
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 align-middle">
                          <div className="text-sm">
                            {format(new Date(discount.start_date), 'dd MMM yyyy')}<br/>
                            {format(new Date(discount.end_date), 'dd MMM yyyy')}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <Badge variant={
                            discount.status_text === 'Active' ? 'default' :
                            discount.status_text === 'Expired' ? 'destructive' : 'secondary'
                          }>
                            {discount.status_text}
                          </Badge>
                        </td>
                        <td className="p-4 align-middle">
                          <div className="text-sm">
                            <div>{discount.application_count} tagihan</div>
                            {discount.total_discount_applied && (
                              <div className="text-muted-foreground">
                                Rp {discount.total_discount_applied.toLocaleString('id-ID')}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-middle">
                          <div className="flex space-x-1">
                            {discount.is_active && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApplyDiscount(discount.id)}
                              >
                                Terapkan
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditDiscount(discount)}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeleteDiscount(discount.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bulk Payments Tab */}
        <TabsContent value="bulk-payments" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Diskon Pembayaran di Muka</h2>
              <p className="text-muted-foreground">Atur diskon untuk pembayaran layanan di muka berdasarkan durasi</p>
            </div>
            <Button onClick={() => {
              setShowBulkPaymentSettings(true);
              fetchBulkPaymentSettings();
            }}>
              <Edit className="w-4 h-4 mr-2" />
              Pengaturan Diskon
            </Button>
          </div>

          {/* Bulk Payment Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Informasi Diskon Pembayaran di Muka
              </CardTitle>
              <CardDescription>
                Diskon yang diberikan kepada pelanggan yang melakukan pembayaran layanan untuk beberapa bulan sekaligus
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">1 Bulan</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDiscountDisplay(bulkPaymentForm.discount_1_month_type, bulkPaymentForm.discount_1_month_value, 1)}
                  </div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">2 Bulan</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDiscountDisplay(bulkPaymentForm.discount_2_months_type, bulkPaymentForm.discount_2_months_value, 2)}
                  </div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">3 Bulan</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDiscountDisplay(bulkPaymentForm.discount_3_months_type, bulkPaymentForm.discount_3_months_value, 3)}
                  </div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">6 Bulan</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDiscountDisplay(bulkPaymentForm.discount_6_months_type, bulkPaymentForm.discount_6_months_value, 6)}
                  </div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">1 Tahun</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDiscountDisplay(bulkPaymentForm.discount_12_months_type, bulkPaymentForm.discount_12_months_value, 12)}
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Contoh Perhitungan:</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <strong>Paket Bronze (Rp 150.000/bulan)</strong><br/>
                    • Bayar 3 bulan:
                      {(() => {
                        const discount = calculateDiscountAmount(bulkPaymentForm.discount_3_months_type, bulkPaymentForm.discount_3_months_value, 3, 0);
                        const total = 0 * 3 - discount;
                        return ` Total <strong>Rp ${total.toLocaleString('id-ID')}</strong> (${formatDiscountDisplay(bulkPaymentForm.discount_3_months_type, bulkPaymentForm.discount_3_months_value, 3)})`;
                      })()}<br/>
                    • Bayar 6 bulan:
                      {(() => {
                        const discount = calculateDiscountAmount(bulkPaymentForm.discount_6_months_type, bulkPaymentForm.discount_6_months_value, 6, 0);
                        const total = 0 * 6 - discount;
                        return ` Total <strong>Rp ${total.toLocaleString('id-ID')}</strong> (${formatDiscountDisplay(bulkPaymentForm.discount_6_months_type, bulkPaymentForm.discount_6_months_value, 6)})`;
                      })()}<br/>
                    • Bayar 1 tahun:
                      {(() => {
                        const discount = calculateDiscountAmount(bulkPaymentForm.discount_12_months_type, bulkPaymentForm.discount_12_months_value, 12, 0);
                        const total = 0 * 12 - discount;
                        return ` Total <strong>Rp ${total.toLocaleString('id-ID')}</strong> (${formatDiscountDisplay(bulkPaymentForm.discount_12_months_type, bulkPaymentForm.discount_12_months_value, 12)})`;
                      })()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Payment Settings Dialog */}
          <Dialog open={showBulkPaymentSettings} onOpenChange={setShowBulkPaymentSettings}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Pengaturan Diskon Pembayaran di Muka</DialogTitle>
                <DialogDescription>
                  Konfigurasi persentase diskon untuk setiap durasi pembayaran di muka
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="bulk_payment_enabled"
                    checked={bulkPaymentForm.enabled}
                    onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, enabled: e.target.checked})}
                  />
                  <Label htmlFor="bulk_payment_enabled">Aktifkan Diskon Pembayaran di Muka</Label>
                </div>

                <div className="space-y-4">
                  {/* 1 Bulan */}
                  <div>
                    <Label htmlFor="discount_1_month_type">Diskon 1 Bulan</Label>
                    <div className="flex gap-2 mt-1">
                      <select
                        id="discount_1_month_type"
                        value={bulkPaymentForm.discount_1_month_type}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_1_month_type: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500' : 'flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'}
                      >
                        <option value="percentage">Persentase</option>
                        <option value="free_months">Gratis Bulan</option>
                        <option value="fixed_amount">Nominal Tetap</option>
                      </select>
                      <Input
                        type="number"
                        placeholder={bulkPaymentForm.discount_1_month_type === 'percentage' ? '10' : bulkPaymentForm.discount_1_month_type === 'free_months' ? '1' : '50000'}
                        value={bulkPaymentForm.discount_1_month_value}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_1_month_value: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed w-32' : 'w-32'}
                      />
                    </div>
                  </div>

                  {/* 2 Bulan */}
                  <div>
                    <Label htmlFor="discount_2_months_type">Diskon 2 Bulan</Label>
                    <div className="flex gap-2 mt-1">
                      <select
                        id="discount_2_months_type"
                        value={bulkPaymentForm.discount_2_months_type}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_2_months_type: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500' : 'flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'}
                      >
                        <option value="percentage">Persentase</option>
                        <option value="free_months">Gratis Bulan</option>
                        <option value="fixed_amount">Nominal Tetap</option>
                      </select>
                      <Input
                        type="number"
                        placeholder={bulkPaymentForm.discount_2_months_type === 'percentage' ? '10' : bulkPaymentForm.discount_2_months_type === 'free_months' ? '1' : '50000'}
                        value={bulkPaymentForm.discount_2_months_value}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_2_months_value: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed w-32' : 'w-32'}
                      />
                    </div>
                  </div>

                  {/* 3 Bulan */}
                  <div>
                    <Label htmlFor="discount_3_months_type">Diskon 3 Bulan</Label>
                    <div className="flex gap-2 mt-1">
                      <select
                        id="discount_3_months_type"
                        value={bulkPaymentForm.discount_3_months_type}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_3_months_type: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500' : 'flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'}
                      >
                        <option value="percentage">Persentase</option>
                        <option value="free_months">Gratis Bulan</option>
                        <option value="fixed_amount">Nominal Tetap</option>
                      </select>
                      <Input
                        type="number"
                        placeholder={bulkPaymentForm.discount_3_months_type === 'percentage' ? '10' : bulkPaymentForm.discount_3_months_type === 'free_months' ? '1' : '50000'}
                        value={bulkPaymentForm.discount_3_months_value}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_3_months_value: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed w-32' : 'w-32'}
                      />
                    </div>
                  </div>

                  {/* 6 Bulan */}
                  <div>
                    <Label htmlFor="discount_6_months_type">Diskon 6 Bulan</Label>
                    <div className="flex gap-2 mt-1">
                      <select
                        id="discount_6_months_type"
                        value={bulkPaymentForm.discount_6_months_type}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_6_months_type: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500' : 'flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'}
                      >
                        <option value="percentage">Persentase</option>
                        <option value="free_months">Gratis Bulan</option>
                        <option value="fixed_amount">Nominal Tetap</option>
                      </select>
                      <Input
                        type="number"
                        placeholder={bulkPaymentForm.discount_6_months_type === 'percentage' ? '10' : bulkPaymentForm.discount_6_months_type === 'free_months' ? '1' : '50000'}
                        value={bulkPaymentForm.discount_6_months_value}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_6_months_value: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed w-32' : 'w-32'}
                      />
                    </div>
                  </div>

                  {/* 12 Bulan */}
                  <div>
                    <Label htmlFor="discount_12_months_type">Diskon 1 Tahun</Label>
                    <div className="flex gap-2 mt-1">
                      <select
                        id="discount_12_months_type"
                        value={bulkPaymentForm.discount_12_months_type}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_12_months_type: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500' : 'flex-1 px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'}
                      >
                        <option value="percentage">Persentase</option>
                        <option value="free_months">Gratis Bulan</option>
                        <option value="fixed_amount">Nominal Tetap</option>
                      </select>
                      <Input
                        type="number"
                        placeholder={bulkPaymentForm.discount_12_months_type === 'percentage' ? '10' : bulkPaymentForm.discount_12_months_type === 'free_months' ? '1' : '50000'}
                        value={bulkPaymentForm.discount_12_months_value}
                        onChange={(e) => setBulkPaymentForm({...bulkPaymentForm, discount_12_months_value: e.target.value})}
                        disabled={!bulkPaymentForm.enabled}
                        className={!bulkPaymentForm.enabled ? 'opacity-50 cursor-not-allowed w-32' : 'w-32'}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-sm text-blue-800">
                    <strong>Catatan:</strong> Diskon akan otomatis diterapkan saat pelanggan memilih opsi pembayaran di muka pada halaman billing.
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowBulkPaymentSettings(false)}>
                  Batal
                </Button>
                <Button onClick={handleSaveBulkPayment}>
                  Simpan Pengaturan
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Referrals Tab */}
        <TabsContent value="referrals" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Sistem Referral</h2>
            <Button onClick={() => setShowReferralSettings(true)}>
              <Edit className="w-4 h-4 mr-2" />
              Pengaturan Referral
            </Button>
          </div>

          {/* Referral Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Referral</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{referralStats?.total_referrals || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {referralStats?.applied_referrals || 0} sudah diterapkan
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Benefit</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  Rp {(referralStats?.total_benefits || 0).toLocaleString('id-ID')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total benefit yang diberikan
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rata-rata Benefit</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  Rp {Math.round((referralStats?.total_benefits || 0) / (referralStats?.applied_referrals || 1)).toLocaleString('id-ID')}
                </div>
                <p className="text-xs text-muted-foreground">
                  Per referral berhasil
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Referral Settings Dialog */}
          <Dialog open={showReferralSettings} onOpenChange={setShowReferralSettings}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Pengaturan Sistem Referral</DialogTitle>
                <DialogDescription>
                  Konfigurasi pengaturan untuk sistem referral pelanggan
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="referral_enabled"
                    checked={referralForm.referral_enabled}
                    onChange={(e) => setReferralForm({...referralForm, referral_enabled: e.target.checked})}
                  />
                  <Label htmlFor="referral_enabled">Aktifkan Sistem Referral</Label>
                </div>

                <div className="space-y-4">
                  {/* Diskon Referrer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="referrer_discount_enabled"
                        checked={referralForm.referrer_discount_enabled}
                        onChange={(e) => setReferralForm({...referralForm, referrer_discount_enabled: e.target.checked})}
                        className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800"
                      />
                      <div>
                        <Label htmlFor="referrer_discount_enabled" className="text-sm font-medium">Diskon Referrer</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Bonus untuk pengguna yang mereferensikan</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Rp</span>
                      <Input
                        type="number"
                        value={referralForm.referrer_discount_fixed}
                        onChange={(e) => setReferralForm({...referralForm, referrer_discount_fixed: e.target.value})}
                        disabled={!referralForm.referrer_discount_enabled}
                        className={`w-32 ${!referralForm.referrer_discount_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Cash Reward */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="referrer_cash_enabled"
                        checked={referralForm.referrer_cash_enabled}
                        onChange={(e) => setReferralForm({...referralForm, referrer_cash_enabled: e.target.checked})}
                        className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800"
                      />
                      <div>
                        <Label htmlFor="referrer_cash_enabled" className="text-sm font-medium">Cash Reward</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Hadiah uang tunai untuk referrer</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Rp</span>
                      <Input
                        type="number"
                        value={referralForm.referrer_cash_amount}
                        onChange={(e) => setReferralForm({...referralForm, referrer_cash_amount: e.target.value})}
                        disabled={!referralForm.referrer_cash_enabled}
                        className={`w-32 ${!referralForm.referrer_cash_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Diskon Instalasi */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="referred_installation_discount_enabled"
                        checked={referralForm.referred_installation_discount_enabled}
                        onChange={(e) => setReferralForm({...referralForm, referred_installation_discount_enabled: e.target.checked})}
                        className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800"
                      />
                      <div>
                        <Label htmlFor="referred_installation_discount_enabled" className="text-sm font-medium">Diskon Instalasi</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Potongan untuk biaya instalasi pelanggan baru</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Rp</span>
                      <Input
                        type="number"
                        value={referralForm.referred_installation_discount_fixed}
                        onChange={(e) => setReferralForm({...referralForm, referred_installation_discount_fixed: e.target.value})}
                        disabled={!referralForm.referred_installation_discount_enabled}
                        className={`w-32 ${!referralForm.referred_installation_discount_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Diskon Layanan */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="referred_service_discount_enabled"
                        checked={referralForm.referred_service_discount_enabled}
                        onChange={(e) => setReferralForm({...referralForm, referred_service_discount_enabled: e.target.checked})}
                        className="h-4 w-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800"
                      />
                      <div>
                        <Label htmlFor="referred_service_discount_enabled" className="text-sm font-medium">Diskon Layanan</Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Potongan untuk bulan pertama layanan</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Rp</span>
                      <Input
                        type="number"
                        value={referralForm.referred_service_discount_fixed}
                        onChange={(e) => setReferralForm({...referralForm, referred_service_discount_fixed: e.target.value})}
                        disabled={!referralForm.referred_service_discount_enabled}
                        className={`w-32 ${!referralForm.referred_service_discount_enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="referral_code_expiry_days">Masa Berlaku (Hari)</Label>
                    <Input
                      id="referral_code_expiry_days"
                      type="number"
                      value={referralForm.referral_code_expiry_days}
                      onChange={(e) => setReferralForm({...referralForm, referral_code_expiry_days: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="referral_max_uses">Maksimal Penggunaan</Label>
                    <Input
                      id="referral_max_uses"
                      type="number"
                      value={referralForm.referral_max_uses}
                      onChange={(e) => setReferralForm({...referralForm, referral_max_uses: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowReferralSettings(false)}>
                  Batal
                </Button>
                <Button onClick={handleSaveReferral}>
                  Simpan Pengaturan
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Referral Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Informasi Sistem Referral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-semibold">Bagi Pereferral (Pengirim)</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Diskon tagihan: Rp {parseInt(referralForm.referrer_discount_fixed).toLocaleString('id-ID')}</li>
                    <li>• Cash reward: Rp {parseInt(referralForm.referrer_cash_amount).toLocaleString('id-ID')}</li>
                    <li>• Berlaku untuk setiap pelanggan baru yang berhasil direferensikan</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold">Bagi Direferensikan (Penerima)</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Diskon instalasi: Rp {parseInt(referralForm.referred_installation_discount_fixed).toLocaleString('id-ID')}</li>
                    <li>• Diskon layanan: Rp {parseInt(referralForm.referred_service_discount_fixed).toLocaleString('id-ID')}</li>
                    <li>• Otomatis diterapkan saat menggunakan kode referral</li>
                  </ul>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Cara Kerja:</h4>
                <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
                  <li>Pelanggan existing generate kode referral unik</li>
                  <li>Pelanggan baru memasukkan kode referral saat pendaftaran</li>
                  <li>Sistem otomatis menerapkan benefit ke kedua belah pihak</li>
                  <li>Benefit diterapkan pada tagihan berikutnya</li>
                  <li>Kode referral berlaku selama {referralForm.referral_code_expiry_days} hari</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}