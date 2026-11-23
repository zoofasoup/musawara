import type { Metadata } from 'next'

import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'

export const metadata: Metadata = {
  alternates: { canonical: '/services' },
  title: 'Layanan',
  description:
    'Strategi merek, performance marketing, produksi kreatif, serta live selling dan pengelolaan KOL.',
}

const SERVICES = [
  {
    name: 'Strategi merek',
    summary:
      'Menentukan siapa yang dilayani, apa yang dijual, dan alasan harganya sebelum satu materi pun diproduksi.',
    items: [
      'Positioning dan penyusunan penawaran',
      'Profil pelanggan dan pemetaan keberatan',
      'Panduan nada bicara beserta contoh naskah yang boleh dan tidak boleh',
      'Penyusunan daftar klaim dan batas regulasi',
    ],
  },
  {
    name: 'Performance marketing',
    summary:
      'Belanja iklan yang ditelusuri sampai ke transaksi, bukan berhenti di jumlah pesan masuk.',
    items: [
      'Meta Ads: struktur kampanye, pengujian materi, penskalaan',
      'Alur klik-ke-WhatsApp dan penanganan percakapan',
      'Atribusi dari iklan sampai pendaftaran',
      'Pelaporan biaya akuisisi per merek',
    ],
  },
  {
    name: 'Produksi kreatif',
    summary:
      'Materi yang dibuat untuk dipasang dan diuji, bukan untuk dipajang di portofolio.',
    items: [
      'Naskah dan produksi video pendek',
      'Foto dan aset statis untuk iklan',
      'Desain untuk kanal organik dan marketplace',
      'Produksi berulang dengan siklus pengujian mingguan',
    ],
  },
  {
    name: 'Live selling & pengelolaan KOL',
    summary:
      'Penjualan langsung dan kerja sama kreator, dijalankan sebagai kanal tetap.',
    items: [
      'Penyusunan alur siaran dan naskah host',
      'Pencarian dan negosiasi kreator',
      'Jadwal siaran dan operasional harian',
      'Evaluasi per sesi',
    ],
  },
]

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Layanan"
        title="Empat hal, dijalankan sampai selesai."
        standfirst="Kami tidak menjual jam kerja. Setiap layanan di bawah ini kami jalankan lebih dulu untuk merek sendiri sebelum ditawarkan ke pihak lain."
      />

      <Container className="py-6">
        <ol className="counter-reset">
          {SERVICES.map((service, i) => (
            <li
              key={service.name}
              className="grid gap-x-10 gap-y-5 border-b border-rule py-12 md:grid-cols-[4rem_1fr]"
            >
              <span className="u-label pt-2 text-ink-45" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>

              <div>
                <h2 className="text-h2">{service.name}</h2>
                <p className="mt-4 max-w-[58ch] text-ink-60">{service.summary}</p>
                <ul className="mt-6 max-w-[58ch] space-y-2 text-small">
                  {service.items.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span aria-hidden="true" className="text-ink-45">
                        —
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </>
  )
}
