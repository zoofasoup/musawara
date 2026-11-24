// Shared by the CRM data routes (pipeline, tasks): the picked WhatsApp number must be one the caller may use, and who may own a lead.
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env, Vars } from "../types";
import { accountsOf, gatewayAccounts, mayUseAccount } from "./waAccounts";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

export const acct = (c: Ctx) => Number(c.req.query("account"));

/** ?account=<gateway number id> is required and must be a number the caller may use (Owners: any; others: linked to their clients). */
export const crmAccount = createMiddleware<{ Bindings: Env; Variables: Vars }>(async (c, next) => {
  const id = acct(c);
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Pick a WhatsApp number first" }, 400);
  const ok = await mayUseAccount(c.env, c.get("user"), id);
  if (ok === "gateway") return c.json({ error: "WhatsApp gateway is unreachable", code: "gateway_down" }, 502);
  if (ok === "forbidden") return c.json({ error: "Forbidden" }, 403);
  await next();
});

/** Team members who can own a lead or a task on this number: Owners, and CRM members assigned to the number's brand. */
export async function eligibleOwners(c: Ctx): Promise<Array<{ id: number; name: string }>> {
  let clientId: number | null = null;
  const base = c.env.WA_GATEWAY_URL?.replace(/\/$/, "");
  if (base && c.env.WA_GATEWAY_TOKEN) {
    try {
      const hit = (await gatewayAccounts(base, c.env.WA_GATEWAY_TOKEN)).find((a) => a.id === acct(c));
      clientId = hit?.client_id == null ? null : Number(hit.client_id);
    } catch { /* owners only */ }
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, name FROM users WHERE role='admin' AND (staff_role='owner' OR (staff_role='crm' AND id IN (SELECT user_id FROM user_clients WHERE client_id=?))) ORDER BY name`
  ).bind(clientId ?? -1).all<{ id: number; name: string }>();
  return results;
}

export { accountsOf };
