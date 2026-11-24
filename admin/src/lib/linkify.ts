// Finds web addresses in plain message text. Only http(s) and www. addresses become links, so a message can never carry a
// javascript: or data: link; trailing punctuation that belongs to the sentence ("see https://x.id/a.") stays outside the link.

export type TextPart = { text: string; href?: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    // a closing bracket belongs to the link only when the link opened one (wikipedia-style addresses)
    let trim = url.match(TRAILING)?.[0] ?? "";
    if (trim.startsWith(")") && url.includes("(") && (url.match(/\(/g)?.length ?? 0) > (url.match(/\)/g)?.length ?? 0) - trim.length + 0) trim = trim.slice(1);
    url = url.slice(0, url.length - trim.length);
    if (!/^(?:https?:\/\/|www\.)[^./\s]+\./i.test(url)) continue; // "https://" with nothing real after it
    const start = m.index!;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: /^www\./i.test(url) ? `https://${url}` : url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}
