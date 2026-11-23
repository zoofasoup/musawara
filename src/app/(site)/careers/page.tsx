import type { Metadata } from 'next'

import { ApplicationForm } from '@/components/ApplicationForm'
import { Container } from '@/components/Container'
import { PageHeader } from '@/components/PageHeader'
import { Prose } from '@/components/Prose'
import { getJobOpenings } from '@/lib/content'
import { CAREERS_ENABLED } from '@/lib/site'
import { COMPANY } from '@/lib/company'
import { formatArrangement, formatSalaryRange } from '@/lib/format'

export const metadata: Metadata = {
  alternates: { canonical: '/careers' },
  title: 'Karier',
  description:
    'Posisi yang sedang dibuka di Musawara Creative, lengkap dengan rentang gaji.',
}

export default async function CareersPage() {
  const jobs = await getJobOpenings()
  const privacyUrl = process.env.CAREERS_PRIVACY_URL
  const acceptsApplications = CAREERS_ENABLED && Boolean(privacyUrl?.startsWith('https://'))

  return (
    <>
      <PageHeader
        eyebrow="Karier"
        title="Posisi yang sedang dibuka."
        standfirst="Rentang gaji dicantumkan pada setiap posisi. Kami juga menuliskan apa yang akan kamu kerjakan pada minggu pertama, supaya tidak ada kejutan setelah tanda tangan."
      />

      <Container className="py-6">
        {jobs.length === 0 ? (
          <div className="border-b border-rule py-16">
            <p className="max-w-[48ch] text-ink-60">
              Belum ada posisi yang dibuka saat ini.
              {acceptsApplications && ' Kamu tetap bisa mengirim lamaran terbuka melalui formulir di bawah.'}
            </p>
          </div>
        ) : (
          <ul>
            {jobs.map((job) => {
              const salary = formatSalaryRange(
                job.salary_min,
                job.salary_max,
                job.salary_period,
              )
              return (
                <li key={job.id} className="border-b border-rule py-12">
                  <h2 className="text-h2">{job.title}</h2>

                  <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                    <div>
                      <dt className="u-label text-ink-45">Status</dt>
                      <dd className="mt-1 text-small">{job.employment_type}</dd>
                    </div>
                    <div>
                      <dt className="u-label text-ink-45">Lokasi</dt>
                      <dd className="mt-1 text-small">
                        {job.location} · {formatArrangement(job.work_arrangement)}
                      </dd>
                    </div>
                    <div>
                      <dt className="u-label text-ink-45">Rentang gaji</dt>
                      <dd className="mt-1 text-small font-semibold">
                        {salary ?? 'Belum ditentukan'}
                      </dd>
                    </div>
                  </dl>

                  {job.week_one ? (
                    <Prose markdown={job.week_one} className="mt-8" />
                  ) : null}

                  {job.tools.length > 0 ? (
                    <div className="mt-8">
                      <h3 className="u-label text-ink-45">Alat yang dipakai</h3>
                      <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-2 text-small">
                        {job.tools.map((tool) => (
                          <li key={tool} className="border border-rule px-2.5 py-1">
                            {tool}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {job.question_prompt ? (
                    <div className="mt-8 max-w-[58ch] border-l-2 border-rule pl-4">
                      <h3 className="u-label text-ink-45">
                        Pertanyaan untuk posisi ini
                      </h3>
                      <p className="mt-2 text-ink-60">{job.question_prompt}</p>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Container>

      <Container className="py-16">
        {acceptsApplications ? (
          <>
            <h2 className="text-h2">Kirim lamaran</h2>
            <p className="mt-4 max-w-[52ch] text-ink-60">
              Data dalam formulir digunakan untuk meninjau lamaran dan menghubungimu
              terkait rekrutmen. Baca <a href={privacyUrl} className="text-purple underline">pemberitahuan privasi rekrutmen</a>.
            </p>
            <div className="mt-10">
              <ApplicationForm jobs={jobs} />
            </div>
          </>
        ) : (
          <>
            <h2 className="text-h2">Pertanyaan tentang karier?</h2>
            <p className="mt-4 max-w-[52ch] text-ink-60">
              Formulir lamaran belum tersedia. Untuk menanyakan lowongan, hubungi{' '}
              <a href={`mailto:${COMPANY.email}`} className="text-purple underline">{COMPANY.email}</a>.
            </p>
          </>
        )}
      </Container>
    </>
  )
}
