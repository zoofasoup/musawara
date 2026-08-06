import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Turbopack is the default bundler in Next 16 for both dev and build.
  // No webpack config here on purpose: defining one makes `next build` fail.
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },

  async rewrites() {
    return [
      // The NurAlive price calculator is a self-contained static page, not a
      // React route. Next serves files in public/ at their literal path and
      // does not resolve a directory index, so /nuralive/price-calculator
      // would 404 without this.
      {
        source: '/nuralive/price-calculator',
        destination: '/nuralive/price-calculator/index.html',
      },
    ]
  },
}

export default nextConfig
