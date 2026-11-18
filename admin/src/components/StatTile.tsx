// A dashboard tile for one headline number: label and round icon on top, the number big, a footer line below.
// Used on the agency Overview and on each client's dashboard.

import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { Bento } from "./kit";
import { Skeleton } from "./ui";

export function StatTile({ label, icon, value, dense, loading, children }: { label: string; icon: IconName; value: string; dense?: boolean; loading?: boolean; children?: ReactNode }) {
  return (
    <Bento className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink2">{label}</p>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface2 text-ink2">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-5 min-w-0">
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p className={`tnum font-semibold leading-tight text-ink ${dense ? "text-base sm:text-xl" : "text-2xl sm:text-3xl"}`} title={value}>{value}</p>
        )}
        {!loading && children && <div className="mt-2 text-xs text-muted">{children}</div>}
      </div>
    </Bento>
  );
}
