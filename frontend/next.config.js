/** @type {import('next').NextConfig} */
const nextConfig = {
  generateBuildId: async () => {
    return 'kilusi-frontend-build';
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons']
  },
  images: {
    domains: ['localhost', '172.22.10.23', '192.168.88.2'],
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.kilusi.id',
    NEXT_PUBLIC_PORTAL_URL: process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.kilusi.id'
  },
  // Remove console.log in production builds
  compiler: {
    // Remove console.log, console.warn, console.info in production
    // Keep console.error for debugging critical issues
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }  // Keep console.error only
      : false  // Keep all console in development
  },
  async rewrites() {
    // Proxy payment webhook/callback requests to backend API (port 3001)
    // Cloudflare Tunnel goes directly to Next.js (port 8080), bypassing Nginx
    // These must be in beforeFiles to take precedence over Next.js routes
    return {
      beforeFiles: [
        {
          source: '/api/v1/payments/webhook/:path*',
          destination: 'http://localhost:3001/api/v1/payments/webhook/:path*',
        },
        {
          source: '/api/v1/payments/callback/:path*',
          destination: 'http://localhost:3001/api/v1/payments/callback/:path*',
        },
      ],
    }
  },
  // Disable Next.js development stack frames in production
  productionBrowserSourceMaps: false,
  // Disable X-Powered-By header
  poweredByHeader: false,
}

module.exports = nextConfig