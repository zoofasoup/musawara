import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ASSET_BASE } from "../lib/api";
import { Icon, type IconName } from "./icons";
import { AdminShell } from "./AdminShell";
import { Avatar } from "./Avatar";
import { glassCls } from "../lib/glass";
import { useT } from "../context/LangContext";
import { LangSwitch } from "./LangSwitch";
import { CRM_ONLY, PRODUCT_NAME } from "../lib/product";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  if (CRM_ONLY) return <span className="whitespace-nowrap text-base font-bold text-ink">{PRODUCT_NAME}</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <img
        src={`${ASSET_BASE}/logo/${compact ? "musawara-mark" : "musawara-lockup"}.png`}
        alt="musawara"
        className="h-7 w-auto"
      />
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
  const t = useT();
  const { user, client, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const links: Array<{ to: string; label: string; short?: string; icon: IconName }> =
    user?.client_id
        ? [
            { to: `/c/${user.client_id}`, label: "Overview", icon: "chart" },
            { to: `/c/${user.client_id}/creatives`, label: "Creatives", icon: "image" },
            { to: `/c/${user.client_id}/alerts`, label: "Alerts", icon: "alert" },
            { to: `/c/${user.client_id}/report`, label: "Report", icon: "chart" },
            { to: `/c/${user.client_id}/approvals`, label: "Approvals", icon: "checkCircle" },
            { to: `/c/${user.client_id}/brand`, label: "Brand", icon: "building" },
          ]
        : [];
  const isEnd = (to: string) => to === `/c/${user?.client_id}`;
  const activeIdx = links.findIndex((l) => (isEnd(l.to) ? pathname === l.to : pathname === l.to || pathname.startsWith(l.to + "/")));

  if (user?.role === "admin") return <AdminShell>{children}</AdminShell>;

  return (
    <div className="min-h-screen">
      <header data-glass className={`sticky top-0 z-20 border-x-0 border-t-0 ${glassCls}`}>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:gap-4">
          <NavLink to={`/c/${user?.client_id}`} className="inline-flex min-h-11 min-w-11 shrink-0 items-center">
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
                {t(l.label)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LangSwitch compact className="!min-h-11 w-11 !rounded-full px-0" />
            <NavLink to="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-full px-1.5 text-xs text-muted hover:text-ink">
              <span aria-hidden="true"><Avatar name={user?.name ?? ""} size={28} /></span>
              <span className="hidden sm:inline">
                {user?.name}
                {client ? ` · ${client.name}` : ""}
              </span>
              <span className="sr-only">{t("Profile")}</span>
            </NavLink>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink"
            >
              {t("Sign out")}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:pb-6">{children}</main>

      {/* Phones: tab bar at the bottom, within thumb reach. */}
      <nav aria-label="Main" data-glass className={`fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-full p-1 sm:hidden ${glassCls}`}>
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white/90 shadow-[0_2px_10px_rgba(20,24,36,0.12)] transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ width: `${100 / links.length}%`, transform: `translateX(${activeIdx * 100}%)`, opacity: activeIdx < 0 ? 0 : 1 }}
          />
          {links.map((l, i) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={isEnd(l.to)}
              className={`press relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors ${activeIdx === i ? "text-musawara-ink" : "text-ink2"}`}
            >
              <Icon name={l.icon} className="h-5 w-5" />
              <span className="leading-none">{t(l.short ?? l.label)}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
