import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { BASE } from "../lib/api";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <img
        src={`${BASE}/logo/${compact ? "musawara-mark" : "musawara-lockup"}.png`}
        alt="musawara"
        className="h-7 w-auto"
      />
      {!compact && <span className="text-[11px] font-medium uppercase tracking-widest text-musawara">ads intelligence</span>}
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

  const links =
    user?.role === "admin"
      ? [
          { to: "/", label: "Overview", short: "Home" },
          { to: "/board", label: "Board" },
          { to: "/spend", label: "Spend" },
          { to: "/conversions", label: "Conversions", short: "Sales" },
          { to: "/settings", label: "Settings" },
        ]
      : user?.client_id
        ? [
            { to: `/c/${user.client_id}`, label: "Dashboard" },
            { to: `/c/${user.client_id}/creatives`, label: "Creatives" },
            { to: `/c/${user.client_id}/brand`, label: "Brand" },
          ]
        : [];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:gap-4">
          <NavLink to={user?.role === "admin" ? "/" : `/c/${user?.client_id}`} className="inline-flex min-h-11 shrink-0 items-center">
            <span className="sm:hidden"><Wordmark compact /></span><span className="hidden sm:inline"><Wordmark /></span>
          </NavLink>
          <nav className="flex items-center sm:gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/" || l.to === `/c/${user?.client_id}`}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-1.5 text-[13px] sm:px-2.5 font-medium ${isActive ? "bg-surface2 text-ink" : "text-ink2 hover:text-ink"}`
                }
              >
                {l.short ? (
                  <>
                    <span className="sm:hidden">{l.short}</span>
                    <span className="hidden sm:inline">{l.label}</span>
                  </>
                ) : (
                  l.label
                )}
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
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-border bg-surface px-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink sm:px-2.5"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
