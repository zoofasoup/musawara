// The Worker of a CRM-only copy (APP_MODE=crm): the same API behind the same hardening, plus the CRM build as static files.
import { app, scheduled, type AdminEnv } from "./index";
import { serveApi } from "./lib/edge";
import { isCrmMode } from "../shared/mode";

type Env = AdminEnv & { AUTH_LIMITER?: RateLimit };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // This entry exists only for the CRM copy. A mistyped APP_MODE would otherwise open the whole platform API.
    if (!isCrmMode(env.APP_MODE)) return new Response("Misconfigured", { status: 503 });
    if (new URL(request.url).pathname.startsWith("/api/")) return serveApi(request, env, ctx, app);
    return env.ASSETS.fetch(request);
  },
  scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (!isCrmMode(env.APP_MODE)) {
      console.error(JSON.stringify({ event: "misconfigured", error: "APP_MODE must be crm; scheduled run skipped" }));
      return;
    }
    scheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
