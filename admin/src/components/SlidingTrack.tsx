// A recessed track whose chosen option is shown by ONE raised tile that glides to it, instead of each option lighting up on its
// own. Children are the options; the active one carries aria-current="page", aria-checked="true" or data-active="true".
// Used by Segmented and PillNav so every "pick one" control moves the same way.

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACTIVE = '[aria-current="page"],[aria-checked="true"],[data-active="true"]';

export function SlidingTrack({ children, className, style, role, ...aria }: { children: ReactNode; className?: string; style?: React.CSSProperties; role?: string; "aria-label"?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [placed, setPlaced] = useState(false);

  const measure = useCallback(() => {
    const r = root.current;
    const el = r?.querySelector<HTMLElement>(ACTIVE);
    if (!r || !el) return setBox(null);
    setBox((b) => (b && b.x === el.offsetLeft && b.y === el.offsetTop && b.w === el.offsetWidth && b.h === el.offsetHeight ? b : { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  }, []);

  // after every render: the active option may have changed
  useLayoutEffect(() => {
    measure();
    const r = root.current;
    if (!r) return;
    const ro = new ResizeObserver(measure);
    ro.observe(r);
    r.querySelectorAll(":scope > *").forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  });
  // the first placement must not animate in from the corner
  useLayoutEffect(() => {
    if (!box || placed) return;
    const id = window.setTimeout(() => setPlaced(true), 60); // a timer, not rAF: rAF stops in background tabs
    return () => window.clearTimeout(id);
  }, [box, placed]);

  return (
    <div ref={root} role={role} {...aria} className={cn("relative", className)} style={style}>
      <span
        aria-hidden
        className={cn("pointer-events-none absolute left-0 top-0 rounded-xl bg-surface shadow-[var(--shadow-soft)]", placed && "transition-[transform,width,height,opacity] duration-[420ms] ease-[var(--ease-spring)]")}
        style={box ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, opacity: 1 } : { opacity: 0, width: 0, height: 0 }}
      />
      {children}
    </div>
  );
}
