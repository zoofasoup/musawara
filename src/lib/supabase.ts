import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

let cached: SupabaseClient | null = null

/**
 * Read-only anon client for the public site.
 *
 * The anon key is safe in the browser bundle: every table this client touches
 * is protected by an RLS policy that exposes only published rows. Phase 2 adds
 * an authenticated client with cookie handling; this one needs no session.
 */
export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).',
    )
  }
  cached ??= createClient(url, anonKey, {
    auth: { persistSession: false },
  })
  return cached
}
