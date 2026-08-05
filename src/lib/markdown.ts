import { marked } from 'marked'

/**
 * Renders markdown from the content tables to HTML.
 *
 * No sanitiser here on purpose. Every markdown field on this site is written
 * by an authenticated team member and is readable publicly only through an RLS
 * policy gated on is_published — there is no path by which visitor input
 * reaches this function. If that ever changes (public comments, client-authored
 * copy), add sanitisation at the same time.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  return marked.parse(source.trim(), { async: false, gfm: true, breaks: false })
}
