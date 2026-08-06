import 'server-only'

import { getSupabase, isSupabaseConfigured } from './supabase'
import { fixtureCaseStudies, fixtureJobs, fixtureLedger } from './fixtures'
import type { CaseStudy, JobOpening, LedgerRow } from './types'

/**
 * Content reads for the public site.
 *
 * When Supabase is unconfigured we fall back to the development fixture so the
 * site can be run without credentials. That fallback is refused in production:
 * shipping placeholder figures to a real domain is the exact failure this
 * project is trying to prevent.
 */
type ContentMode = 'live' | 'fixtures' | 'empty'

/**
 * Decides where content comes from.
 *
 *   live     — Supabase is configured; read from it.
 *   fixtures — local development without credentials; serve the dev fixture.
 *   empty    — a real deployment without credentials; serve nothing.
 *
 * The 'empty' case matters: an earlier version threw here, which meant a
 * deployment without Supabase failed the whole build. That also took down
 * genuinely static routes that need no database at all — notably the NurAlive
 * price calculator in public/. Refusing to publish unverified fixtures does not
 * require refusing to publish the site, so content-backed pages fall back to
 * their empty states and everything else deploys normally.
 */
function contentMode(): ContentMode {
  if (isSupabaseConfigured) return 'live'

  // VERCEL_ENV is 'production' or 'preview' on any Vercel deploy, and undefined
  // locally — so `next build` run locally to check the bundle still gets the
  // fixture, while a real deployment never does.
  const deployment = process.env.VERCEL_ENV
  if (deployment === 'production' || deployment === 'preview') {
    console.warn(
      `[content] Supabase not configured on a ${deployment} deployment. ` +
        'Serving empty content — fixtures are never published.',
    )
    return 'empty'
  }

  console.warn(
    '[content] Supabase not configured — serving development fixtures. ' +
      'These contain UNVERIFIED figures and must never reach a real domain.',
  )
  return 'fixtures'
}

const CLIENT_FIELDS = 'name, slug, category'

export async function getLedger(): Promise<LedgerRow[]> {
  const mode = contentMode()
  if (mode === 'empty') return []
  if (mode === 'fixtures') return fixtureLedger

  const { data, error } = await getSupabase()
    .from('ledger_entries')
    .select(
      `id, client_id, outcome_kind, start_value, start_note, end_value,
       end_note, period, sort_order, client:clients!inner(${CLIENT_FIELDS})`,
    )
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Gagal memuat ledger: ${error.message}`)
  return (data ?? []) as unknown as LedgerRow[]
}

export async function getCaseStudies(): Promise<CaseStudy[]> {
  const mode = contentMode()
  if (mode === 'empty') return []
  if (mode === 'fixtures') return fixtureCaseStudies

  const { data, error } = await getSupabase()
    .from('case_studies')
    .select(
      `id, client_id, slug, title, summary, body, sort_order,
       client:clients!inner(${CLIENT_FIELDS}, one_liner)`,
    )
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Gagal memuat studi kasus: ${error.message}`)
  return (data ?? []) as unknown as CaseStudy[]
}

export async function getCaseStudy(slug: string): Promise<CaseStudy | null> {
  const mode = contentMode()
  if (mode === 'empty') return null
  if (mode === 'fixtures') {
    return fixtureCaseStudies.find((entry) => entry.slug === slug) ?? null
  }

  const { data, error } = await getSupabase()
    .from('case_studies')
    .select(
      `id, client_id, slug, title, summary, body, sort_order,
       client:clients!inner(${CLIENT_FIELDS}, one_liner)`,
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`Gagal memuat studi kasus: ${error.message}`)
  return (data as unknown as CaseStudy) ?? null
}

export async function getJobOpenings(): Promise<JobOpening[]> {
  const mode = contentMode()
  if (mode === 'empty') return []
  if (mode === 'fixtures') return fixtureJobs

  const { data, error } = await getSupabase()
    .from('job_openings')
    .select(
      `id, slug, title, employment_type, location, work_arrangement, week_one,
       tools, salary_min, salary_max, salary_period, question_prompt, sort_order`,
    )
    .order('sort_order', { ascending: true })

  if (error) throw new Error(`Gagal memuat lowongan: ${error.message}`)
  return (data ?? []) as JobOpening[]
}
