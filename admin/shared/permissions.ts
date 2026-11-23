// Who may do what. One module, imported by the Worker (to refuse) and by the app (to hide what you cannot use).
// Hiding is for comfort; the Worker is the lock: every route checks a feature here, and staff below Owner only reach assigned clients.
//
// users.role stays the AUDIENCE ("admin" = team, signs in at app.*; "client" = portal.*). The finer role sits beside it:
// staff_role for the team, client_role for client logins.

export const STAFF_ROLES = ["owner", "ads", "content", "crm"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const CLIENT_ROLES = ["viewer", "approver"] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

/** What a team member can be allowed to touch. Each is a family of pages and API routes. */
export const FEATURES = ["ads", "spend", "sales", "content", "approvals", "crm", "settings", "team"] as const;
export type Feature = (typeof FEATURES)[number];

export const STAFF_FEATURES: Record<StaffRole, readonly Feature[]> = {
  owner: FEATURES,
  ads: ["ads", "spend", "sales"],
  content: ["content", "approvals"],
  crm: ["crm", "sales"],
};

export const STAFF_LABEL: Record<StaffRole, string> = { owner: "Owner", ads: "Ads", content: "Content", crm: "CRM" };
export const STAFF_HINT: Record<StaffRole, string> = {
  owner: "Everything: settings, team, Meta token, every client.",
  ads: "Ads data, creatives, spend, sales, alerts and reports for assigned clients.",
  content: "Planning, board, approvals, assets, brand knowledge and organic for assigned clients.",
  crm: "WhatsApp inbox, contacts, broadcasts and sales upload.",
};
export const CLIENT_LABEL: Record<ClientRole, string> = { viewer: "Viewer", approver: "Approver" };
export const CLIENT_HINT: Record<ClientRole, string> = {
  viewer: "Sees the dashboard, creatives, report and brand. Cannot decide approvals.",
  approver: "Everything a viewer sees, and approves or requests changes.",
};

export const isStaffRole = (v: unknown): v is StaffRole => typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
export const isClientRole = (v: unknown): v is ClientRole => typeof v === "string" && (CLIENT_ROLES as readonly string[]).includes(v);

/** Missing or unknown role means no access at all: a mistake must lock a door, never open one. */
export function staffCan(role: StaffRole | null | undefined, feature: Feature): boolean {
  return isStaffRole(role) && STAFF_FEATURES[role].includes(feature);
}

/** Where a team member lands after signing in: the first area their role has. */
export function homePathFor(role: StaffRole | null | undefined): string {
  if (staffCan(role, "ads")) return "/";
  if (staffCan(role, "content")) return "/planning";
  if (staffCan(role, "crm")) return "/crm";
  return "/profile";
}

/** Which feature a page path needs (team area). null = any signed-in team member. */
export function featureForPath(path: string): Feature | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return "ads";
  if (/^\/(spend)(\/|$)/.test(p)) return "spend";
  if (/^\/(crm)(\/|$)/.test(p)) return "crm";
  if (/^\/(planning|board)(\/|$)/.test(p)) return "content";
  if (/^\/approvals(\/|$)/.test(p)) return "approvals";
  if (/^\/settings(\/|$)/.test(p)) return "settings";
  if (/^\/(shopee|conversions)(\/|$)/.test(p)) return "sales";
  return null;
}

/** The client sub-pages (/c/:id/<tab>) and the feature each needs. */
export const CLIENT_TAB_FEATURE: Record<string, Feature | null> = {
  "": "ads", creatives: "ads", alerts: "ads", report: "ads", sales: "sales", shopee: "sales", organic: "content",
  approvals: "approvals", assets: "content", brand: null, onboarding: "settings",
};
