'use client';

import React, { useState } from 'react';
import { X, Eye, EyeOff, Send, RefreshCw } from 'lucide-react';

interface MessageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: {
    id: string;
    message_id: string;
    phone_number: string;
    customer_name?: string;
    message_type: string;
    message_content: string;
    status: string;
    sent_at: string;
    delivered_at?: string;
    read_at?: string;
    error_message?: string;
  };
  onResend?: (messageId: string, newPhoneNumber?: string) => Promise<void>;
}

export default function MessageDetailModal({ isOpen, onClose, message, onResend }: MessageDetailModalProps) {
  const [isUnmasked, setIsUnmasked] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendResult, setResendResult] = useState<{ success: boolean; message: string } | null>(null);

  // Debug logging
  console.log('🎯 MessageDetailModal render:', { isOpen, message: message ? { ...message, message_content: message.message_content?.substring(0, 50) } : null });

  // Mask phone number for privacy
  const maskPhone = (phone: string) => {
    if (!phone || phone.length < 8) return phone;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      return '0' + cleaned.substring(1, 4) + 'xxx' + cleaned.substring(7);
    }
    return cleaned.substring(0, 4) + 'xxx' + cleaned.substring(7);
  };

  // Format phone for display
  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      return `0${cleaned.substring(1, 4)} ${cleaned.substring(4, 8)} ${cleaned.substring(8)}`;
    }
    if (cleaned.startsWith('62') && cleaned.length === 12) {
      return `+62 ${cleaned.substring(2, 6)} ${cleaned.substring(6, 10)} ${cleaned.substring(10)}`;
    }
    return phone;
  };

  const handleResend = async () => {
    if (!onResend) return;

    setIsResending(true);
    setResendResult(null);

    try {
      await onResend(message.message_id, isEditing && newPhoneNumber ? newPhoneNumber : undefined);

      setResendResult({
        success: true,
        message: isEditing && newPhoneNumber
          ? `Pesan berhasil dikirim ulang ke ${formatPhone(newPhoneNumber)}`
          : 'Pesan berhasil dikirim ulang'
      });

      // Reset edit mode after successful resend
      if (isEditing) {
        setIsEditing(false);
        setNewPhoneNumber('');
      }

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setResendResult(null);
      }, 2000);
    } catch (error: any) {
      setResendResult({
        success: false,
        message: error.message || 'Gagal mengirim pesan'
      });
    } finally {
      setIsResending(false);
    }
  };

  if (!isOpen || !message) return null;

  const displayPhone = isUnmasked ? message.phone_number : maskPhone(message.phone_number);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 flex items-center justify-between border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Detail Pesan WhatsApp
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Status Badge */}
          <div className="mb-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              message.status === 'sent' || message.status === 'delivered'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : message.status === 'failed'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}>
              {message.status === 'sent' && '✅ Terkirim'}
              {message.status === 'delivered' && '📨 Diterima'}
              {message.status === 'read' && '👀 Dibaca'}
              {message.status === 'failed' && '❌ Gagal'}
              {message.status === 'pending' && '⏳ Menunggu'}
            </span>
          </div>

          {/* Info Grid */}
          <div className="space-y-4">
            {/* Customer Name */}
            {message.customer_name && (
              <div className="flex items-start">
                <span className="w-32 text-sm font-medium text-gray-500 dark:text-gray-400">Nama:</span>
                <span className="flex-1 text-sm text-gray-900 dark:text-white">{message.customer_name}</span>
              </div>
            )}

            {/* Phone Number with Edit */}
            <div className="flex items-start gap-2">
              <span className="w-32 text-sm font-medium text-gray-500 dark:text-gray-400">No. HP:</span>
              <div className="flex-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    placeholder="628xxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900 dark:text-white font-mono">
                      {formatPhone(displayPhone)}
                    </span>
                    <button
                      onClick={() => setIsUnmasked(!isUnmasked)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                      title={isUnmasked ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {isUnmasked ? <EyeOff className="w-4 h-4 text-gray-500" /> : <Eye className="w-4 h-4 text-gray-500" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Edit/Cancel Edit buttons */}
            {!isResending && (
              <div className="flex gap-2 ml-auto">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setNewPhoneNumber('');
                      }}
                      className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={!newPhoneNumber || newPhoneNumber.length < 10}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Simpan
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setNewPhoneNumber(message.phone_number.replace(/\D/g, ''));
                    }}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                      Edit No. HP
                  </button>
                )}
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-start">
              <span className="w-32 text-sm font-medium text-gray-500 dark:text-gray-400">Kirim:</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {new Date(message.sent_at).toLocaleString('id-ID')}
              </span>
            </div>

            {message.delivered_at && (
              <div className="flex items-start">
                <span className="w-32 text-sm font-medium text-gray-500 dark:text-gray-400">Diterima:</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {new Date(message.delivered_at).toLocaleString('id-ID')}
                </span>
              </div>
            )}

            {message.read_at && (
              <div className="flex items-start">
                <span className="w-32 text-sm font-medium text-gray-500 dark:text-gray-400">Dibaca:</span>
                <span className="text-sm text-gray-900 dark:text-white">
                  {new Date(message.read_at).toLocaleString('id-ID')}
                </span>
              </div>
            )}

            {/* Error Message */}
            {message.error_message && (
              <div className="flex items-start">
                <span className="w-32 text-sm font-medium text-gray-500 dark:text-gray-400">Error:</span>
                <span className="text-sm text-red-600 dark:text-red-400">
                  {message.error_message}
                </span>
              </div>
            )}

            {/* Message Content */}
            <div className="mt-4">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 block mb-2">
                Isi Pesan:
              </span>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto">
                <pre className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-sans">
                  {message.message_content}
                </pre>
              </div>
            </div>

            {/* Message ID */}
            <div className="mt-4">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Message ID: {message.message_id || message.id}
              </span>
            </div>

            {/* Resend Result */}
            {resendResult && (
              <div className={`mt-4 p-3 rounded-lg text-sm ${
                resendResult.success
                  ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
              }`}>
                {resendResult.success ? '✅' : '❌'} {resendResult.message}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-t dark:border-gray-700 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Tutup
          </button>

          {onResend && (
            <button
              onClick={handleResend}
              disabled={isResending}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {isEditing && newPhoneNumber ? 'Kirim ke No. Baru' : 'Kirim Ulang'}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
