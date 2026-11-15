/**
 * app.musawara.id and portal.musawara.id.
 *
 * Both hosts show the same SPA that musawara.id serves under /admin, mounted at the
 * root of the host. This Worker holds no data and no secrets: it hands every request
 * to the main Worker (service binding MAIN), so there is one API, one database and
 * one set of secrets.
 *
 *   /api/*    the API, unchanged (the session cookie is scoped to this host)
 *   /admin/*  the built files (the SPA is built with base "/admin/")
 *   the rest  client-side routes: return the SPA shell
 */
type Env = { MAIN: { fetch(request: Request): Promise<Response> } }

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) {
      return env.MAIN.fetch(request)
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return Promise.resolve(new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } }))
    }
    return env.MAIN.fetch(new Request(new URL('/admin/', url), { method: request.method, headers: request.headers }))
  },
}
