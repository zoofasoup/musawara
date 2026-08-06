import Link from 'next/link'

import { Container } from '@/components/Container'
import { Logo } from '@/components/Logo'
import { COMPANY } from '@/lib/company'

/*
 * Holding page.
 *
 * The ledger home page is finished but not publishable: every figure in it is
 * still an unverified draft. Rather than show numbers we cannot stand behind,
 * the root serves this notice until they are confirmed.
 *
 * To restore the ledger home:
 *   git show 5158a7f:src/app/page.tsx > src/app/page.tsx
 */

export default function HomePage() {
  return (
    <section className="u-inverted flex min-h-[78vh] items-center">
      <Container className="py-20">
        <Logo variant="light" height={44} priority />

        <p className="u-label mt-10 text-paper/45">Musawara Creative</p>

        <h1 className="mt-5 max-w-[18ch] text-h1">
          Situs ini sedang dalam pengembangan.
        </h1>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3">
          <a href={`mailto:${COMPANY.email}`} className="u-label">
            {COMPANY.email}
          </a>
          {COMPANY.whatsappNumber ? (
            <a href={COMPANY.whatsappUrl} rel="noopener" className="u-label">
              WhatsApp
            </a>
          ) : null}
          <Link href="/careers" className="u-label">
            Karier →
          </Link>
        </div>
      </Container>
    </section>
  )
}
