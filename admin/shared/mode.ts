// One code base, two products. APP_MODE=crm is the CRM sold to other businesses: only these routes exist there.
export const isCrmMode = (v: unknown): boolean => v === "crm";

const OPEN: RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/(crm|pipeline|crm-tasks|crm-ads)(\/|$)/,
  /^\/api\/admin\/(users|invites)(\/|$)/,
];

/** An allowlist, so a route added to the platform later stays closed in CRM mode until someone opens it here. */
export function crmAllows(method: string, path: string): boolean {
  if (path === "/api/admin/clients") return method === "GET" || method === "HEAD";
  return OPEN.some((r) => r.test(path));
}
