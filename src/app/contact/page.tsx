import type { Metadata } from 'next'

import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { COMPANY } from '@/lib/company'

export const metadata: Metadata = {
  title: 'Kontak',
  description: `Hubungi ${COMPANY.name} — ${COMPANY.legalName}, Bekasi.`,
}

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Kontak"
        title="Cara paling cepat menghubungi kami."
        standfirst="WhatsApp dibalas paling cepat pada jam kerja. Email dibalas dalam dua hari kerja."
      />

      <Container className="py-16 sm:py-20">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="u-label text-ink-45">Langsung</h2>
            <ul className="mt-6 space-y-6">
              <li>
                <a
                  href={COMPANY.whatsappUrl}
                  rel="noopener"
                  className="text-h3 text-purple underline"
                >
                  WhatsApp
                </a>
                {!COMPANY.whatsappNumber ? (
                  <p className="mt-2 text-small text-ink-60">
                    Nomor belum dicantumkan.
                  </p>
                ) : null}
              </li>
              <li>
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="text-h3 text-purple underline"
                >
                  {COMPANY.email}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="u-label text-ink-45">Kantor</h2>
            <address className="mt-6 not-italic">
              <p className="font-semibold">{COMPANY.legalName}</p>
              {COMPANY.addressLines.map((line) => (
                <span key={line} className="mt-1 block text-ink-60">
                  {line}
                </span>
              ))}
            </address>
            <p className="mt-6 text-small text-ink-60">
              Bagian dari {COMPANY.group}.
            </p>
          </div>
        </div>
      </Container>
    </>
  )
}
