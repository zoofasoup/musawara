// Date range and "compare to", the same on every client page that shows numbers over time.
import { NativeSelect } from "@/components/ui/native-select";
import type { CompareMode } from "../lib/dates";
import { fmtDayFull } from "../lib/format";
import type { SharedRange } from "../lib/range";
import { DateRangePicker } from "./DateRangePicker";

export function RangeBar({ value }: { value: SharedRange }) {
  const { range, setRange, mode, setMode, custom, setCustom, compare } = value;
  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end md:gap-x-3 md:gap-y-1.5">
      <DateRangePicker value={range} onChange={setRange} />
      <label className="flex items-center justify-between gap-2 text-xs text-muted md:justify-start md:gap-1.5">
        Compare
        <NativeSelect size="sm" value={mode} onChange={(e) => setMode(e.target.value as CompareMode)} aria-label="Compare to" className="flex-1 md:flex-none">
          <option value="prev">Previous period</option>
          <option value="month">Previous month</option>
          <option value="year">Previous year</option>
          <option value="custom">Custom range…</option>
          <option value="off">Off</option>
        </NativeSelect>
      </label>
      {mode === "custom" && <DateRangePicker value={custom} onChange={setCustom} />}
      {compare && (
        <span className="tnum w-full text-xs text-muted md:text-right">
          vs {fmtDayFull(compare.from)} – {fmtDayFull(compare.to)}
        </span>
      )}
    </div>
  );
}
