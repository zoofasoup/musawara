import type { MetadataRoute } from 'next'
import { SITE_INDEXABLE, SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: ['/api/'] },
    sitemap: SITE_INDEXABLE ? new URL('/sitemap.xml', SITE_URL).href : undefined,
  }
}
