// Picks which WhatsApp number the CRM tabs work on: the brand's logo, the number's name and a status dot. It sits at the right of the
// section tabs. One number is shown as a quiet label; several open a menu.
import { Check, ChevronsUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ClientAvatar } from "../../components/Layout";
import { useCan } from "../../lib/can";
import { CRM_ONLY } from "../../lib/product";
import { clientName, statusInfo, useAccounts, type Account, type Client } from "./accounts";
import { fmtPhone } from "./inbox/util";

/** The brand's logo (or its initial in the brand colour) with the number's connection status as a dot on its corner. */
function Logo({ a, clients }: { a: Account; clients: Client[] }) {
  const brand = CRM_ONLY || a.client_id == null ? undefined : clients.find((c) => c.id === Number(a.client_id));
  return (
    <span className="relative inline-flex shrink-0">
      <ClientAvatar name={brand?.name ?? a.name} logoUrl={brand?.logo_url} color={brand?.brand_color ?? "var(--accent)"} size={8} />
      <span aria-hidden className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-surface ${statusInfo(a.status).dot}`} />
    </span>
  );
}

function Text({ a, clients, sub = true }: { a: Account; clients: Client[]; sub?: boolean }) {
  const brand = CRM_ONLY ? null : clientName(clients, a.client_id);
  return (
    <span className="min-w-0 text-left">
      <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
      {sub && <span className="block truncate text-xs text-muted">{[brand, a.phone ? fmtPhone(a.phone) : null, statusInfo(a.status).short].filter(Boolean).join(" · ")}</span>}
    </span>
  );
}

export function AccountSwitcher() {
  const { accounts, clients, selectedId, select } = useAccounts();
  const owner = useCan()("settings");
  const current = accounts.find((a) => a.id === selectedId) ?? accounts[0];
  if (!current) return null;

  if (accounts.length === 1) {
    return (
      <div className="flex min-h-11 max-w-xs items-center gap-2.5 rounded-2xl bg-surface px-2.5 py-1 shadow-[var(--shadow-soft)]" aria-label="WhatsApp number" title={statusInfo(current.status).label}>
        <Logo a={current} clients={clients} />
        <Text a={current} clients={clients} />
        {owner && <Link to="/crm/connection" className="ml-1 shrink-0 text-xs font-medium text-musawara-ink hover:underline">Add</Link>}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Change WhatsApp number" className="flex min-h-11 w-full max-w-xs items-center gap-2.5 rounded-2xl bg-surface px-2.5 py-1 text-left shadow-[var(--shadow-soft)] hover:bg-surface2">
        <Logo a={current} clients={clients} />
        <Text a={current} clients={clients} />
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {accounts.map((a) => (
          <DropdownMenuItem key={a.id} onClick={() => a.id !== current.id && select(a.id)} className="gap-2.5 py-2">
            <Logo a={a} clients={clients} />
            <Text a={a} clients={clients} />
            {a.id === current.id && <Check className="ml-auto h-4 w-4 shrink-0 text-musawara-ink" />}
          </DropdownMenuItem>
        ))}
        {owner && (
          <DropdownMenuItem render={<Link to="/crm/connection" />} className="text-xs font-medium text-musawara-ink">Manage numbers</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
