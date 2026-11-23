import Link from 'next/link'

import { Container } from '@/components/Container'

export default function NotFound() {
  return (
    <main>
      <Container className="py-28">
        <p className="u-label text-ink-45">404</p>
        <h1 className="mt-5 max-w-[18ch] text-h1">Halaman ini tidak ada.</h1>
        <p className="mt-6 max-w-[48ch] text-ink-60">
          Tautannya mungkin sudah berubah, atau memang belum pernah ada.
        </p>
        <Link href="/" className="u-label mt-8 inline-block text-purple">
          Kembali ke beranda →
        </Link>
      </Container>
    </main>
  )
}
