// The Worker of a CRM-only copy (APP_MODE=crm): the same API behind the same hardening, plus the CRM build as static files.
import { app, scheduled, type AdminEnv } from "./index";
import { serveApi } from "./lib/edge";

type Env = AdminEnv & { AUTH_LIMITER?: RateLimit };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) return serveApi(request, env, ctx, app);
    return env.ASSETS.fetch(request);
  },
  scheduled,
} satisfies ExportedHandler<Env>;
