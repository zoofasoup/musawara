import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { Container } from '@/components/Container'
import { Ledger } from '@/components/Ledger'
import { getCaseStudies, getLedger } from '@/lib/content'

export const metadata: Metadata = { alternates: { canonical: '/' } }

const disciplines = [
  { title: 'Strategi merek', description: 'Menentukan arah, mengenali pelanggan, dan menyusun penawaran.' },
  { title: 'Performance marketing', description: 'Mengelola iklan, menguji materi, dan membaca hasilnya.' },
  { title: 'Produksi kreatif', description: 'Membuat naskah, visual, dan konten untuk setiap kanal.' },
]

const steps = [
  { title: 'Pahami', description: 'Mengenali kebutuhan, audiens, dan tujuan yang ingin dicapai.' },
  { title: 'Rencanakan', description: 'Menyusun arah dan memilih langkah yang sesuai dengan kebutuhan.' },
  { title: 'Jalankan', description: 'Membuat dan menjalankan materi bersama tim yang terlibat.' },
  { title: 'Pelajari', description: 'Melihat hasil, mempelajari respons, dan menentukan langkah berikutnya.' },
]

const exampleWork = [
  { category: 'Social media', title: 'Cerita brand di media sosial', description: 'Tempat untuk contoh strategi konten dan karya terbit.' },
  { category: 'Advertising', title: 'Kampanye yang menjangkau audiens', description: 'Tempat untuk materi iklan dan cerita di balik kampanye.' },
  { category: 'Produksi kreatif', title: 'Ide yang dibuat menjadi nyata', description: 'Tempat untuk video, foto, dan visual pilihan.' },
]

export default async function HomePage() {
  const [rows, caseStudies] = await Promise.all([getLedger(), getCaseStudies()])

  return (
    <>
      <section aria-labelledby="home-title">
        <Container wide className="home-hero">
          <div className="home-hero-copy">
            <p className="u-label text-purple">Musawara Creative · MUSA Group</p>
            <h1 id="home-title" className="home-title">
              Kami menjalankan merek, dari strategi sampai eksekusi.
            </h1>
            <p className="home-intro">
              Tim kreatif in-house MUSA Group. Kami menyatukan strategi merek,
              produksi konten, dan iklan dalam pekerjaan sehari-hari.
            </p>
            <Link href="/services" className="home-action">
              Lihat cara kami bekerja <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="home-hero-mark" aria-hidden="true">
            <Image src="/logo/mark-purple.png" alt="" width={1204} height={1397} priority sizes="(max-width: 767px) 200px, 390px" />
          </div>
        </Container>
      </section>

      <section className="home-selected-work" aria-labelledby="selected-work-title">
        <Container wide>
          <div className="home-section-heading">
            <div>
              <p className="u-label text-purple">Karya pilihan</p>
              <h2 id="selected-work-title">Cerita di balik pekerjaan kami.</h2>
            </div>
            <Link href="/work" className="home-text-link">Lihat semua karya <span aria-hidden="true">↗</span></Link>
          </div>
          {caseStudies.length > 0 ? (
            <ul className="home-work-list">
              {caseStudies.map((study) => (
                <li key={study.id}>
                  <Link href={`/work/${study.slug}`} className="home-work-link">
                    <span><strong>{study.client.name}</strong><small>{study.client.category}</small></span>
                    <span>{study.summary}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="home-placeholder-note">Contoh penempatan sementara — karya dan informasi proyek akan dilengkapi.</p>
              <ul className="home-project-grid">
                {exampleWork.map((item, index) => (
                  <li key={item.category} className="home-project">
                    <div className="home-project-art" aria-hidden="true"><span>0{index + 1}</span><span>Musawara<br />Creative</span></div>
                    <p className="u-label text-purple">{item.category} · Contoh</p>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Container>
      </section>

      <section className="home-disciplines" aria-labelledby="disciplines-title">
        <Container wide className="home-disciplines-inner">
          <div>
            <p className="u-label text-purple">Layanan</p>
            <h2 id="disciplines-title">Dibangun<br />dari dalam.</h2>
          </div>
          <div className="home-disciplines-body">
            <p className="home-disciplines-lead">
              Kami ikut menjalankan merek yang kami tangani, dari keputusan awal
              sampai materi bertemu pelanggan.
            </p>
            <ul className="home-service-list">
              {disciplines.map((item) => (
                <li key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </li>
              ))}
            </ul>
            <Link href="/services" className="home-text-link">Semua layanan <span aria-hidden="true">↗</span></Link>
          </div>
        </Container>
      </section>

      {rows.length > 0 && (
        <section className="u-inverted" aria-labelledby="results-title">
          <Container wide className="py-20 sm:py-24">
            <div className="home-section-heading">
              <div>
                <p className="u-label text-paper/70">Hasil kerja</p>
                <h2 id="results-title">Yang kami kerjakan.</h2>
              </div>
              <Link href="/work" className="home-light-link">Lihat karya <span aria-hidden="true">↗</span></Link>
            </div>
            <div className="mt-10"><Ledger rows={rows} /></div>
          </Container>
        </section>
      )}

      <section className="home-process" aria-labelledby="process-title">
        <Container wide>
          <div className="home-section-heading">
            <div><p className="u-label text-purple">Cara kerja</p><h2 id="process-title">Dari percakapan<br />jadi tindakan.</h2></div>
            <p className="home-section-intro">Setiap kebutuhan berbeda. Ini gambaran bagaimana kami memulai dan mengerjakannya bersama.</p>
          </div>
          <ol className="home-process-list">
            {steps.map((step, index) => <li key={step.title}><span className="u-label text-purple">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}
          </ol>
        </Container>
      </section>

      <section className="home-about" aria-labelledby="about-title">
        <Container wide className="home-about-inner">
          <div><p className="u-label text-purple">Tentang Musawara</p><h2 id="about-title">Kerja kreatif,<br />dikerjakan bersama.</h2></div>
          <div><p>Musawara Creative adalah tim in-house MUSA Group yang menghubungkan strategi, produksi, dan pemasaran dalam pekerjaan sehari-hari.</p><Link href="/about" className="home-text-link">Kenal lebih dekat <span aria-hidden="true">↗</span></Link></div>
        </Container>
      </section>

      <section className="home-proof" aria-labelledby="proof-title">
        <Container wide className="home-proof-inner">
          <div><p className="u-label text-purple">Kolaborasi</p><h2 id="proof-title">Dibangun lewat kerja bersama.</h2></div>
          <div><p>Ruang untuk cerita kolaborasi, testimoni, dan hasil kerja yang telah disetujui untuk dipublikasikan.</p><p className="home-placeholder-note">Konten sementara — akan dilengkapi setelah diverifikasi.</p></div>
        </Container>
      </section>

      <section className="home-contact">
        <Container wide className="home-contact-inner">
          <div>
            <p className="u-label text-paper/70">Musawara Creative</p>
            <h2>Ada yang ingin<br />ditanyakan?</h2>
          </div>
          <Link href="/contact" className="home-light-link">Hubungi kami <span aria-hidden="true">↗</span></Link>
        </Container>
      </section>
    </>
  )
}
