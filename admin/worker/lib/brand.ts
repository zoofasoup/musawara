// Brand knowledge: the fixed section list and the prompt-ready markdown export.
// The API returns SECTIONS so the UI never duplicates labels or hints.

export type BrandSection = { key: string; label: string; hint: string };

export const SECTIONS: BrandSection[] = [
  { key: "overview", label: "Overview", hint: "Who the brand is, what it does, the story in a few lines." },
  { key: "audience", label: "Audience", hint: "Who buys, what they worry about, where they spend time." },
  { key: "positioning", label: "Positioning", hint: "Why this brand over the alternatives. The one promise." },
  { key: "voice", label: "Voice and tone", hint: "How the brand sounds. Formal or casual, how to address people." },
  { key: "vocabulary", label: "Words to use and avoid", hint: "Preferred terms, banned words, spelling rules." },
  { key: "visual", label: "Visual identity", hint: "Colors with hex, fonts, logo rules, photo style." },
  { key: "products", label: "Products and offers", hint: "What is sold, prices, current promos." },
  { key: "pillars", label: "Content pillars", hint: "The recurring themes content should come from." },
  { key: "rules", label: "Rules and compliance", hint: "Claims that are not allowed, legal lines, approval steps." },
  { key: "competitors", label: "Competitors", hint: "Who they compete with and how the brand differs." },
];

export const SECTION_KEYS = new Set(SECTIONS.map((s) => s.key));
export const SECTION_COUNT = SECTIONS.length;

/** One markdown document with only the filled sections, ready to paste into an AI prompt. */
export function brandMarkdown(
  clientName: string,
  bodies: Record<string, string>,
  links: { label: string; url: string }[]
): string {
  const parts = [`# Brand knowledge: ${clientName}`];
  for (const s of SECTIONS) {
    const body = (bodies[s.key] ?? "").trim();
    if (body) parts.push(`## ${s.label}\n\n${body}`);
  }
  if (links.length) parts.push(`## References\n\n${links.map((l) => `- [${l.label}](${l.url})`).join("\n")}`);
  return parts.join("\n\n") + "\n";
}
