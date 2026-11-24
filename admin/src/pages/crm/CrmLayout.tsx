import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { setAccountId, useAccountId } from "./crmApi";
import { AccountsContext, type Account, type Client } from "./accounts";
import { AccountSwitcher } from "./AccountSwitcher";
import { GatewayNotice } from "./inbox/GatewayNotice";
import { useLive } from "./inbox/util";
import { useApi } from "../../lib/api";
import { Empty } from "../../components/kit";
import { PillNav, pillTabCls } from "../../components/PillNav";
import { Skeleton } from "../../components/ui";
import { Link } from "react-router-dom";
import { useCan } from "../../lib/can";
import { useAppLock } from "../../lib/appLock";

const TABS = [
  { to: "/crm/inbox", label: "Inbox" },
  { to: "/crm/pipeline", label: "Pipeline" },
  { to: "/crm/contacts", label: "Contacts" },
  { to: "/crm/templates", label: "Templates" },
  { to: "/crm/broadcasts", label: "Broadcasts" },
  { to: "/crm/connection", label: "Numbers" },
];

/** Shared frame for every CRM page: the number switcher, the section tabs, then the page. */
export function CrmLayout({ children }: { children: ReactNode }) {
  useAppLock();
  const stored = useAccountId();
  const owner = useCan()("settings"); // adding, linking and unlinking numbers is Owner work; everyone else only sees the numbers of their own clients
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const list = useLive<Account[]>("/accounts", 15000);
  const clients = useApi<{ clients: Client[] }>("/admin/clients"); // brand names; optional, the switcher works without them
  const accounts = list.data ?? [];

  // The remembered number may have been deleted: fall back to the gateway default.
  const valid = stored !== null && accounts.some((a) => a.id === stored);
  const fallback = (accounts.find((a) => a.is_default) ?? accounts[0])?.id ?? null;
  const selectedId = valid ? stored : fallback;
  useEffect(() => {
    if (list.data && list.data.length && !valid && fallback !== null) setAccountId(fallback);
  }, [list.data, valid, fallback]);

  const select = useCallback(
    (id: number) => {
      setAccountId(id);
      if (params.has("c")) {
        const next = new URLSearchParams(params);
        next.delete("c"); // the open conversation belongs to the previous number
        setParams(next, { replace: true });
      }
    },
    [params, setParams]
  );

  const ctx = useMemo(
    () => ({ accounts, clients: clients.data?.clients ?? [], reload: () => void list.reload(), selectedId, select }),
    [accounts, clients.data, list.reload, selectedId, select]
  );

  const onNumbers = pathname.startsWith("/crm/connection");
  let body: ReactNode;
  if (!list.loaded) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (!list.data) {
    // Accounts could not be listed (gateway down or not set up): the page shows its own notice.
    body = onNumbers ? <GatewayNotice error={list.error} onRetry={list.reload} /> : children;
  } else if (accounts.length === 0 && !onNumbers) {
    body = (
      <Empty
        icon="users"
        title="No WhatsApp number yet"
        hint={owner ? "Add a number and scan its QR code before using the inbox, contacts or broadcasts." : "None of your clients has a WhatsApp number yet. Ask an Owner to link one."}
        action={
          !owner ? undefined : <Link to="/crm/connection" className="inline-flex min-h-11 items-center rounded-lg bg-musawara px-4 text-xs font-medium text-white">
            Add a number
          </Link>
        }
      />
    );
  } else if (!valid && accounts.length) {
    body = <Skeleton className="h-64 w-full" />; // one render while the selection is corrected
  } else {
    // Keyed by account: switching remounts the page, so nothing from the other number lingers.
    body = <div key={selectedId ?? "none"} className="h-full">{children}</div>;
  }

  return (
    <AccountsContext.Provider value={ctx}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {list.data && accounts.length > 0 && <div className="shrink-0"><AccountSwitcher /></div>}
        <PillNav label="CRM" className="shrink-0">
          {TABS.filter((t) => owner || t.to !== "/crm/connection").map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => pillTabCls(isActive)}>
              {t.label}
            </NavLink>
          ))}
        </PillNav>
        {/* only this area scrolls (long lists); the inbox fills it and scrolls inside its own panes */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
      </div>
    </AccountsContext.Provider>
  );
}
