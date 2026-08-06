import type { Metadata } from 'next'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { getCaseStudies } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Karya',
  description:
    'Tiga merek MUSA Group yang ditangani Musawara Creative: Musafar, NurAlive, dan Musaland.',
}

export default async function WorkPage() {
  const studies = await getCaseStudies()

  return (
    <>
      <PageHeader
        eyebrow="Karya"
        title="Tiga merek, tiga jenis persoalan yang berbeda."
        standfirst="Travel umroh, suplemen herbal, dan logistik B2B tidak dimenangkan dengan cara yang sama. Berikut yang kami kerjakan di masing-masing."
      />

      <Container className="py-6">
        {studies.length === 0 ? (
          <p className="max-w-[48ch] py-16 text-ink-60">
            Studi kasus sedang disiapkan dan akan terbit di sini.
          </p>
        ) : null}

        <ul>
          {studies.map((study) => (
            <li key={study.id} className="border-b border-rule">
              <Link
                href={`/work/${study.slug}`}
                className="group block py-10 no-underline"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-h3">{study.client.name}</span>
                  <span className="u-label text-ink-45">
                    {study.client.category}
                  </span>
                </div>
                <p className="mt-3 max-w-[62ch] text-ink-60">{study.summary}</p>
                <span className="u-label mt-5 inline-block text-purple">
                  Baca selengkapnya →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  )
}
