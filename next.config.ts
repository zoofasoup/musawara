import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next 16 for both dev and build.
  // No webpack config here on purpose: defining one makes `next build` fail.
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
}

export default nextConfig
