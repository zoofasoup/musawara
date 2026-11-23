import { makeAuth } from "../worker/lib/betterAuth";
export default { fetch: (req: Request, env: any) => makeAuth(env, new URL(req.url).origin).handler(req) };
