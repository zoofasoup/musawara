/**
 * Careers application endpoint, routed from worker/index.ts.
 *
 * The site is a Next.js static export, so there are no Server Actions. This
 * runs on the assets Worker, which wrangler.jsonc limits to /api/* via
 * run_worker_first so ordinary page loads never invoke it.
 *
 * Set these as Worker secrets/vars:
 *   SUPABASE_URL, SUPABASE_ANON_KEY   (required to store applications)
 *   RESEND_API_KEY, CAREERS_NOTIFY_FROM, CAREERS_NOTIFY_TO  (optional email)
 */

export type Env = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  // The build reads these to prerender content; accepted here too so the same
  // two variables cover both the build and this endpoint.
  NEXT_PUBLIC_SUPABASE_URL?: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
  RESEND_API_KEY?: string
  CAREERS_NOTIFY_FROM?: string
  CAREERS_NOTIFY_TO?: string
}

function credentials(env: Env): { url?: string; key?: string } {
  return {
    url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+]?[\d][\d\s-]{7,17}$/

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export async function handleApply(request: Request, env: Env): Promise<Response> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ ok: false, message: 'Permintaan tidak valid.' }, 400)
  }

  const get = (key: string): string => {
    const value = form.get(key)
    return typeof value === 'string' ? value.trim() : ''
  }

  // Honeypot — bots that fill every field get a silent success.
  if (get('company_website')) return json({ ok: true })

  const full_name = get('full_name')
  const email = get('email')
  const whatsapp = get('whatsapp')
  const portfolio_url = get('portfolio_url')
  const answer = get('answer')
  const job_title = get('job_title')

  const fieldErrors: Record<string, string> = {}
  if (full_name.length < 2) fieldErrors.full_name = 'Nama wajib diisi.'
  if (!EMAIL_RE.test(email)) fieldErrors.email = 'Alamat email tidak valid.'
  if (!PHONE_RE.test(whatsapp)) fieldErrors.whatsapp = 'Nomor WhatsApp tidak valid.'
  if (portfolio_url && !/^https?:\/\//i.test(portfolio_url)) {
    fieldErrors.portfolio_url = 'Tautan portofolio harus diawali http:// atau https://'
  }
  if (Object.keys(fieldErrors).length > 0) {
    return json({ ok: false, message: 'Periksa kembali isian berikut.', fieldErrors }, 422)
  }

  const { url: supabaseUrl, key: supabaseKey } = credentials(env)
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[apply] Supabase not configured; application not stored')
    return json(
      {
        ok: false,
        message:
          'Formulir belum tersambung ke basis data. Silakan kirim lamaran melalui email untuk sementara.',
      },
      503,
    )
  }

  // PostgREST directly — the supabase-js client is unnecessary weight here.
  const insert = await fetch(`${supabaseUrl}/rest/v1/job_applications`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      full_name,
      email,
      whatsapp,
      portfolio_url: portfolio_url || null,
      answer: answer || null,
    }),
  })

  if (!insert.ok) {
    console.error('[apply] insert failed:', insert.status, await insert.text())
    return json(
      { ok: false, message: 'Lamaran gagal terkirim. Silakan coba lagi beberapa saat lagi.' },
      502,
    )
  }

  await notify(env, { full_name, email, whatsapp, portfolio_url, answer, job_title })

  return json({
    ok: true,
    message: 'Lamaran terkirim. Kami membalas setiap lamaran yang masuk.',
  })
}

/** Notification failure must never fail the application itself. */
async function notify(
  env: Env,
  record: {
    full_name: string
    email: string
    whatsapp: string
    portfolio_url: string
    answer: string
    job_title: string
  },
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.CAREERS_NOTIFY_FROM || !env.CAREERS_NOTIFY_TO) return

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.CAREERS_NOTIFY_FROM,
        to: env.CAREERS_NOTIFY_TO,
        reply_to: record.email,
        subject: `Lamaran baru — ${record.job_title || 'posisi tidak disebutkan'}: ${record.full_name}`,
        text: [
          `Posisi   : ${record.job_title || '—'}`,
          `Nama     : ${record.full_name}`,
          `Email    : ${record.email}`,
          `WhatsApp : ${record.whatsapp}`,
          `Portfolio: ${record.portfolio_url || '—'}`,
          '',
          'Jawaban:',
          record.answer || '—',
        ].join('\n'),
      }),
    })
  } catch (error) {
    console.error('[apply] notification failed:', error)
  }
}
