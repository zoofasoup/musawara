// The team's app frame: a grouped sidebar on desktop, a short tab bar with a "More" sheet on phones, and the
// client switcher that scopes every page. Clients get a different, simpler frame (see Layout).
import { NativeSelect } from "@/components/ui/native-select";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useClientScope } from "../context/ClientScope";
import { Icon, type IconName } from "./icons";
import { Wordmark } from "./Layout";
import { Sheet } from "./kit";

type Item = { to: string; label: string; icon: IconName; end?: boolean };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { to: "/", label: "Overview", icon: "home", end: true },
      { to: "/approvals", label: "Approvals", icon: "checkCircle" },
      { to: "/planning", label: "Planning", icon: "clock" },
      { to: "/board", label: "Board", icon: "board" },
    ],
  },
  {
    label: "Performance",
    items: [
      { to: "/spend", label: "Spend", icon: "spend" },
      { to: "/conversions", label: "Sales", icon: "tag" },
      { to: "/shopee", label: "Shopee", icon: "chart" },
      { to: "/organic", label: "Organic", icon: "camera" },
    ],
  },
  {
    label: "Clients",
    items: [
      { to: "/assets", label: "Assets", icon: "image" },
      { to: "/crm", label: "CRM", icon: "users" },
    ],
  },
];
const SETTINGS: Item = { to: "/settings", label: "Settings", icon: "sliders" };
/** The four destinations used all day get a phone tab; everything else lives behind More. */
const PHONE_TABS: Item[] = [GROUPS[0].items[0], GROUPS[0].items[1], GROUPS[0].items[2], GROUPS[2].items[1]];

const linkCls = (active: boolean) =>
  `flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium md:min-h-9 ${
    active ? "bg-surface2 text-ink" : "text-ink2 hover:bg-surface2/60 hover:text-ink"
  }`;

function ClientSwitcher({ className = "" }: { className?: string }) {
  const { clients, clientId, setClientId } = useClientScope();
  return (
    <label className={`block ${className}`}>
      <span className="sr-only">Client</span>
      <NativeSelect
        value={clientId ?? ""}
        onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
        className="w-full"
      >
        <option value="">All clients</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </NativeSelect>
    </label>
  );
}

function NavGroups({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {GROUPS.map((g) => (
        <div key={g.label}>
          <p className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted">{g.label}</p>
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate} className={({ isActive }) => linkCls(isActive)}>
                <Icon name={i.icon} className="h-4 w-4 shrink-0" />
                {i.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { setClientId } = useClientScope();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);

  // Opening a client's own page (for example /c/3/approvals) makes that client the chosen one.
  useEffect(() => {
    const m = /^\/c\/(\d+)(\/|$)/.exec(pathname);
    if (m) setClientId(Number(m[1]));
  }, [pathname, setClientId]);

  const signOut = async () => {
    await logout();
    navigate("/login");
  };
  const onTab = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/"));
  const moreActive = !PHONE_TABS.some((t) => onTab(t.to));

  return (
    <div className="min-h-screen md:pl-60">
      {/* Desktop and tablet: sidebar */}
      <aside aria-label="Main" className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-4 overflow-y-auto border-r border-border bg-surface px-3 py-4 md:flex">
        <NavLink to="/" className="inline-flex min-h-11 items-center px-1.5"><Wordmark tagline={false} /></NavLink>
        <ClientSwitcher />
        <nav className="flex flex-1 flex-col gap-4">
          <NavGroups />
        </nav>
        <div className="space-y-0.5 border-t border-border pt-3">
          <NavLink to={SETTINGS.to} className={({ isActive }) => linkCls(isActive)}>
            <Icon name={SETTINGS.icon} className="h-4 w-4 shrink-0" />
            {SETTINGS.label}
          </NavLink>
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2">
            <span className="min-w-0 truncate text-xs text-muted" title={user?.email}>{user?.name}</span>
            <button onClick={signOut} className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink">Sign out</button>
          </div>
        </div>
      </aside>

      {/* Phone: slim top bar with the client switcher */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur md:hidden">
        <NavLink to="/" aria-label="Overview" className="inline-flex min-h-11 min-w-11 shrink-0 items-center"><Wordmark compact /></NavLink>
        <ClientSwitcher className="min-w-0 flex-1" />
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 md:px-6 md:pb-8">{children}</main>

      {/* Phone: four daily tabs plus More */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {PHONE_TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? "text-musawara-ink" : "text-ink2"}`}
            >
              <Icon name={t.icon} className="h-5 w-5" />
              <span className="leading-none">{t.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
            className={`press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${moreActive ? "text-musawara-ink" : "text-ink2"}`}
          >
            <Icon name="menu" className="h-5 w-5" />
            <span className="leading-none">More</span>
          </button>
        </div>
      </nav>

      {more && (
        <Sheet title="Menu" onClose={() => setMore(false)}>
          <nav aria-label="All sections" className="flex flex-col gap-4 pt-2">
            <NavGroups onNavigate={() => setMore(false)} />
            <div className="space-y-0.5 border-t border-border pt-3">
              <NavLink to={SETTINGS.to} onClick={() => setMore(false)} className={({ isActive }) => linkCls(isActive)}>
                <Icon name={SETTINGS.icon} className="h-4 w-4 shrink-0" />
                {SETTINGS.label}
              </NavLink>
              <button onClick={signOut} className={`${linkCls(false)} w-full`}>Sign out</button>
            </div>
          </nav>
        </Sheet>
      )}
    </div>
  );
}
