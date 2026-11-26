import { handleApply, type Env as ApplyEnv } from './apply'
import { app as adminApi, scheduled, type AdminEnv } from '../admin/worker'
import { apiResponse, serveApi } from '../admin/worker/lib/edge'

type Env = ApplyEnv & AdminEnv & { AUTH_LIMITER: RateLimit }

/**
 * One Worker for musawara.id.
 *
 *   /api/apply   careers form (this repo)
 *   /api/*       admin API (Hono app in admin/worker)
 *   /admin/*     admin SPA, built to out/admin and served from assets
 *   anything else is the static site
 *
 * wrangler.jsonc limits run_worker_first to /api/* and /admin/*, so ordinary
 * page requests never invoke this code.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    if (pathname === '/api/apply') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { allow: 'POST' },
        })
      }
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin) {
        return apiResponse(Response.json({ error: 'Forbidden origin' }, { status: 403 }))
      }
      return apiResponse(await handleApply(request, env, ctx))
    }

    if (pathname.startsWith('/api/')) return serveApi(request, env, ctx, adminApi)

    const res = await env.ASSETS.fetch(request)

    // Client-side routes under /admin (e.g. /admin/clients/3) have no file;
    // hand them the SPA shell. Paths with an extension are real missing assets.
    if (
      res.status === 404 &&
      pathname.startsWith('/admin/') &&
      !pathname.split('/').pop()!.includes('.')
    ) {
      return env.ASSETS.fetch(new Request(new URL('/admin/', url), request))
    }
    return res
  },

  scheduled,
} satisfies ExportedHandler<Env>
