import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

const TABS = [
  { to: "/crm/inbox", label: "Inbox" },
  { to: "/crm/contacts", label: "Contacts" },
  { to: "/crm/templates", label: "Templates" },
  { to: "/crm/broadcasts", label: "Broadcasts" },
  { to: "/crm/connection", label: "WhatsApp" },
];

/** Shared frame for every CRM page: the section tabs, then the page. */
export function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <nav aria-label="CRM" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-[13px] font-medium ${isActive ? "bg-surface2 text-ink" : "text-ink2 hover:text-ink"}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
