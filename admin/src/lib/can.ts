// What the signed-in person may open. The same map the Worker enforces (shared/permissions.ts), used here only to
// hide what would be refused anyway; the server stays the real gate.
import { staffCan, type Feature } from "../../shared/permissions";
import { useAuth, type User } from "../context/AuthContext";

export const userCan = (user: User | null, feature: Feature) => !!user && user.role === "admin" && staffCan(user.staff_role, feature);

/** `can("ads")`: is this a team member whose role includes the feature? Client logins are never "can" (their pages are decided by their own role). */
export function useCan() {
  const { user } = useAuth();
  return (feature: Feature) => userCan(user, feature);
}
