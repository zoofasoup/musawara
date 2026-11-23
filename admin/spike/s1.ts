import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { twoFactor } from "better-auth/plugins";
import { DatabaseSync } from "node:sqlite";
import { makeDb } from "../worker/testkit/d1.ts";

const DB = makeDb();
const auth = betterAuth({
  baseURL: "http://localhost",
  secret: "spike-secret-spike-secret-spike-secret",
  database: DB as any,
  emailAndPassword: { enabled: true, disableSignUp: true },
  plugins: [twoFactor()],
  user: { modelName: "users" },
});
try {
  const m = await getMigrations(auth.options);
  console.log("toBeCreated", m.toBeCreated.map((t: any) => t.table), "toBeAdded", m.toBeAdded.map((t: any) => t.table + ":" + Object.keys(t.fields)));
  console.log((await m.compileMigrations()).slice(0, 3000));
} catch (e: any) {
  console.log("ERR", e?.message?.slice(0, 400));
}
