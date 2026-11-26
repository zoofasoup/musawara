// What every public entry does before a request reaches the API: same-origin writes only, a limit on sign-in attempts,
// and headers that keep answers private. Shared by the platform Worker and the CRM-only Worker.
type EdgeEnv = { AUTH_LIMITER?: RateLimit };
type Api<E> = { fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response> };

export function apiResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, headers });
}

export async function serveApi<E extends EdgeEnv>(request: Request, env: E, ctx: ExecutionContext, api: Api<E>): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin && origin !== url.origin) {
    return apiResponse(Response.json({ error: "Forbidden origin" }, { status: 403 }));
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/auth/") && url.pathname !== "/api/auth/logout") {
    if (!env.AUTH_LIMITER) return apiResponse(Response.json({ error: "Authentication unavailable" }, { status: 503 }));
    const { success } = await env.AUTH_LIMITER.limit({ key: request.headers.get("CF-Connecting-IP") ?? "unknown" });
    if (!success) return apiResponse(Response.json({ error: "Try again in one minute" }, { status: 429, headers: { "Retry-After": "60" } }));
  }
  return apiResponse(await api.fetch(request, env, ctx));
}
