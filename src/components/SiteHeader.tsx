import Link from 'next/link'

import { Container } from './Container'
import { Wordmark } from './Logo'

const NAV = [
  { href: '/work', label: 'Karya' },
  { href: '/services', label: 'Layanan' },
  { href: '/about', label: 'Tentang' },
  { href: '/careers', label: 'Karier' },
  { href: '/contact', label: 'Kontak' },
]

export function SiteHeader() {
  return (
    <header className="border-b border-rule">
      <Container wide className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3">
        <Link href="/" className="no-underline" aria-label="Musawara Creative, ke beranda">
          <Wordmark variant="purple" height={24} priority />
        </Link>

        <nav aria-label="Navigasi utama" className="w-full sm:ml-auto sm:w-auto">
          <ul className="flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:gap-x-6">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="u-label inline-flex min-h-11 items-center text-ink-60 no-underline transition-colors hover:text-purple"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  )
}
