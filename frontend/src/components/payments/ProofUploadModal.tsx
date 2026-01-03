'use client';

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Upload,
    Image,
    X,
    Check,
    Loader2,
    AlertCircle,
    BanknoteIcon,
    FileImage
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ProofUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    transactionId?: string;
    bankDetails?: {
        bank_name: string;
        account_number: string;
        account_holder: string;
    };
    onUploadSuccess?: (result: any) => void;
}

export default function ProofUploadModal({
    isOpen,
    onClose,
    invoiceId,
    invoiceNumber,
    amount,
    transactionId,
    bankDetails,
    onUploadSuccess
}: ProofUploadModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                toast.error('Hanya file gambar yang diperbolehkan (JPEG, PNG, GIF, WebP)');
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Ukuran file maksimal 5MB');
                return;
            }

            setSelectedFile(file);

            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                toast.error('Hanya file gambar yang diperbolehkan');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                toast.error('Ukuran file maksimal 5MB');
                return;
            }
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
    };

    const removeFile = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error('Pilih file bukti pembayaran terlebih dahulu');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('proof', selectedFile);

            const token = localStorage.getItem('customer_token');
            const endpoint = transactionId
                ? `/api/v1/payment-upload/${transactionId}`
                : `/api/v1/payment-upload/invoice/${invoiceId}`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                setUploadResult(data.data);
                toast.success('Bukti pembayaran berhasil diunggah!');
                onUploadSuccess?.(data.data);
            } else {
                toast.error(data.error || 'Gagal mengunggah bukti pembayaran');
            }
        } catch (error) {
            console.error('Upload error:', error);
            toast.error('Terjadi kesalahan saat mengunggah bukti pembayaran');
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setSelectedFile(null);
        setPreviewUrl(null);
        setUploadResult(null);
        onClose();
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(value);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-blue-600" />
                        Upload Bukti Pembayaran
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Invoice Info */}
                    <Card className="bg-gray-50 dark:bg-gray-800">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-sm text-gray-500">Invoice</p>
                                    <p className="font-semibold">{invoiceNumber}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-gray-500">Jumlah</p>
                                    <p className="font-bold text-blue-600">{formatCurrency(amount)}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bank Details */}
                    {bankDetails && (
                        <Card className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <BanknoteIcon className="w-4 h-4 text-blue-600" />
                                    <span className="font-semibold text-blue-900 dark:text-blue-100">Detail Rekening</span>
                                </div>
                                <div className="space-y-1 text-sm">
                                    <p><span className="text-gray-500">Bank:</span> <span className="font-medium">{bankDetails.bank_name}</span></p>
                                    <p><span className="text-gray-500">No. Rekening:</span> <span className="font-medium font-mono">{bankDetails.account_number}</span></p>
                                    <p><span className="text-gray-500">Atas Nama:</span> <span className="font-medium">{bankDetails.account_holder}</span></p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Upload Success State */}
                    {uploadResult ? (
                        <Card className="bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800">
                            <CardContent className="p-6 text-center">
                                <div className="w-16 h-16 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                                </div>
                                <h3 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                                    Bukti Pembayaran Diunggah
                                </h3>
                                <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                                    {uploadResult.message}
                                </p>
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                                    Menunggu Verifikasi
                                </Badge>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* File Upload Area */}
                            <div
                                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${selectedFile
                                        ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                                    }`}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                            >
                                {previewUrl ? (
                                    <div className="relative">
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            className="max-h-48 mx-auto rounded-lg shadow-md"
                                        />
                                        <button
                                            onClick={removeFile}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 truncate">
                                            {selectedFile?.name}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <FileImage className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                                        <p className="text-gray-600 dark:text-gray-300 mb-2">
                                            Drag & drop bukti pembayaran di sini
                                        </p>
                                        <p className="text-sm text-gray-400 mb-4">atau</p>
                                        <Button
                                            variant="outline"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Image className="w-4 h-4 mr-2" />
                                            Pilih File
                                        </Button>
                                        <p className="text-xs text-gray-400 mt-3">
                                            Format: JPEG, PNG, GIF, WebP (Max 5MB)
                                        </p>
                                    </div>
                                )}

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </div>

                            {/* Instructions */}
                            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                    Pastikan bukti pembayaran jelas dan mencantumkan nomor referensi transfer.
                                    Admin akan memverifikasi pembayaran Anda dalam waktu 1x24 jam.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={handleClose}>
                        {uploadResult ? 'Tutup' : 'Batal'}
                    </Button>
                    {!uploadResult && (
                        <Button
                            onClick={handleUpload}
                            disabled={!selectedFile || uploading}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Mengunggah...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Bukti
                                </>
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
