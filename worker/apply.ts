export type Env = {
  CAREERS_ENABLED?: string
  APPLY_LIMITER: RateLimit
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  RESEND_API_KEY?: string
  CAREERS_NOTIFY_FROM?: string
  CAREERS_NOTIFY_TO?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+]?[\d][\d\s-]{7,17}$/
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 16384

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers })
}

async function readForm(request: Request): Promise<URLSearchParams | null> {
  const type = request.headers.get('content-type')?.split(';')[0]
  if (type !== 'application/x-www-form-urlencoded' || !request.body) return null
  const reader = request.body.getReader()
  const bytes = new Uint8Array(MAX_BODY_BYTES)
  let offset = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (offset + value.byteLength > bytes.byteLength) {
      await reader.cancel()
      return null
    }
    bytes.set(value, offset)
    offset += value.byteLength
  }
  return new URLSearchParams(new TextDecoder().decode(bytes.subarray(0, offset)))
}

function validPortfolio(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

export async function handleApply(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const unavailable = () => json({ ok: false, message: 'Formulir lamaran sedang tidak tersedia.' }, 503)
  if (env.CAREERS_ENABLED !== 'true') return json({ ok: false, message: 'Formulir lamaran ditutup.' }, 404)
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') || !env.APPLY_LIMITER) {
    return unavailable()
  }
  try {
    const { success } = await env.APPLY_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' })
    if (!success) {
      return json({ ok: false, message: 'Terlalu banyak percobaan. Coba lagi dalam satu menit.' }, 429, { 'Retry-After': '60' })
    }

    const form = await readForm(request)
    if (!form) return json({ ok: false, message: 'Permintaan tidak valid atau terlalu besar.' }, 400)
    const get = (key: string) => form.get(key)?.trim() ?? ''
    const received = { ok: true, message: 'Terima kasih. Lamaranmu sudah kami terima.' }
    if (get('company_website')) return json(received)

    const full_name = get('full_name')
    const email = get('email')
    const whatsapp = get('whatsapp')
    const portfolio_url = get('portfolio_url')
    const answer = get('answer')
    const role = get('job_opening_id')
    const fieldErrors: Record<string, string> = {}

    if (full_name.length < 2 || full_name.length > 120) fieldErrors.full_name = 'Nama harus berisi 2 hingga 120 karakter.'
    if (email.length > 254 || !EMAIL_RE.test(email)) fieldErrors.email = 'Alamat email tidak valid.'
    if (!PHONE_RE.test(whatsapp)) fieldErrors.whatsapp = 'Nomor WhatsApp tidak valid.'
    if (portfolio_url && (portfolio_url.length > 1024 || !validPortfolio(portfolio_url))) {
      fieldErrors.portfolio_url = 'Masukkan tautan portofolio http:// atau https:// yang valid.'
    }
    if (answer.length > 2000) fieldErrors.answer = 'Jawaban maksimal 2.000 karakter.'
    if (role !== 'open' && !UUID_RE.test(role)) fieldErrors.job_opening_id = 'Pilih posisi yang tersedia.'
    if (Object.keys(fieldErrors).length) {
      return json({ ok: false, message: 'Periksa kembali isian berikut.', fieldErrors }, 422)
    }

    const headers = { apikey: env.SUPABASE_SECRET_KEY }
    let jobTitle = 'Lamaran terbuka'
    if (role !== 'open') {
      const roles = new URL('/rest/v1/job_openings', env.SUPABASE_URL)
      roles.search = new URLSearchParams({ select: 'title', id: `eq.${role}`, is_published: 'eq.true' }).toString()
      const response = await fetch(roles, { headers, signal: AbortSignal.timeout(8000) })
      if (!response.ok) {
        console.error('[apply] job lookup failed', response.status)
        return unavailable()
      }
      const [job] = await response.json<{ title: string }[]>()
      if (!job) return json({ ok: false, message: 'Posisi ini sudah tidak tersedia. Muat ulang halaman.' }, 422)
      jobTitle = job.title
    }

    const record = {
      job_opening_id: role === 'open' ? null : role,
      full_name,
      email,
      whatsapp,
      portfolio_url: portfolio_url || null,
      answer: answer || null,
    }
    const response = await fetch(new URL('/rest/v1/job_applications', env.SUPABASE_URL), {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      console.error('[apply] insert failed', response.status)
      return unavailable()
    }

    ctx.waitUntil(notify(env, jobTitle))
    return json(received)
  } catch {
    console.error('[apply] request failed')
    return unavailable()
  }
}

async function notify(env: Env, jobTitle: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.CAREERS_NOTIFY_FROM || !env.CAREERS_NOTIFY_TO) return
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.CAREERS_NOTIFY_FROM,
        to: env.CAREERS_NOTIFY_TO,
        subject: 'Lamaran baru di Musawara Creative',
        text: `Ada lamaran baru untuk ${jobTitle}. Buka dashboard Supabase untuk meninjau lamaran.`,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) console.error('[apply] notification failed', response.status)
  } catch {
    console.error('[apply] notification failed')
  }
}
