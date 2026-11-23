// Test-only D1 shim over node:sqlite so route tests run the real migrations and SQL.
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

/** A D1-shaped wrapper over an open SQLite database. Like D1, a batch is one transaction: all of it or none of it. */
export function wrapDb(db: DatabaseSync): D1Database {
  const exec = (sql: string, args: unknown[]) => {
    const q = db.prepare(sql);
    if (q.columns().length === 0) {
      const r = q.run(...(args as any[]));
      return { success: true, results: [] as any[], meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    }
    return { success: true, results: q.all(...(args as any[])) as any[], meta: { last_row_id: 0, changes: 0 } };
  };
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as any[])) as any) ?? null,
    all: async () => exec(sql, args),
    run: async () => {
      const r = db.prepare(sql).run(...(args as any[]));
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    },
    _run: () => exec(sql, args),
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: any[]) => {
      db.exec("BEGIN");
      try {
        const out = list.map((s) => s._run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}

export function makeDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, dir), "utf8"));
  return wrapDb(db);
}
