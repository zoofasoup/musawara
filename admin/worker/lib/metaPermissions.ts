// The Meta token was created for reading ads. Publishing needs more permissions; this
// lists what is missing so the admin can regenerate the token before anything is scheduled.
// Pure on purpose (no Worker imports) so node can test it; the Graph call lives in publishSetup.ts.

export const REQUIRED_PUBLISH_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const;

export function missingPermissions(rows: { permission: string; status: string }[]): string[] {
  const granted = new Set(rows.filter((r) => r.status === "granted").map((r) => r.permission));
  return REQUIRED_PUBLISH_PERMISSIONS.filter((p) => !granted.has(p));
}
