import type { MetadataRoute } from 'next'
import { getCaseStudies } from '@/lib/content'
import { SITE_INDEXABLE, SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_INDEXABLE) return []
  const studies = await getCaseStudies()
  return [
    '/', '/about', '/services', '/work', '/contact', '/careers',
    ...studies.map(({ slug }) => `/work/${slug}`),
  ].map((path) => ({ url: new URL(path, SITE_URL).href }))
}
