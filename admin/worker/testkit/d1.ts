// Test-only D1 shim over node:sqlite so route tests run the real migrations and SQL.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

export function makeDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as any[])) as any) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) as any[] }),
    run: async () => {
      const r = db.prepare(sql).run(...(args as any[]));
      return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    _run: () => db.prepare(sql).run(...(args as any[])),
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: any[]) => list.map((s) => ({ meta: s._run() })),
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}
