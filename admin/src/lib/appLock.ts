// Screens that behave like an app (the CRM): the page itself does not scroll and cannot be pinched or double-tapped bigger.
// What can be locked: the viewport meta, iOS pinch gestures, trackpad / ctrl+wheel zoom, page overscroll. What cannot: the
// browser's own zoom shortcuts (Cmd/Ctrl +/-) and some browsers' accessibility zoom, which is theirs to keep.
import { useEffect } from "react";

export function useAppLock() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const before = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    document.documentElement.classList.add("app-locked");
    const stop = (e: Event) => e.preventDefault();
    const wheel = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    window.addEventListener("wheel", wheel, { passive: false });
    return () => {
      if (meta && before !== null) meta.setAttribute("content", before);
      document.documentElement.classList.remove("app-locked");
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      window.removeEventListener("wheel", wheel);
    };
  }, []);
}
