/**
 * go.musawara.id: public mini apps.
 *
 * Pages are static (./public). The only dynamic route is the read-only attendee list, which this
 * Worker fetches from the WhatsApp gateway's public endpoint (names are already shortened there,
 * no phone numbers). It holds no secrets and no data of its own.
 *
 *   /api/event/hadir  ->  <gateway>/api/public/hadir, cached for 5 s at the edge
 *
 * The cache matters: every viewer polls, and the gateway rate-limits by client IP, which for this
 * Worker is always a Cloudflare address. One shared copy keeps the gateway's load at one request per 5 s.
 */
type Env = { ASSETS: { fetch(request: Request): Promise<Response> } }

const GATEWAY = 'https://wa-gateway.musawara.id'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/event/hadir') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } })
      try {
        const upstream = await fetch(`${GATEWAY}/api/public/hadir`, { cf: { cacheTtl: 5, cacheEverything: true } })
        if (!upstream.ok) throw new Error(String(upstream.status))
        return new Response(upstream.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
      } catch {
        return Response.json({ error: 'Data belum bisa dimuat' }, { status: 502, headers: { 'cache-control': 'no-store' } })
      }
    }
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'Not found' }, { status: 404 })
    return env.ASSETS.fetch(request)
  },
}
