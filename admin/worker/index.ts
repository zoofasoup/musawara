// Musawara Ads Intelligence — Worker entrypoint.
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
import reportRoutes from "./routes/report";
import approvalRoutes from "./routes/approvals";
import shopeeRoutes from "./routes/shopee";
import { syncAllAccounts } from "./lib/sync";
import { pollAllOrganic } from "./lib/organic";

export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/share", shareRoutes);
app.route("/api/sheet-sync", sheetSyncRoutes);
app.route("/api/crm", crmRoutes);
app.route("/api/report", reportRoutes);
app.route("/api/approvals", approvalRoutes);
app.route("/api/shopee", shopeeRoutes);

app.get("/api/health", (c) => c.json({ ok: true, app: c.env.APP_NAME }));

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

// Hourly: record new Instagram stories (they vanish after 24h), refresh post insights and
// re-pull the last 2 days of ads. At 03:00
// Asia/Jakarta (20:00 UTC) the ads pull is the full 28 days plus the entity tree,
// because Meta restates history (attribution windows).
export function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  const deep = new Date(controller.scheduledTime).getUTCHours() === 20;
  ctx.waitUntil(pollAllOrganic(env, deep));
  ctx.waitUntil(syncAllAccounts(env, !deep));
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
