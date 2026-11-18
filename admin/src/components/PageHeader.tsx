// One header for every team page: title, one line of context, and the page's main actions on the right.
import type { ReactNode } from "react";
import { useT } from "../context/LangContext";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  const t = useT();
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-ink">{t(title)}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink2">{typeof subtitle === "string" ? t(subtitle) : subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
