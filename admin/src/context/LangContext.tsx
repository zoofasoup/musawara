// The chosen language, remembered in this browser. `useT()` gives the translate function; `<T>text</T>` translates plain JSX text.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { initialLang, translate, type Lang } from "../lib/i18n";

const KEY = "ma_lang";
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (text: string) => string };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return initialLang(localStorage.getItem(KEY), navigator.language); } catch { return "en"; }
  });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* the choice lasts for this visit only */ }
  }, []);
  const t = useCallback((text: string) => translate(lang, text), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
export const useT = () => useContext(LangCtx).t;
/** Translate plain text in JSX: <T>Sign in</T>. Anything that is not a string is shown as it is. */
export function T({ children }: { children: ReactNode }) {
  const t = useT();
  return <>{typeof children === "string" ? t(children) : children}</>;
}
