// The team's app frame: a grouped sidebar on desktop, a short tab bar with a "More" sheet on phones, and the
// client switcher that scopes every page. Clients get a different, simpler frame (see Layout).
import { useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useApi } from "../lib/api";
import { Icon, type IconName } from "./icons";
import { Wordmark } from "./Layout";
import { Avatar } from "./Avatar";
import { Sheet } from "./kit";
import { glassCls } from "../lib/glass";
import { useT } from "../context/LangContext";
import { LangSwitch } from "./LangSwitch";

type Item = { to: string; label: string; icon: IconName; end?: boolean };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { to: "/", label: "Overview", icon: "home", end: true },
      { to: "/clients", label: "Clients", icon: "building" },
      { to: "/approvals", label: "Approvals", icon: "checkCircle" },
      { to: "/planning", label: "Planning", icon: "clock" },
      { to: "/board", label: "Board", icon: "board" },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/spend", label: "Spend", icon: "spend" },
      { to: "/crm", label: "CRM", icon: "users" },
    ],
  },
];
const SETTINGS: Item = { to: "/settings", label: "Settings", icon: "sliders" };
/** The four destinations used all day get a phone tab; everything else is in the menu at the top right. */
const PHONE_TABS: Item[] = [GROUPS[0].items[0], GROUPS[0].items[1], GROUPS[0].items[2], GROUPS[1].items[1]];

const linkCls = (active: boolean) =>
  `flex min-h-11 items-center gap-2.5 rounded-full px-3 text-[13px] font-medium md:min-h-9 ${
    active ? "bg-white text-ink shadow-[var(--shadow-soft)]" : "text-ink2 hover:bg-white/60 hover:text-ink"
  }`;

/** Name of the current area, for the slim phone top bar. */
const PAGE_TITLE = (pathname: string) => {
  if (pathname.startsWith("/c/")) return "Clients";
  const hit = GROUPS.flatMap((g) => g.items).find((i) => (i.to === "/" ? pathname === "/" : pathname === i.to || pathname.startsWith(i.to + "/")));
  return hit?.label ?? (pathname.startsWith("/settings") ? "Settings" : pathname.startsWith("/profile") ? "Profile" : "");
};

