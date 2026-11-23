// How each role looks: one colour and one icon, the same everywhere a role is shown (Team list, profile, invite).
import type { ReactNode } from "react";
import { CLIENT_LABEL, STAFF_LABEL, type ClientRole, type StaffRole } from "../../shared/permissions";
import { Icon, type IconName } from "../components/icons";
import { cn } from "./utils";

export type AnyRole = StaffRole | ClientRole;

export const ROLE_LOOK: Record<AnyRole, { icon: IconName; soft: string; dot: string; label: string }> = {
  owner: { icon: "shield", soft: "bg-chart-1/12 text-chart-1", dot: "bg-chart-1", label: STAFF_LABEL.owner },
  ads: { icon: "chart", soft: "bg-chart-4/12 text-chart-4", dot: "bg-chart-4", label: STAFF_LABEL.ads },
  content: { icon: "image", soft: "bg-chart-2/12 text-chart-2", dot: "bg-chart-2", label: STAFF_LABEL.content },
  crm: { icon: "users", soft: "bg-chart-3/12 text-chart-3", dot: "bg-chart-3", label: STAFF_LABEL.crm },
  approver: { icon: "checkCircle", soft: "bg-role-rose/12 text-role-rose", dot: "bg-role-rose", label: CLIENT_LABEL.approver },
  viewer: { icon: "eye", soft: "bg-surface3 text-ink2", dot: "bg-muted", label: CLIENT_LABEL.viewer },
};

/** A role as a coloured chip with its icon. `null` (no role yet) shows a quiet "No role" so the gap is visible. */
export function RolePill({ role, size = "default", children }: { role: AnyRole | null | undefined; size?: "sm" | "default"; children?: ReactNode }) {
  const look = role ? ROLE_LOOK[role] : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-xl font-semibold", size === "sm" ? "px-2.5 py-0.5 text-[11px]" : "min-h-7 px-3 py-1 text-xs", look?.soft ?? "bg-surface3 text-muted")}>
      <Icon name={look?.icon ?? "user"} className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {children ?? look?.label ?? "No role"}
    </span>
  );
}
