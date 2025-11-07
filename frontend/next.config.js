/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons']
  },
  images: {
    domains: ['localhost', '172.22.10.23', '192.168.88.2'],
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  }
}

module.exports = nextConfig