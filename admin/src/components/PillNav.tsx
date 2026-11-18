// The site's route tabs: the same recessed track and gliding tile as Segmented, so every "pick one" control looks and moves alike.
// Glass on phones (it floats under the top bar). Used for the client menu and the CRM sections.
import type { ReactNode } from "react";
import { glassCls } from "../lib/glass";
import { SlidingTrack } from "./SlidingTrack";

/** Class for one tab. The gliding tile draws the chosen background, so a tab only changes its text. */
export const pillTabCls = (on: boolean) =>
  `press relative z-10 inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-medium md:min-h-9 ${on ? "text-ink" : "text-ink2 hover:text-ink"}`;

/** Scrolls sideways when the tabs are wider than the screen; sticks under the phone top bar while the page scrolls. */
export function PillNav({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <nav aria-label={label} className={`sticky top-[4.25rem] z-10 -mx-3 -my-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:static md:top-auto ${className}`}>
      <SlidingTrack className={`inline-flex min-w-max gap-1 rounded-2xl p-1 ${glassCls} md:border-0 md:bg-surface3 md:shadow-none md:backdrop-blur-none`} {...{ "data-glass": "" }}>
        {children}
      </SlidingTrack>
    </nav>
  );
}
