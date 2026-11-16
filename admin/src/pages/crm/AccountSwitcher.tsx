// Picks which WhatsApp number the CRM tabs work on. One number collapses to a quiet label.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/icons";
import { clientName, statusInfo, useAccounts, type Account } from "./accounts";
import { fmtPhone } from "./inbox/util";

function Dot({ status }: { status: string }) {
  const s = statusInfo(status);
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />;
}

function Label({ a, brand }: { a: Account; brand: string | null }) {
  return (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
      <span className="block truncate text-xs text-muted">
        {[brand, a.phone ? fmtPhone(a.phone) : null, statusInfo(a.status).short].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

export function AccountSwitcher() {
  const { accounts, clients, selectedId, select } = useAccounts();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = accounts.find((a) => a.id === selectedId) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!current) return null;
  const brand = (a: Account) => clientName(clients, a.client_id);

  if (accounts.length === 1) {
    return (
      <div className="flex min-h-11 items-center gap-2 px-1" aria-label="WhatsApp number">
        <Dot status={current.status} />
        <p className="min-w-0 truncate text-sm text-ink2">
          <span className="font-medium text-ink">{current.name}</span>
          {brand(current) ? ` · ${brand(current)}` : ""}
          <span className="text-muted">{` · ${statusInfo(current.status).short}`}</span>
        </p>
        <Link to="/crm/connection" className="ml-auto inline-flex min-h-11 items-center px-2 text-xs font-medium text-musawara-ink">
          Add number
        </Link>
      </div>
    );
  }

  return (
    <div ref={box} className="relative max-w-md">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-border2 bg-surface px-3 py-1.5 hover:bg-surface2"
      >
        <Dot status={current.status} />
        <Label a={current} brand={brand(current)} />
        <Icon name="sliders" className="h-4 w-4 shrink-0 text-muted" />
        <span className="sr-only">Change WhatsApp number</span>
      </button>
      {open && (
        <ul role="listbox" aria-label="WhatsApp numbers" className="absolute left-0 right-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
          {accounts.map((a) => (
            <li key={a.id} role="option" aria-selected={a.id === current.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (a.id !== current.id) select(a.id);
                }}
                className={`flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface2 ${a.id === current.id ? "bg-surface2" : ""}`}
              >
                <Dot status={a.status} />
                <Label a={a} brand={brand(a)} />
                {a.id === current.id && <Icon name="check" className="h-4 w-4 shrink-0 text-musawara-ink" />}
              </button>
            </li>
          ))}
          <li>
            <Link to="/crm/connection" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-musawara-ink hover:bg-surface2">
              Manage numbers
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}
