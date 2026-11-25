// The bar that stays at the bottom of every broadcast step: how many people it is for, what is blocking, Back and the one primary action.
import type { ReactNode } from "react";
import { Btn } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";

export function StepBar({ count, unit = "people", detail, note, onBack, primary }: { count: number; unit?: string; detail?: string; note?: ReactNode; onBack?: () => void; primary: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-2 rounded-2xl bg-surface/95 p-3 shadow-[0_-8px_24px_-12px_rgba(20,24,36,0.22)] backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40" aria-live="polite">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-ink tnum">{fmtNum(count)}</span>
            <span className="text-sm text-ink2">{count === 1 && unit === "people" ? "person" : unit}</span>
          </p>
          {note ? <p className="text-xs text-warn">{note}</p> : detail ? <p className="hidden truncate text-xs text-muted md:block">{detail}</p> : null}
        </div>
        {onBack && <Btn onClick={onBack}>Back</Btn>}
        {primary}
      </div>
    </div>
  );
}