function NavGroups({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const t = useT();
  return (
    <>
      {GROUPS.map((g) => (
        <div key={g.label}>
          {collapsed ? <div className="mx-2 mb-1.5 border-t border-border" /> : <p className="px-3 pb-1 text-xs font-medium text-muted">{t(g.label)}</p>}
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} onClick={onNavigate} title={collapsed ? t(i.label) : undefined} aria-label={collapsed ? t(i.label) : undefined} className={({ isActive }) => `${linkCls(isActive)} ${collapsed ? "justify-center px-0" : ""}`}>
                <Icon name={i.icon} className="h-4 w-4 shrink-0" />
                {!collapsed && t(i.label)}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/** "Work › Planning": where you are, in a pill above the page (tablet and up). */
function Crumb({ pathname }: { pathname: string }) {
  const t = useT();
  const hit = GROUPS.flatMap((g) => g.items.map((i) => ({ group: g.label, item: i }))).find(({ item }) => (item.to === "/" ? pathname === "/" : pathname === item.to || pathname.startsWith(item.to + "/")));
  const crumbs = pathname.startsWith("/c/") ? ["Work", "Clients"] : hit ? [hit.group, hit.item.label] : pathname.startsWith("/settings") ? ["Settings"] : pathname.startsWith("/profile") ? ["Account", "Profile"] : [];
  if (!crumbs.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden px-6 pt-4 md:block">
      <ol className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-4 py-1.5 text-xs text-muted shadow-[var(--shadow-soft)]">
        {crumbs.map((c, i) => (
          <li key={c} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">›</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-ink" : ""}>{t(c)}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  // moving between sections blurs the new page in; moving between one client's own tabs keeps the client frame still
  const sectionKey = /^\/c\/\d+/.exec(pathname)?.[0] ?? pathname.split("/").slice(0, 2).join("/");
  const clientRoute = /^\/c\/(\d+)(\/|$)/.exec(pathname);
  const clientMeta = useApi<{ client: { name: string } }>(clientRoute ? `/clients/${clientRoute[1]}/meta` : null);
  const title = clientRoute ? clientMeta.data?.client.name ?? "Client" : PAGE_TITLE(pathname);
  const [hover, setHover] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("ma_sidebar") === "1"; } catch { return false; }
  });
  const toggle = () =>
    setCollapsed((c) => {
      try { localStorage.setItem("ma_sidebar", c ? "0" : "1"); } catch { /* storage unavailable: the choice just won't persist */ }
      return !c;
    });

  // Collapsed sidebars open while the pointer (or keyboard focus) is on them, over the page, without moving it.
  const narrow = collapsed && !hover;
  const peek = collapsed && hover;
  const signOut = async () => {
    await logout();
    navigate("/login");
  };
  const onTab = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(to + "/") || (to === "/clients" && pathname.startsWith("/c/")));
  const activeIdx = PHONE_TABS.findIndex((tab) => onTab(tab.to)); // -1 (Planning, Board, Spend, Settings...) hides the pill; those live in the menu at the top right

  return (
    <div className={`min-h-screen transition-[padding] duration-200 md:py-3 md:pr-3 ${collapsed ? "md:pl-[5.5rem]" : "md:pl-[16.5rem]"}`}>
      {/* Desktop and tablet: sidebar */}
      <aside aria-label="Main" className={`fixed inset-y-3 left-3 z-20 hidden flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-3xl border border-white/70 py-4 shadow-[var(--shadow-soft)] backdrop-blur-xl transition-[width,background-color] ${peek ? "bg-white/95" : "bg-white/55"} duration-200 md:flex ${narrow ? "w-16 px-2" : "w-60 px-3"} ${peek ? "shadow-[0_12px_40px_rgba(20,24,36,0.18)]" : ""}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(false); }}
      >
        <div className={`flex items-center ${narrow ? "justify-center" : "justify-between"}`}>
          {!narrow && <NavLink to="/" className="inline-flex min-h-11 items-center px-1.5"><Wordmark /></NavLink>}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-surface2 hover:text-ink"
          >
            <Icon name="menu" className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-4">
          <NavGroups collapsed={narrow} />
        </nav>
        <div className="space-y-0.5 border-t border-border pt-3">
          <div className={narrow ? "flex justify-center pb-1" : "px-1 pb-1"}><LangSwitch compact={narrow} className={narrow ? "w-11" : "w-full"} /></div>
          <NavLink to={SETTINGS.to} title={narrow ? t(SETTINGS.label) : undefined} aria-label={narrow ? t(SETTINGS.label) : undefined} className={({ isActive }) => `${linkCls(isActive)} ${narrow ? "justify-center px-0" : ""}`}>
            <Icon name={SETTINGS.icon} className="h-4 w-4 shrink-0" />
            {!narrow && t(SETTINGS.label)}
          </NavLink>
          <NavLink
            to="/profile"
            title={narrow ? "Profile" : undefined}
            aria-label={narrow ? "Profile" : undefined}
            className={({ isActive }) => `${linkCls(isActive)} ${narrow ? "justify-center px-0" : ""}`}
          >
            <Avatar name={user?.name ?? ""} size={22} />
            {!narrow && <span className="min-w-0 truncate">{user?.name}</span>}
          </NavLink>
        </div>
      </aside>

      {/* Phone: slim top bar with the page name */}
      <header data-glass className={`sticky top-2 z-20 mx-3 mt-2 flex items-center gap-2 rounded-full py-1 pl-3 pr-1.5 md:hidden ${glassCls}`}>
        <NavLink to="/" aria-label={t("Overview")} className="inline-flex min-h-11 min-w-11 shrink-0 items-center"><Wordmark compact /></NavLink>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{t(title)}</span>
        <LangSwitch compact className="min-h-11 w-11 shrink-0 !rounded-full px-0" />
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          aria-label={t("Menu")}
          className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-white/70"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
      </header>

      <div className="md:min-h-[calc(100dvh-1.5rem)] md:rounded-3xl md:border md:border-white/70 md:bg-white/45 md:shadow-[var(--shadow-soft)]">
        <Crumb pathname={pathname} />
        <main className="mx-auto max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 md:px-6 md:pb-8 md:pt-4"><div key={sectionKey} className="swap-in">{children}</div></main>
      </div>

      {/* Phone: four daily tabs plus More */}
      <nav aria-label="Main" data-glass className={`fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-full p-1 md:hidden ${glassCls}`}>
        <div className="relative grid grid-cols-4">
          {/* one glass pill that glides to the active tab instead of each tab lighting up on its own */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/4 rounded-full bg-white/90 shadow-[0_2px_10px_rgba(20,24,36,0.12)] transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ transform: `translateX(${activeIdx * 100}%)`, opacity: activeIdx < 0 ? 0 : 1 }}
          />
          {PHONE_TABS.map((tab, i) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={`press relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors ${activeIdx === i ? "text-musawara-ink" : "text-ink2"}`}
            >
              <Icon name={tab.icon} className="h-5 w-5" />
              <span className="leading-none">{t(tab.label)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {more && (
        <Sheet title={t("Menu")} onClose={() => setMore(false)}>
          <nav aria-label="All sections" className="flex flex-col gap-4 pt-2">
            <NavGroups onNavigate={() => setMore(false)} />
            <div className="space-y-0.5 border-t border-border pt-3">
              <NavLink to={SETTINGS.to} onClick={() => setMore(false)} className={({ isActive }) => linkCls(isActive)}>
                <Icon name={SETTINGS.icon} className="h-4 w-4 shrink-0" />
                {t(SETTINGS.label)}
              </NavLink>
              <NavLink to="/profile" onClick={() => setMore(false)} className={({ isActive }) => linkCls(isActive)}>
                <Avatar name={user?.name ?? ""} size={22} />
                <span className="min-w-0 truncate">{t("Profile")} · {user?.name}</span>
              </NavLink>
              <div className="px-1 pb-1"><LangSwitch className="w-full" /></div>
              <button onClick={signOut} className={`${linkCls(false)} w-full`}>{t("Sign out")}</button>
            </div>
          </nav>
        </Sheet>
      )}
    </div>
  );
}
