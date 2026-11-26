// Musawara — Worker entrypoint.
// Serves /api/* via Hono; static SPA assets are handled by the assets binding
// (run_worker_first is limited to /api/* in wrangler.jsonc).

import { Hono } from "hono";
import type { Env, Vars } from "./types";
export type { Env as AdminEnv } from "./types";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import clientRoutes from "./routes/clients";
import shareRoutes from "./routes/share";
import sheetSyncRoutes from "./routes/sheetSync";
import crmRoutes from "./routes/crm";
import pipelineRoutes from "./routes/pipeline";
import crmTaskRoutes from "./routes/crmTasks";
import crmAdRoutes from "./routes/crmAds";
import { syncAllInboxLeads } from "./lib/inboxLeads";
import reportRoutes from "./routes/report";
import approvalRoutes from "./routes/approvals";
import shopeeRoutes from "./routes/shopee";
import jubelioRoutes from "./routes/jubelio";
import { jubelioCfg, syncJubelio } from "./lib/jubelio";
import { shopeeCfg, syncAllShops } from "./lib/shopee";
import notionRoutes from "./routes/notion";
import { notionCfg, runNotionSync } from "./lib/notion";
import { syncAllAccounts } from "./lib/sync";
import { pollAllOrganic } from "./lib/organic";
import { healthReport, trackCron } from "./lib/health";
import { crmAllows, isCrmMode } from "../shared/mode";

export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use("*", async (c, next) => {
  if (isCrmMode(c.env.APP_MODE) && !crmAllows(c.req.method, c.req.path)) return c.json({ error: "Not found" }, 404);
  await next();
});

app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/share", shareRoutes);
app.route("/api/sheet-sync", sheetSyncRoutes);
app.route("/api/crm", crmRoutes);
app.route("/api/pipeline", pipelineRoutes);
app.route("/api/crm-tasks", crmTaskRoutes);
app.route("/api/crm-ads", crmAdRoutes);
app.route("/api/report", reportRoutes);
app.route("/api/approvals", approvalRoutes);
app.route("/api/shopee", shopeeRoutes);
app.route("/api/jubelio", jubelioRoutes);
app.route("/api/notion", notionRoutes);

// Public, no secrets. Plain: is the Worker up and the database answering. ?deep=1 also reports the last run of each
// scheduled job and answers 503 when one failed or went quiet, so an uptime monitor can watch the cron too.
app.get("/api/health", async (c) => {
  const h = await healthReport(c.env);
  if (c.req.query("deep") === "1") return c.json({ ...h, app: c.env.APP_NAME }, h.ok ? 200 : 503);
  return c.json({ ok: h.db, app: c.env.APP_NAME }, h.db ? 200 : 503);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  // one searchable line per failure in the Workers logs (observability is on); the path only, never the query string or body
  console.error(JSON.stringify({ event: "unhandled", method: c.req.method, route: c.req.routePath, error: err.name }));
  return c.json({ error: "Internal error" }, 500);
});

// Hourly: record new Instagram stories (they vanish after 24h), refresh post insights and
// re-pull the last 2 days of ads. At 03:00
// Asia/Jakarta (20:00 UTC) the ads pull is the full 28 days plus the entity tree,
// because Meta restates history (attribution windows).
export function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  if (isCrmMode(env.APP_MODE)) {
    ctx.waitUntil(trackCron(env, "inbox", () => syncAllInboxLeads(env)));
    return;
  }
  const deep = new Date(controller.scheduledTime).getUTCHours() === 20;
  ctx.waitUntil(trackCron(env, "organic", () => pollAllOrganic(env, deep)));
  ctx.waitUntil(trackCron(env, "ads", () => syncAllAccounts(env, !deep)));
  ctx.waitUntil(syncAllInboxLeads(env).catch((e) => console.error(JSON.stringify({ event: "inbox_leads_failed", error: String(e?.message ?? e).slice(0, 200) }))));
  const shopee = shopeeCfg(env);
  if (shopee) ctx.waitUntil(trackCron(env, "shopee", () => syncAllShops(env, shopee)));
  const jubelio = jubelioCfg(env);
  if (jubelio) ctx.waitUntil(trackCron(env, "jubelio", () => syncJubelio(env, jubelio)));
  if (notionCfg(env)) ctx.waitUntil(trackCron(env, "notion", () => runNotionSync(env)));
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
