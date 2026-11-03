// Musawara Ads Intelligence — Worker entrypoint.
// Serves /api/* via Hono; static SPA assets are handled by the assets binding
// (run_worker_first is limited to /api/* in wrangler.jsonc).

import { Hono } from "hono";
import type { Env, Vars } from "./types";
import authRoutes from "./routes/auth";
import adminRoutes from "./routes/admin";
import clientRoutes from "./routes/clients";
import shareRoutes from "./routes/share";
import { syncAllAccounts } from "./lib/sync";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

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

export default {
  fetch: app.fetch,
  // Nightly at 03:00 Asia/Jakarta (20:00 UTC) — re-pulls 28 days for every
  // active account because Meta restates history (attribution windows).
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncAllAccounts(env));
  },
} satisfies ExportedHandler<Env>;
