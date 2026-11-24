// Message text with its web addresses made clickable. Plain React text nodes (never HTML), links open in a new tab.
import { splitLinks } from "../lib/linkify";

export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="text-musawara-ink underline underline-offset-2 hover:opacity-80">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}
