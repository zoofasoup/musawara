import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[15px] font-bold tracking-tight text-ink">musawara</span>
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
      style={{ width: px, height: px, background: `color-mix(in oklab, ${color} 25%, transparent)`, color }}
      className="inline-flex items-center justify-center rounded-lg text-sm font-bold"
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
          { to: "/", label: "Overview" },
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
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <NavLink to={user?.role === "admin" ? "/" : `/c/${user?.client_id}`} className="shrink-0">
            <Wordmark />
          </NavLink>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/" || l.to === `/c/${user?.client_id}`}
                className={({ isActive }) =>
                  `rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${isActive ? "bg-surface2 text-ink" : "text-ink2 hover:text-ink"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              {user?.name}
              {client ? ` · ${client.name}` : ""}
            </span>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink"
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
