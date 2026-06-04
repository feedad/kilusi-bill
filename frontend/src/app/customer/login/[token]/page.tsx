'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function TokenLoginPage() {
  const params = useParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Memvalidasi token...');

  useEffect(() => {
    const validateToken = async () => {
      const token = params.token;

      if (!token) {
        setStatus('error');
        setMessage('Token tidak valid');
        return;
      }

      try {
        // Debug log
        console.log('=== Token Login Debug ===');
        console.log('Token:', token);
        console.log('NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL);

        // Call backend directly (bypass frontend API route)
        const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        console.log('Backend URL:', backendUrl);
        console.log('Calling:', `${backendUrl}/api/v1/customer-auth-nextjs/login-with-token`);

        const loginResponse = await fetch(`${backendUrl}/api/v1/customer-auth-nextjs/login-with-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        console.log('Response status:', loginResponse.status);
        const loginData = await loginResponse.json();
        console.log('Backend response:', loginData);

        if (!loginData.success || !loginData.data) {
          setStatus('error');
          setMessage(loginData.message || 'Token tidak valid atau sudah kadaluarsa');
          return;
        }

        setStatus('success');
        setMessage(`Selamat datang, ${loginData.data.customer.name}!`);

        // Extract session token and customer data
        const sessionToken = loginData.data.sessionToken;
        const backendCustomer = loginData.data.customer;

        // Map backend customer data to frontend Customer interface
        const customerData = {
          id: parseInt(backendCustomer.id) || parseInt(backendCustomer.customer_id) || backendCustomer.id,
          customer_id: backendCustomer.customer_id || backendCustomer.id,
          name: backendCustomer.name,
          phone: backendCustomer.phone,
          username: backendCustomer.username,
          email: backendCustomer.email,
          status: 'active' as const,
          package_id: backendCustomer.package_id,
          package_name: backendCustomer.package_name,
          package_price: backendCustomer.package_price,
          ssid: backendCustomer.ssid,
          password: backendCustomer.password,
          address: backendCustomer.address
        };

        console.log('🔑 Storing auth data:', { sessionToken, customerData });

        // Clear old auth data first
        localStorage.removeItem('customer_token');
        localStorage.removeItem('customer_data');

        // Store in localStorage (using correct keys for CustomerAuthContext)
        localStorage.setItem('customer_token', sessionToken);
        localStorage.setItem('customer_data', JSON.stringify(customerData));

        // Verify storage
        const storedToken = localStorage.getItem('customer_token');
        const storedCustomer = localStorage.getItem('customer_data');
        console.log('🔑 Verification - Token stored:', !!storedToken, 'Customer stored:', !!storedCustomer);
        console.log('🔑 Stored Token:', storedToken?.substring(0, 20) + '...');
        console.log('🔑 Stored Customer:', storedCustomer ? JSON.parse(storedCustomer).name : 'null');

        // Dispatch custom event for immediate context update
        window.dispatchEvent(new CustomEvent('auth:updated', {
          detail: { customer: customerData, token: sessionToken }
        }));

        // Also trigger storage event for compatibility
        window.dispatchEvent(new Event('storage'));

        // Redirect to portal after short delay
        setTimeout(() => {
          router.push('/customer/portal');
        }, 1500);
      } catch (error) {
        console.error('=== Token Login Error ===');
        console.error('Error:', error);
        setStatus('error');
        setMessage('Terjadi kesalahan saat validasi token');
      }
    };

    validateToken();
  }, [params.token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          {/* Logo/Icon */}
          <div className="mb-6">
            {status === 'loading' && (
              <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}
            {status === 'success' && (
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {status === 'error' && (
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
          </div>

          {/* Message */}
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            {status === 'loading' && 'Memproses...'}
            {status === 'success' && 'Login Berhasil!'}
            {status === 'error' && 'Login Gagal'}
          </h1>

          <p className="text-gray-600 mb-6">{message}</p>

          {/* Error Action */}
          {status === 'error' && (
            <div className="space-y-3">
              <button
                onClick={() => router.push('/customer/login')}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Login Manual
              </button>
              <button
                onClick={() => window.location.href = 'https://www.kilusi.id'}
                className="w-full text-blue-600 py-3 px-4 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Kembali ke Beranda
              </button>
            </div>
          )}

          {/* Loading Info */}
          {status === 'loading' && (
            <p className="text-sm text-gray-500">Mohon tunggu sebentar...</p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Powered by KITA SELALU TERKONEKSI</p>
        </div>
      </div>
    </div>
  );
}
