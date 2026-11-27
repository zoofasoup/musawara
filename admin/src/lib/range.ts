// The date range and comparison chosen on a client's pages. Kept for the browser tab, so Overview and Ads show the same period and a
// refresh does not reset it.
import { useEffect, useState } from "react";
import { compareRange, presetByKey, previousRange, shiftMonths, type CompareMode, type DateRange } from "./dates";

const KEY = "client-range";
type Saved = { range?: DateRange; mode?: CompareMode; custom?: DateRange };

function saved(): Saved {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function useSharedRange() {
  // a preset is recomputed, so "This month" still means this month tomorrow
  const [range, setRange] = useState<DateRange>(() => {
    const r = saved().range;
    return !r ? presetByKey("month") : r.key === "custom" ? r : presetByKey(r.key);
  });
  const [mode, setMode] = useState<CompareMode>(() => saved().mode ?? "prev");
  const [custom, setCustom] = useState<DateRange>(() => {
    const r = presetByKey("month");
    return saved().custom ?? { key: "custom", label: "Custom", from: shiftMonths(r.from, -1), to: shiftMonths(r.to, -1) };
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ range, mode, custom }));
    } catch {
      /* private window: the choice just does not survive a reload */
    }
  }, [range, mode, custom]);

  const cmp = compareRange(range, mode, mode === "custom" ? custom : null); // null for "previous period": the server's default
  const query = `from=${range.from}&to=${range.to}${cmp ? `&compFrom=${cmp.from}&compTo=${cmp.to}` : ""}`;
  const compare = mode === "off" ? null : cmp ?? previousRange(range.from, range.to);
  return { range, setRange, mode, setMode, custom, setCustom, cmp, query, compare, compareOn: mode !== "off" };
}

export type SharedRange = ReturnType<typeof useSharedRange>;
