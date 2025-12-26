/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_PORTAL_URL: process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.kilusi.id'
  },
    // Remove console.log in production builds
  compiler: {
    // Remove console.log, console.warn, console.info in production
    // Keep console.error for debugging critical issues
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }  // Keep console.error only
      : false  // Keep all console in development
  }
}

module.exports = nextConfig