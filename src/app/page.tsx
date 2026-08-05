import Link from 'next/link'

import { Container } from '@/components/Container'
import { Ledger } from '@/components/Ledger'
import { getCaseStudies, getLedger } from '@/lib/content'

export default async function HomePage() {
  const [rows, caseStudies] = await Promise.all([getLedger(), getCaseStudies()])

  return (
    <>
      {/*
        The ledger is the hero. It sits on the ink ground because the figure
        accent (brand lime) is only legible there. Everything below is paper
        and deliberately quieter.
      */}
      <section className="u-inverted">
        <Container wide className="pb-16 pt-12 sm:pb-20 sm:pt-16">
          <p className="u-label ledger-rule text-paper/45">MUSA Group · Bekasi</p>

          {/*
            Deliberately set at h1 scale rather than display scale. §6.2 makes
            the ledger the hero; a 84px headline pushed it below the fold and
            turned the page back into "headline over a dark background".
          */}
          <h1 className="mt-5 max-w-[22ch] text-h1">
            Kami menjalankan merek, bukan sekadar mempresentasikannya.
          </h1>

          <p className="mt-5 max-w-[52ch] text-small text-paper/70">
            Musawara Creative adalah tim kreatif in-house MUSA Group. Tiga merek
            di bawah ini kami tangani sendiri, dari strategi sampai belanja
            iklannya. Berikut catatannya.
          </p>

          <div className="mt-10">
            <div
              className="ledger-rule mb-1 h-px w-full bg-current opacity-25"
              aria-hidden="true"
            />
            <Ledger rows={rows} />
          </div>
        </Container>
      </section>

      {/* Thesis */}
      <section className="border-b border-rule">
        <Container className="py-20 sm:py-24">
          <div className="grid gap-10 md:grid-cols-[14rem_1fr]">
            <h2 className="u-label pt-1.5 text-ink-45">Cara kami bekerja</h2>
            <div className="max-w-[58ch] space-y-6">
              <p className="text-h3">
                Agensi menyerahkan rekomendasi. Kami menanggung akibat dari
                rekomendasi itu.
              </p>
              <p className="text-ink-60">
                Setiap merek yang kami tangani adalah merek grup sendiri. Kalau
                biaya akuisisi naik, yang menanggung kami. Kalau klaim produk
                keliru dan berurusan dengan regulator, yang mengurus juga kami.
                Perbedaannya terasa pada cara kerja: kami jarang mengusulkan
                sesuatu yang belum pernah kami jalankan sendiri.
              </p>
              <p className="text-ink-60">
                Karena itu pekerjaan yang biasanya dianggap tidak menarik —
                perizinan edar, sertifikasi halal, penyusunan daftar klaim yang
                boleh dan tidak boleh — kami tempatkan di awal, bukan di akhir.
                Naskah iklan yang bagus tidak ada gunanya kalau tidak boleh
                tayang.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Work preview */}
      <section>
        <Container className="py-20 sm:py-24">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="u-label text-ink-45">Merek yang kami tangani</h2>
            <Link href="/work" className="u-label text-purple">
              Lihat semua →
            </Link>
          </div>

          <ul className="mt-8">
            {caseStudies.map((study) => (
              <li key={study.id} className="border-t border-rule">
                <Link
                  href={`/work/${study.slug}`}
                  className="group grid gap-x-8 gap-y-2 py-7 no-underline sm:grid-cols-[13rem_1fr]"
                >
                  <div>
                    <span className="font-semibold">{study.client.name}</span>
                    <span className="u-label ml-3 text-ink-45 sm:ml-0 sm:block sm:pt-1.5">
                      {study.client.category}
                    </span>
                  </div>
                  <p className="max-w-[56ch] text-ink-60 group-hover:text-ink">
                    {study.summary}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  )
}
