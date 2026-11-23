import { marked } from 'marked'
import sanitizeHtml from 'sanitize-html'

export function renderMarkdown(source: string | null | undefined): string {
  if (!source) return ''
  const html = marked.parse(source.trim(), { async: false, gfm: true, breaks: false })
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'del'],
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  })
}
