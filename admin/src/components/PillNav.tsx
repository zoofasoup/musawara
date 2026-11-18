// The site's tab bar: a pill track (glass on phones) with the active tab as a white pill. Used for the client menu and the CRM sections.
import type { ReactNode } from "react";
import { glassCls } from "../lib/glass";

export const pillTabCls = (on: boolean) =>
  `press inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium lg:min-h-9 ${on ? "bg-surface text-ink shadow-sm" : "text-ink2 hover:text-ink"}`;

/** Scrolls sideways when the tabs are wider than the screen; sticks under the phone top bar while the page scrolls. */
export function PillNav({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <nav aria-label={label} className={`sticky top-[4.25rem] z-10 -mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:static md:top-auto md:mx-0 md:px-0 md:py-0 md:pb-1 ${className}`}>
      <div data-glass className={`inline-flex min-w-max gap-0.5 rounded-full p-0.5 ${glassCls} md:border-0 md:bg-surface3 md:shadow-none md:backdrop-blur-none`}>
        {children}
      </div>
    </nav>
  );
}
