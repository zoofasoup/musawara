import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BASE } from "../lib/api";
import { Icon, type IconName } from "./icons";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <img
        src={`${BASE}/logo/${compact ? "musawara-mark" : "musawara-lockup"}.png`}
        alt="musawara"
        className="h-7 w-auto"
      />
      {!compact && <span className="text-xs font-medium uppercase tracking-widest text-musawara">ads intelligence</span>}
    </span>
  );
}

export function ClientAvatar({ name, logoUrl, color, size = 8 }: { name: string; logoUrl?: string | null; color: string; size?: number }) {
  const px = size * 4;
  if (logoUrl) {
    return <img src={logoUrl} alt={name} style={{ width: px, height: px }} className="rounded-lg object-cover" />;
  }
  return (
    <span
      style={{ width: px, height: px, background: `color-mix(in oklab, ${color} 25%, transparent)` }}
      className="inline-flex items-center justify-center rounded-lg text-sm font-bold text-ink"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, client, logout } = useAuth();
  const navigate = useNavigate();

  const links: Array<{ to: string; label: string; short?: string; icon: IconName }> =
    user?.role === "admin"
      ? [
          { to: "/", label: "Overview", short: "Home", icon: "home" },
          { to: "/board", label: "Board", icon: "board" },
          { to: "/spend", label: "Spend", icon: "spend" },
          { to: "/conversions", label: "Sales", icon: "tag" },
          { to: "/organic", label: "Organic", icon: "image" },
          { to: "/crm", label: "CRM", icon: "users" },
          { to: "/settings", label: "Settings", icon: "sliders" },
        ]
      : user?.client_id
        ? [
            { to: `/c/${user.client_id}`, label: "Dashboard", icon: "chart" },
            { to: `/c/${user.client_id}/creatives`, label: "Creatives", icon: "image" },
            { to: `/c/${user.client_id}/report`, label: "Report", icon: "chart" },
            { to: `/c/${user.client_id}/brand`, label: "Brand", icon: "building" },
          ]
        : [];
  const isEnd = (to: string) => to === "/" || to === `/c/${user?.client_id}`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:gap-4">
          <NavLink to={user?.role === "admin" ? "/" : `/c/${user?.client_id}`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center">
            <span className="sm:hidden"><Wordmark compact /></span><span className="hidden sm:inline"><Wordmark /></span>
          </NavLink>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={isEnd(l.to)}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium ${isActive ? "bg-surface2 text-ink" : "text-ink2 hover:text-ink"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              {user?.name}
              {client ? ` · ${client.name}` : ""}
            </span>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:pb-6">{children}</main>

      {/* Phones: tab bar at the bottom, within thumb reach. */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={isEnd(l.to)}
              className={({ isActive }) => `press flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? "text-musawara-ink" : "text-ink2"}`}
            >
              <Icon name={l.icon} className="h-5 w-5" />
              <span className="leading-none">{l.short ?? l.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
