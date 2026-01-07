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

  // Priority Exception: Always allow access to public Blog
  if (request.nextUrl.pathname.startsWith('/blog')) {
    return NextResponse.next();
  }

  // Extract subdomain from hostname
  const subdomain = hostname.split('.')[0];

  // Handle subdomain routing
  if (subdomain === 'api') {
    // API subdomain - proxy to backend
    // Note: In production this should ideally be handled by Nginx/Infrastructure
    // But for dev/simple setup, we proxy via Next.js
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const targetUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, backendUrl);
    return NextResponse.rewrite(targetUrl);
  } else if (subdomain === 'portal') {
    // Portal subdomain - route to customer pages
    const url = request.nextUrl.clone();

    // Don't rewrite if it's already a customer route
    // But ALSO check if we are *accidentally* rewriting a valid customer path that was accessed directly
    // If the path starts with /customer/, we should let it be served as is (Next.js file routing handles /customer/)
    // The rewrite below `url.pathname = /customer...` is only for when accessing e.g. portal.domain.com/dashboard -> /customer/dashboard
    if (request.nextUrl.pathname.startsWith('/customer/')) {
      return NextResponse.next();
    }

    // ... rest of portal logic
    if (request.nextUrl.pathname === '/') {
      url.pathname = '/customer/login';
      return NextResponse.rewrite(url);
    }

    // Rewrite logic: prepend customer
    url.pathname = `/customer${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  } else if (subdomain === 'billing') {
    // Billing subdomain - route to admin pages
    const url = request.nextUrl.clone();

    // Don't rewrite if it's already an admin route or technician route
    if (
      request.nextUrl.pathname.startsWith('/admin/') ||
      request.nextUrl.pathname.startsWith('/technician')
    ) {
      return NextResponse.next();
    }

    // Exception is now handled globally at the top

    // If user is at root of billing, redirect to admin login
    if (request.nextUrl.pathname === '/') {
      url.pathname = '/admin/login';
    } else {
      url.pathname = `/admin${request.nextUrl.pathname}`;
    }

    return NextResponse.rewrite(url);
  } else if (subdomain === 'kilusi' || subdomain === 'www') {
    // Landing page (explicit)
    return NextResponse.next();
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