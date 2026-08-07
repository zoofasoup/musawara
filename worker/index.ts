import { handleApply, type Env as ApplyEnv } from './apply'

type Env = ApplyEnv & {
  ASSETS: Fetcher
}

/**
 * Assets Worker for musawara.id.
 *
 * wrangler.jsonc limits run_worker_first to /api/*, so ordinary page requests
 * are served straight from the static export without invoking this at all.
 * Anything that does reach here and is not a known endpoint is handed back to
 * the asset server.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/api/apply') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { allow: 'POST' },
        })
      }
      return handleApply(request, env)
    }

    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
