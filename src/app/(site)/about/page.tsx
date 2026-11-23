import type { Metadata } from 'next'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { COMPANY } from '@/lib/company'

export const metadata: Metadata = {
  alternates: { canonical: '/about' },
  title: 'Tentang',
  description:
    'Musawara Creative adalah tim kreatif in-house MUSA Group, berbasis di Bekasi.',
}

const ROLES = [
  { role: 'Creative Director', scope: 'Arah kreatif, strategi merek, keputusan akhir' },
  { role: 'Copy & Social Media', scope: 'Naskah, kanal organik, kalender konten' },
  { role: 'Desain', scope: 'Aset iklan, materi kanal, produksi visual' },
  { role: 'Ads & Finance', scope: 'Belanja iklan, pelaporan, arus kas' },
  { role: 'CS & Sales', scope: 'Percakapan WhatsApp, penutupan, tindak lanjut' },
]

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tentang"
        title="Tim kecil yang menangani merek grup sendiri."
        standfirst={`${COMPANY.legalName} beroperasi sebagai unit kreatif in-house ${COMPANY.group}, berbasis di Bekasi.`}
      />

      <Container className="py-16 sm:py-20">
        <div className="grid gap-10 border-b border-rule pb-16 md:grid-cols-[14rem_1fr]">
          <h2 className="u-label pt-1.5 text-ink-45">Struktur</h2>
          <div className="max-w-[58ch] space-y-6">
            <p className="text-ink-60">
              Musawara berada di bawah {COMPANY.group} dan menangani merek-merek
              yang dimiliki grup. Susunan ini menentukan cara kami bekerja: tidak
              ada proses pitch, tidak ada laporan yang dibuat untuk meyakinkan
              klien, dan tidak ada pekerjaan yang selesai begitu materi
              diserahkan.
            </p>
            <p className="text-ink-60">
              Konsekuensinya juga jelas. Kami mengerjakan sedikit merek dalam
              waktu panjang, bukan banyak merek dalam waktu pendek.
            </p>
          </div>
        </div>

        <div className="grid gap-10 py-16 md:grid-cols-[14rem_1fr]">
          <h2 className="u-label pt-1.5 text-ink-45">Tim</h2>
          <div className="w-full max-w-[58ch]">
            <p className="text-ink-60">
              Lima sampai enam orang, dengan pembagian tanggung jawab berikut.
            </p>
            <dl className="mt-8">
              {ROLES.map((entry) => (
                <div
                  key={entry.role}
                  className="grid gap-x-6 gap-y-1 border-t border-rule py-4 sm:grid-cols-[13rem_1fr]"
                >
                  <dt className="font-semibold">{entry.role}</dt>
                  <dd className="text-small text-ink-60">{entry.scope}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-small text-ink-60">
              Kami membuka lowongan secara berkala.{' '}
              <Link href="/careers" className="text-purple underline">
                Lihat posisi yang sedang dibuka
              </Link>
              .
            </p>
          </div>
        </div>
      </Container>
    </>
  )
}
