// Jubelio orders for one brand: the monthly report and "sync now". Needs the sales feature and access to that client.
import { Hono, type Context } from "hono";
import type { Env, Vars } from "../types";
import { canReachClient, requirePerm } from "../middleware";
import { jubelioCfg, JubelioError, monthlyReport, syncJubelio } from "../lib/jubelio";

const jubelio = new Hono<{ Bindings: Env; Variables: Vars }>();
jubelio.use("*", requirePerm("sales"));

/** The client asked for, when it is a real id the caller may see; otherwise null. */
function reachable(c: Context<{ Bindings: Env; Variables: Vars }>, raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && canReachClient(c.get("user"), id) ? id : null;
}

jubelio.get("/status", (c) => {
  const id = reachable(c, c.req.query("client_id"));
  if (!id) return c.json({ error: "Forbidden" }, 403);
  return c.json({ connected: jubelioCfg(c.env)?.clientId === id });
});

jubelio.get("/report", async (c) => {
  const id = reachable(c, c.req.query("client_id"));
  if (!id) return c.json({ error: "Forbidden" }, 403);
  return c.json({ connected: jubelioCfg(c.env)?.clientId === id, ...(await monthlyReport(c.env.DB, id)) });
});

jubelio.post("/sync", async (c) => {
  const body: any = await c.req.json().catch(() => ({}));
  const id = reachable(c, body?.client_id);
  if (!id) return c.json({ error: "Forbidden" }, 403);
  const cfg = jubelioCfg(c.env);
  if (!cfg || cfg.clientId !== id) return c.json({ error: "Jubelio is not connected for this client.", code: "jubelio_unconfigured" }, 503);
  try {
    return c.json({ ok: true, ...(await syncJubelio(c.env, cfg)) });
  } catch (e) {
    if (e instanceof JubelioError) return c.json({ error: e.message }, 502);
    throw e;
  }
});

export default jubelio;
