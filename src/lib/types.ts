export type ClientStatus = 'active' | 'paused' | 'archived'
export type OutcomeKind = 'metric' | 'milestone'
export type EmploymentType = 'PKWT' | 'PKWTT' | 'Magang' | 'Freelance'
export type WorkArrangement = 'onsite' | 'hybrid' | 'remote'

export type Client = {
  id: string
  name: string
  slug: string
  category: string | null
  one_liner: string | null
  logo_url: string | null
  status: ClientStatus
  sort_order: number
}

export type LedgerEntry = {
  id: string
  client_id: string
  outcome_kind: OutcomeKind
  start_value: string | null
  start_note: string | null
  end_value: string | null
  end_note: string | null
  period: string | null
  sort_order: number
}

/** A ledger entry joined to the brand it belongs to. */
export type LedgerRow = LedgerEntry & {
  client: Pick<Client, 'name' | 'slug' | 'category'>
}

export type CaseStudy = {
  id: string
  client_id: string
  slug: string
  title: string
  summary: string | null
  body: string | null
  sort_order: number
  client: Pick<Client, 'name' | 'slug' | 'category' | 'one_liner'>
}

export type JobOpening = {
  id: string
  slug: string
  title: string
  employment_type: EmploymentType
  location: string
  work_arrangement: WorkArrangement
  week_one: string | null
  tools: string[]
  salary_min: number | null
  salary_max: number | null
  salary_period: string
  question_prompt: string | null
  sort_order: number
}
