'use client'

import { useActionState, useId } from 'react'
import { useFormStatus } from 'react-dom'

import { submitApplication, type ApplyState } from '@/app/careers/actions'
import type { JobOpening } from '@/lib/types'

const INITIAL: ApplyState = { status: 'idle' }

const inputClass =
  'mt-1.5 w-full border border-rule bg-transparent px-3 py-2.5 text-body ' +
  'outline-none transition-colors focus:border-purple'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 bg-ink px-6 py-3 text-small font-semibold text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
    >
      {pending ? 'Mengirim…' : 'Kirim lamaran'}
    </button>
  )
}

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
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          placeholder={placeholder}
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
  const [state, action] = useActionState(submitApplication, INITIAL)
  const uid = useId()

  if (state.status === 'success') {
    return (
      <div className="border border-rule p-8">
        <h3 className="text-h3">Lamaran terkirim.</h3>
        <p className="mt-3 max-w-[48ch] text-ink-60">
          {state.message ?? 'Kami membalas setiap lamaran yang masuk.'}
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="max-w-[38rem] space-y-6">
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
          name="job_title"
          required
          defaultValue=""
          className={inputClass}
        >
          <option value="" disabled>
            Pilih posisi
          </option>
          {jobs.map((job) => (
            <option key={job.id} value={job.title}>
              {job.title}
            </option>
          ))}
          <option value="Lamaran terbuka">Lamaran terbuka</option>
        </select>
      </p>

      <Field
        id={`${uid}-name`}
        name="full_name"
        label="Nama lengkap"
        required
        error={state.fieldErrors?.full_name}
      />
      <Field
        id={`${uid}-email`}
        name="email"
        label="Email"
        type="email"
        required
        error={state.fieldErrors?.email}
      />
      <Field
        id={`${uid}-wa`}
        name="whatsapp"
        label="WhatsApp"
        type="tel"
        required
        placeholder="08xx atau +62xx"
        error={state.fieldErrors?.whatsapp}
      />
      <Field
        id={`${uid}-portfolio`}
        name="portfolio_url"
        label="Tautan portofolio"
        type="url"
        placeholder="https://"
        error={state.fieldErrors?.portfolio_url}
      />
      <Field
        id={`${uid}-answer`}
        name="answer"
        label="Jawaban singkat"
        textarea
        hint="Jawab pertanyaan yang tercantum pada posisi yang kamu lamar."
      />

      {/* Honeypot. Hidden from sight and from assistive technology. */}
      <div aria-hidden="true" className="absolute left-[-9999px]">
        <label htmlFor={`${uid}-cw`}>Company website</label>
        <input id={`${uid}-cw`} name="company_website" tabIndex={-1} autoComplete="off" />
      </div>

      <Submit />
    </form>
  )
}
