// One button that flips the language. Shows the flag and code of the language you will get, plus the current one in the label for screen readers.
import { FLAG, type Lang } from "../lib/i18n";
import { Btn } from "./kit";
import { useLang } from "../context/LangContext";

export function LangSwitch({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { lang, setLang } = useLang();
  const next: Lang = lang === "en" ? "id" : "en";
  const f = FLAG[lang];
  return (
    <Btn
      tone="secondary"
      onClick={() => setLang(next)}
      aria-label={`Language: ${f.name}. Switch to ${FLAG[next].name} / Ganti ke ${FLAG[next].name}`}
      title={`${f.name} → ${FLAG[next].name}`}
      className={`px-3 text-xs font-semibold ${className}`}
    >
      <span key={lang} className="swap-in text-base leading-none" aria-hidden>{f.emoji}</span>
      {!compact && <span key={f.code} className="swap-in">{f.code}</span>}
    </Btn>
  );
}
