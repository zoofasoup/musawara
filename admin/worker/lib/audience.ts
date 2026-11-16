// Which audience a hostname serves. app.* is the team's tool, portal.* is the clients' view.
// Every other host (musawara.id, workers.dev, localhost, tests) stays open to both so existing
// links and local development keep working; the SPA moves people off musawara.id on its own.

export const TEAM_HOST = "app.musawara.id";
export const CLIENT_HOST = "portal.musawara.id";

export type Role = "admin" | "client";

/** The audience a host is reserved for, or null when it serves everyone. */
export function hostAudience(host: string): Role | null {
  const h = host.toLowerCase().split(":")[0];
  if (h === TEAM_HOST) return "admin";
  if (h === CLIENT_HOST) return "client";
  return null;
}

/** Where an account with this role signs in. */
export function homeHostFor(role: Role): string {
  return role === "admin" ? TEAM_HOST : CLIENT_HOST;
}

/** True when this role may use a session on this host. */
export function roleAllowedOnHost(role: Role, host: string): boolean {
  const reserved = hostAudience(host);
  return reserved === null || reserved === role;
}
