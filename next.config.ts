import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Static export, deployed to Cloudflare Pages.
  //
  // Consequences, all handled elsewhere in the codebase:
  //   - No rewrites. The price calculator resolves because Cloudflare Pages
  //     serves public/nuralive/price-calculator/index.html at the directory
  //     path; Next's own server does not, which is why the dev rewrite is gone.
  //   - No Server Actions. The careers form posts to a Cloudflare Pages
  //     Function in functions/api/apply.ts instead.
  //   - No image optimisation, hence `unoptimized` below.
  output: 'export',
  images: { unoptimized: true },

  // Turbopack is the default bundler in Next 16 for both dev and build.
  // No webpack config here on purpose: defining one makes `next build` fail.
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
}

export default nextConfig
