import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';

  // Skip middleware for API routes, static files, and Next.js internals
  if (
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/_next/') ||
    request.nextUrl.pathname.startsWith('/favicon.') ||
    request.nextUrl.pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Extract subdomain from hostname
  const subdomain = hostname.split('.')[0];

  // Handle subdomain routing
  if (subdomain === 'portal') {
    // Portal subdomain - route to customer pages
    const url = request.nextUrl.clone();

    // Don't rewrite if it's already a customer route
    if (request.nextUrl.pathname.startsWith('/customer/')) {
      return NextResponse.next();
    }

    // If user is at root of portal, redirect to customer login
    if (request.nextUrl.pathname === '/') {
      url.pathname = '/customer/login';
    } else {
      url.pathname = `/customer${request.nextUrl.pathname}`;
    }

    return NextResponse.rewrite(url);
  } else if (subdomain === 'billing') {
    // Billing subdomain - route to admin pages
    const url = request.nextUrl.clone();

    // Don't rewrite if it's already an admin route
    if (request.nextUrl.pathname.startsWith('/admin/')) {
      return NextResponse.next();
    }

    // If user is at root of billing, redirect to admin login
    if (request.nextUrl.pathname === '/') {
      url.pathname = '/admin/login';
    } else {
      url.pathname = `/admin${request.nextUrl.pathname}`;
    }

    return NextResponse.rewrite(url);
  }

  // Default behavior - continue without rewriting
  return NextResponse.next();
}

// Configure middleware to match specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (including .ext extensions)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
};