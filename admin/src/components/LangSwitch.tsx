// Show the current language and describe what pressing the button changes. `compact` (collapsed sidebar, phone header, login) shows the flag only.
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
      aria-label={`${f.code} · ${lang === "id" ? "Ganti ke" : "Switch to"} ${FLAG[next].name}`}
      title={`${f.name} → ${FLAG[next].name}`}
      className={`${compact ? "px-1.5" : "px-3"} text-xs font-semibold ${className}`}
    >
      <span key={lang} className="swap-in text-base leading-none" aria-hidden>{f.emoji}</span>
      {!compact && <span key={f.code} className="swap-in">{f.code}</span>}
    </Btn>
  );
}
