'use client'

import { useEffect, useId, useRef, useState } from 'react'

import type { JobOpening } from '@/lib/types'

type FieldName = 'full_name' | 'email' | 'whatsapp' | 'portfolio_url' | 'answer' | 'job_opening_id'

type ApplyState = {
  status: 'idle' | 'sending' | 'success' | 'error'
  message?: string
  fieldErrors?: Partial<Record<FieldName, string>>
}

const inputClass =
  'mt-1.5 w-full min-h-11 border border-ink-45 bg-transparent px-3 py-2.5 text-body ' +
  'transition-colors focus:border-purple'

function Field({
  id,
  name,
  label,
  type = 'text',
  required = false,
  hint,
  error,
  textarea = false,
  placeholder,
  autoComplete,
  maxLength,
}: {
  id: string
  name: string
  label: string
  type?: string
  required?: boolean
  hint?: string
  error?: string
  textarea?: boolean
  placeholder?: string
  autoComplete?: string
  maxLength: number
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <p>
      <label htmlFor={id} className="text-small font-semibold">
        {label}
        {required ? null : (
          <span className="ml-2 font-normal text-ink-45">opsional</span>
        )}
      </label>
      {hint ? (
        <span id={hintId} className="mt-1 block text-small text-ink-60">
          {hint}
        </span>
      ) : null}
      {textarea ? (
        <textarea
          id={id}
          name={name}
          rows={5}
          required={required}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          required={required}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={inputClass}
        />
      )}
      {error ? (
        <span id={errorId} className="mt-1 block text-small text-purple">
          {error}
        </span>
      ) : null}
    </p>
  )
}

export function ApplicationForm({ jobs }: { jobs: JobOpening[] }) {
  const [state, setState] = useState<ApplyState>({ status: 'idle' })
  const uid = useId()

  const successHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (state.status === 'success') successHeading.current?.focus()
  }, [state.status])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setState({ status: 'sending' })

    try {
      const body = new URLSearchParams()
      for (const [name, value] of new FormData(form)) {
        if (typeof value === 'string') body.append(name, value)
      }
      const response = await fetch('/api/apply', {
        method: 'POST',
        body,
      })
      const result = (await response.json()) as {
        ok: boolean
        message?: string
        fieldErrors?: Partial<Record<FieldName, string>>
      }

      if (result.ok) {
        setState({ status: 'success', message: result.message })
        form.reset()
      } else {
        setState({
          status: 'error',
          message: result.message ?? 'Lamaran gagal terkirim.',
          fieldErrors: result.fieldErrors,
        })
      }
    } catch {
      setState({
        status: 'error',
        message: 'Tidak dapat terhubung. Periksa koneksi lalu coba lagi.',
      })
    }
  }

  if (state.status === 'success') {
    return (
      <div className="border border-rule p-8">
        <h3 ref={successHeading} tabIndex={-1} className="text-h3">Lamaran terkirim.</h3>
        <p className="mt-3 max-w-[48ch] text-ink-60">
          {state.message ?? 'Terima kasih. Lamaranmu sudah kami terima.'}
        </p>
      </div>
    )
  }

  return (
    <form method="post" action="/api/apply" onSubmit={onSubmit} className="max-w-[38rem] space-y-6">
      {state.status === 'error' && state.message ? (
        <p role="alert" className="border-l-2 border-purple pl-4 text-small">
          {state.message}
        </p>
      ) : null}

      <p>
        <label htmlFor={`${uid}-role`} className="text-small font-semibold">
          Posisi yang dilamar
        </label>
        <select
          id={`${uid}-role`}
          name="job_opening_id"
          aria-invalid={state.fieldErrors?.job_opening_id ? true : undefined}
          aria-describedby={state.fieldErrors?.job_opening_id ? `${uid}-role-error` : undefined}
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Pilih posisi
          </option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
          <option value="open">Lamaran terbuka</option>
        </select>
        {state.fieldErrors?.job_opening_id && (
          <span id={`${uid}-role-error`} className="mt-1 block text-small text-purple">
            {state.fieldErrors.job_opening_id}
          </span>
        )}
      </p>

      <Field
        id={`${uid}-name`}
        name="full_name"
        maxLength={120}
        autoComplete="name"
        label="Nama lengkap"
        required
        error={state.fieldErrors?.full_name}
      />
      <Field
        id={`${uid}-email`}
        name="email"
        maxLength={254}
        autoComplete="email"
        label="Email"
        type="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        id={`${uid}-wa`}
        name="whatsapp"
        maxLength={19}
        autoComplete="tel"
        label="WhatsApp"
        type="tel"
        required
        placeholder="08xx atau +62xx"
        error={state.fieldErrors?.whatsapp}
      />
      <Field
        id={`${uid}-portfolio`}
        name="portfolio_url"
        maxLength={1024}
        autoComplete="url"
        label="Tautan portofolio"
        type="url"
        placeholder="https://"
        error={state.fieldErrors?.portfolio_url}
      />
      <Field
        id={`${uid}-answer`}
        name="answer"
        maxLength={2000}
        label="Jawaban singkat"
        textarea
        error={state.fieldErrors?.answer}
        hint="Jawab pertanyaan yang tercantum pada posisi yang kamu lamar."
      />

      {/* Honeypot. Hidden from sight and from assistive technology. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label htmlFor={`${uid}-cw`}>Company website</label>
        <input id={`${uid}-cw`} name="company_website" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={state.status === 'sending'}
        className="mt-2 bg-ink px-6 py-3 text-small font-semibold text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {state.status === 'sending' ? 'Mengirim…' : 'Kirim lamaran'}
      </button>
    </form>
  )
}
