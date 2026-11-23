import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Container } from '@/components/Container'
import { Prose } from '@/components/Prose'
import { getCaseStudies, getCaseStudy } from '@/lib/content'

// Next 16: params is a Promise in pages, layouts, and metadata.
type Props = { params: Promise<{ slug: string }> }

/**
 * Static export needs at least one param or the build fails with
 * `missing "generateStaticParams()"`. When Supabase is unconfigured the content
 * layer returns nothing, so fall back to the three known brand slugs — those
 * pages then render the "being prepared" state below rather than 404ing.
 */
const FALLBACK_SLUGS = ['musafar', 'nuralive', 'musaland']

export async function generateStaticParams() {
  const studies = await getCaseStudies()
  if (studies.length === 0) return FALLBACK_SLUGS.map((slug) => ({ slug }))
  return studies.map((study) => ({ slug: study.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const study = await getCaseStudy(slug)
  if (!study) return { robots: { index: false, follow: true } }
  return {
    title: `${study.client.name} — ${study.title}`,
    description: study.summary ?? undefined,
    alternates: { canonical: `/work/${study.slug}` },
  }
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params
  const study = await getCaseStudy(slug)

  // A known brand whose case study is not published yet says so. An unknown
  // slug is a genuine 404.
  if (!study) {
    if (!FALLBACK_SLUGS.includes(slug)) notFound()
    return (
      <Container className="py-24">
        <Link href="/work" className="u-label text-ink-45 no-underline hover:text-purple">
          ← Karya
        </Link>
        <h1 className="mt-8 text-h1">Studi kasus sedang disiapkan.</h1>
        <p className="mt-5 max-w-[48ch] text-ink-60">
          Halaman ini akan terbit setelah isinya selesai ditinjau.
        </p>
      </Container>
    )
  }

  return (
    <article>
      <Container className="border-b border-rule py-16 sm:py-20">
        <Link href="/work" className="u-label text-ink-45 no-underline hover:text-purple">
          ← Karya
        </Link>

        <div className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-h1">{study.client.name}</h1>
          <span className="u-label text-ink-45">{study.client.category}</span>
        </div>

        {study.client.one_liner ? (
          <p className="mt-5 max-w-[58ch] text-ink-60">{study.client.one_liner}</p>
        ) : null}
      </Container>

      <Container className="py-16">
        <h2 className="max-w-[24ch] text-h2">{study.title}</h2>
        {study.summary ? (
          <p className="mt-5 max-w-[58ch] text-ink-60">{study.summary}</p>
        ) : null}
        <Prose markdown={study.body} className="mt-12" />
      </Container>
    </article>
  )
}
