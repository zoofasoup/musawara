import Link from 'next/link'

import { Container } from './Container'
import { Wordmark } from './Logo'
import { COMPANY } from '@/lib/company'

export function SiteFooter() {
  return (
    <footer className="u-inverted mt-24 border-t border-rule">
      <Container wide className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Wordmark variant="light" height={24} />
          <p className="mt-3 text-small text-paper/65">{COMPANY.legalName}</p>
        </div>

        <div>
          <h2 className="u-label text-paper/60">Alamat</h2>
          <address className="mt-3 text-small not-italic text-paper/80">
            {COMPANY.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>

        <div>
          <h2 className="u-label text-paper/60">Kontak</h2>
          <ul className="mt-3 space-y-1.5 text-small text-paper/80">
            <li>
              <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
            </li>
            <li>
              <a href={COMPANY.whatsappUrl} rel="noopener">
                WhatsApp
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="u-label text-paper/60">Halaman</h2>
          <ul className="mt-3 space-y-1.5 text-small text-paper/80">
            <li>
              <Link href="/work">Karya</Link>
            </li>
            <li>
              <Link href="/services">Layanan</Link>
            </li>
            <li>
              <Link href="/careers">Karier</Link>
            </li>
          </ul>
        </div>
      </Container>

      <Container wide>
        <p className="border-t border-rule py-6 text-micro text-paper/60">
          © {new Date().getFullYear()} {COMPANY.legalName}. Bagian dari MUSA Group.
        </p>
      </Container>
    </footer>
  )
}
