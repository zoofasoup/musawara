// Role decisions the screens make, kept pure so they can be tested. The Worker stays the lock.
import { homePathFor, staffCan, type StaffRole } from "../../shared/permissions";

type Who = { role: "admin" | "client"; client_id: number | null; staff_role: StaffRole | null };

/** Where to send someone whose role may not open a page. The CRM copy has only the CRM, settings and the profile, so an
 * account without the CRM (a leftover ads, content or client account) goes to the profile instead of bouncing forever. */
export function deniedPath(user: Who | null, crmOnly: boolean): string {
  if (!user) return "/login";
  if (crmOnly) return user.role === "admin" && staffCan(user.staff_role, "crm") ? "/crm" : "/profile";
  if (user.role === "client") return `/c/${user.client_id}`;
  return homePathFor(user.staff_role);
}

/** The role the "Edit access" form starts on. The CRM copy offers Owner and CRM only. */
export function editStartRole(stored: StaffRole | null, crmOnly: boolean): StaffRole {
  if (crmOnly) return stored === "owner" ? "owner" : "crm";
  return stored ?? "ads";
}
