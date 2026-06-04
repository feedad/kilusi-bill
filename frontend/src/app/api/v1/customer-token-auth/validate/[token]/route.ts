import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token tidak ada' },
        { status: 400 }
      );
    }

    // Call backend API to validate token
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const response = await fetch(`${backendUrl}/api/v1/customer-token-auth/validate/${token}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    // Handle backend response format { success: true, data: { valid: true, customer: {...} } }
    if (result.success && result.data) {
      return NextResponse.json({
        valid: result.data.valid,
        customer: result.data.customer,
        error: result.data.error
      });
    }

    // Fallback for direct format
    return NextResponse.json(result);

  } catch (error) {
    console.error('Token validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Error saat validasi token' },
      { status: 500 }
    );
  }
}
