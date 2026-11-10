// Saving sales to the dashboard. Shared by the manual upload (/sales/import) and the
// Google Sheet sync, so both obey the same rules: a known sale is updated (price
// corrections, new contact info) but never reset to "not sent", and a sale that was
// edited or deleted by hand is left alone.

import type { Env } from "../types";

export const HEX64 = /^[a-f0-9]{64}$/;
export const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const PAY_STATUS = ["dp", "paid", "cancelled"];

/** Today in Jakarta (YYYY-MM-DD). */
export const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

/** Why a row cannot be saved, or null when it is fine. */
export function validateSale(r: any, today: string): string | null {
  return !HEX64.test(r?.sale_key ?? "") ? "bad sale_key"
    : !YMD.test(r?.sale_date ?? "") || r.sale_date < "2020-01-01" || r.sale_date > today ? "bad sale_date"
    : !(typeof r.value === "number" && isFinite(r.value) && r.value > 0 && r.value < 1e11) ? "bad value"
    : r.group_key != null && !HEX64.test(r.group_key) ? "bad group_key"
    : r.departure_date != null && (!YMD.test(r.departure_date) || r.departure_date < "2020-01-01" || r.departure_date > "2040-12-31") ? "bad departure_date"
    : r.down_payment != null && !(typeof r.down_payment === "number" && isFinite(r.down_payment) && r.down_payment >= 0 && r.down_payment < 1e11) ? "bad down_payment"
    : r.pay_status != null && !PAY_STATUS.includes(r.pay_status) ? "bad pay_status"
    : null;
}

const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** Save already-validated rows (any number; written in batches). */
export async function saveSales(env: Env, clientId: number, rows: any[]): Promise<{ inserted: number; updated: number }> {
  let updated = 0;
  for (let i = 0; i < rows.length; i += 90) {
    const part = rows.slice(i, i + 90);
    const known = new Set<string>();
    const res = await env.DB.prepare(`SELECT sale_key FROM sales WHERE client_id=? AND sale_key IN (${part.map(() => "?").join(",")})`)
      .bind(clientId, ...part.map((r) => r.sale_key))
      .all<{ sale_key: string }>();
    res.results.forEach((r) => known.add(r.sale_key));
    await env.DB.batch(
      part.map((r) =>
        env.DB.prepare(
          `INSERT INTO sales (client_id, sale_key, sale_date, value, label, source, consultant, group_key, has_contact,
                              departure_date, package_name, room_type, down_payment, pay_status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(client_id, sale_key) DO UPDATE SET
             sale_date=excluded.sale_date, value=excluded.value, label=COALESCE(excluded.label, sales.label),
             source=COALESCE(excluded.source, sales.source), consultant=COALESCE(excluded.consultant, sales.consultant),
             group_key=COALESCE(excluded.group_key, sales.group_key),
             has_contact=MAX(sales.has_contact, excluded.has_contact),
             departure_date=COALESCE(excluded.departure_date, sales.departure_date),
             package_name=COALESCE(excluded.package_name, sales.package_name),
             room_type=COALESCE(excluded.room_type, sales.room_type),
             down_payment=COALESCE(excluded.down_payment, sales.down_payment),
             pay_status=COALESCE(excluded.pay_status, sales.pay_status), updated_at=datetime('now')
           WHERE sales.edited_at IS NULL AND sales.deleted_at IS NULL`
        ).bind(clientId, r.sale_key, r.sale_date, r.value, str(r.label, 40), str(r.source, 80), str(r.consultant, 60), r.group_key ?? null, r.has_contact ? 1 : 0,
               r.departure_date ?? null, str(r.package_name, 80), str(r.room_type, 30), r.down_payment ?? null, r.pay_status ?? null)
      )
    );
    updated += part.filter((r) => known.has(r.sale_key)).length;
  }
  return { inserted: rows.length - updated, updated };
}
