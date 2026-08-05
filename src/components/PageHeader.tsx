import { Container } from './Container'

/** Shared page masthead: eyebrow, title, optional standfirst. */
export function PageHeader({
  eyebrow,
  title,
  standfirst,
}: {
  eyebrow: string
  title: string
  standfirst?: string
}) {
  return (
    <Container className="border-b border-rule py-16 sm:py-20">
      <p className="u-label text-ink-45">{eyebrow}</p>
      <h1 className="mt-5 max-w-[20ch] text-h1">{title}</h1>
      {standfirst ? (
        <p className="mt-6 max-w-[58ch] text-ink-60">{standfirst}</p>
      ) : null}
    </Container>
  )
}
