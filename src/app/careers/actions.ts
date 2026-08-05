'use server'

import { Resend } from 'resend'

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'

export type ApplyState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Partial<Record<'full_name' | 'email' | 'whatsapp' | 'portfolio_url', string>>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Indonesian numbers, with or without +62 / leading 0, spaces and dashes allowed.
const PHONE_RE = /^[+]?[\d][\d\s-]{7,17}$/

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export async function submitApplication(
  _prev: ApplyState,
  form: FormData,
): Promise<ApplyState> {
  // Honeypot: a real applicant never fills this, it is hidden from view and
  // from screen readers. Bots that fill every input get a silent success.
  if (str(form, 'company_website')) {
    return { status: 'success' }
  }

  const full_name = str(form, 'full_name')
  const email = str(form, 'email')
  const whatsapp = str(form, 'whatsapp')
  const portfolio_url = str(form, 'portfolio_url')
  const answer = str(form, 'answer')
  const job_opening_id = str(form, 'job_opening_id') || null
  const job_title = str(form, 'job_title')

  const fieldErrors: ApplyState['fieldErrors'] = {}
  if (full_name.length < 2) fieldErrors.full_name = 'Nama wajib diisi.'
  if (!EMAIL_RE.test(email)) fieldErrors.email = 'Alamat email tidak valid.'
  if (!PHONE_RE.test(whatsapp)) fieldErrors.whatsapp = 'Nomor WhatsApp tidak valid.'
  if (portfolio_url) {
    try {
      const parsed = new URL(portfolio_url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('scheme')
    } catch {
      fieldErrors.portfolio_url = 'Tautan portofolio harus diawali http:// atau https://'
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Periksa kembali isian berikut.', fieldErrors }
  }

  const record = { job_opening_id, full_name, email, whatsapp, portfolio_url: portfolio_url || null, answer: answer || null }

  if (!isSupabaseConfigured) {
    // Local development without credentials: never pretend the application was
    // stored. Log it and tell the applicant plainly.
    console.warn('[careers] Supabase not configured, application not saved:', record)
    return {
      status: 'error',
      message:
        'Formulir belum tersambung ke basis data. Silakan kirim lamaran melalui email untuk sementara.',
    }
  }

  const { error } = await getSupabase().from('job_applications').insert(record)
  if (error) {
    console.error('[careers] insert failed:', error.message)
    return {
      status: 'error',
      message: 'Lamaran gagal terkirim. Silakan coba lagi beberapa saat lagi.',
    }
  }

  await notify({ ...record, job_title })

  return {
    status: 'success',
    message: 'Lamaran terkirim. Kami membalas setiap lamaran yang masuk.',
  }
}

/** Email notification. Failure here must not fail the application itself. */
async function notify(record: {
  full_name: string
  email: string
  whatsapp: string
  portfolio_url: string | null
  answer: string | null
  job_title: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.CAREERS_NOTIFY_FROM
  const to = process.env.CAREERS_NOTIFY_TO

  if (!apiKey || !from || !to) {
    console.info('[careers] notification skipped, Resend not configured')
    return
  }

  try {
    await new Resend(apiKey).emails.send({
      from,
      to,
      replyTo: record.email,
      subject: `Lamaran baru — ${record.job_title || 'posisi tidak disebutkan'}: ${record.full_name}`,
      text: [
        `Posisi   : ${record.job_title || '—'}`,
        `Nama     : ${record.full_name}`,
        `Email    : ${record.email}`,
        `WhatsApp : ${record.whatsapp}`,
        `Portfolio: ${record.portfolio_url ?? '—'}`,
        '',
        'Jawaban:',
        record.answer ?? '—',
      ].join('\n'),
    })
  } catch (error) {
    console.error('[careers] notification failed:', error)
  }
}
