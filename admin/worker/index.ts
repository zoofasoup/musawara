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
import { syncAllAccounts } from "./lib/sync";
import { pollAllOrganic } from "./lib/organic";

export const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.route("/api/auth", authRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/clients", clientRoutes);
app.route("/api/share", shareRoutes);

app.get("/api/health", (c) => c.json({ ok: true, app: c.env.APP_NAME }));

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

// Hourly: record new Instagram stories (they vanish after 24h) and refresh post insights. At 03:00
// Asia/Jakarta (20:00 UTC) also re-pull 28 days of ads for every active account,
// because Meta restates history (attribution windows).
export function scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
  const deep = new Date(controller.scheduledTime).getUTCHours() === 20;
  ctx.waitUntil(pollAllOrganic(env, deep));
  if (deep) ctx.waitUntil(syncAllAccounts(env));
}

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Env>;
