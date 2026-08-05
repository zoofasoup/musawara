import { renderMarkdown } from '@/lib/markdown'

/** Renders a markdown field from the content tables. */
export function Prose({
  markdown,
  className = '',
}: {
  markdown: string | null | undefined
  className?: string
}) {
  const html = renderMarkdown(markdown)
  if (!html) return null
  return (
    <div
      className={`prose ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
