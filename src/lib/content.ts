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
function useFixtures(): boolean {
  if (isSupabaseConfigured) return false

  // The signal that matters is "is this a real deployment", not "is this a
  // production build" — `next build` run locally to check the bundle is not a
  // deployment. VERCEL_ENV is set to 'production' or 'preview' on any Vercel
  // deploy and is undefined locally.
  const deployment = process.env.VERCEL_ENV
  if (deployment === 'production' || deployment === 'preview') {
    throw new Error(
      `Supabase is not configured on a ${deployment} deployment. Refusing to ` +
        'serve development fixture content. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  console.warn(
    '[content] Supabase not configured — serving development fixtures. ' +
      'These contain UNVERIFIED figures and must never reach a real domain.',
  )
  return true
}

const CLIENT_FIELDS = 'name, slug, category'

export async function getLedger(): Promise<LedgerRow[]> {
  if (useFixtures()) return fixtureLedger

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
  if (useFixtures()) return fixtureCaseStudies

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
  if (useFixtures()) {
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
  if (useFixtures()) return fixtureJobs

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
