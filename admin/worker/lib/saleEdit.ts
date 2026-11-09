// Rules for editing a saved sale by hand.
//   - A sale not yet sent to Meta ("dashboard") can change in every field.
//   - A sale already sent keeps its date and value (those are what Meta holds); the rest, including
//     cancelling it, stays editable. Cancelled sales stop counting on the dashboard.
//   - Only a sale not yet sent can be deleted.

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const PAY_STATUSES = ["dp", "paid", "cancelled"] as const;

export type SaleState = { meta_state: string };
export type EditResult = { ok: true; set: Record<string, string | number | null> } | { ok: false; error: string };

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export function planEdit(sale: SaleState, patch: Record<string, unknown>, today: string): EditResult {
  const sent = sale.meta_state === "sent";
  const set: Record<string, string | number | null> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);

  if (has("sale_date") || has("value")) {
    if (sent) return { ok: false, error: "This sale was sent to Meta, so its date and value are locked. Mark it cancelled instead." };
    if (has("sale_date")) {
      const d = patch.sale_date;
      if (typeof d !== "string" || !YMD.test(d) || d < "2020-01-01" || d > today) return { ok: false, error: "Date must be a past date (YYYY-MM-DD)" };
      set.sale_date = d;
    }
    if (has("value")) {
      const v = patch.value;
      if (!(typeof v === "number" && isFinite(v) && v > 0 && v < 1e11)) return { ok: false, error: "Value must be a positive number" };
      set.value = v;
    }
  }
  if (has("departure_date")) {
    const d = patch.departure_date;
    if (d !== null && !(typeof d === "string" && YMD.test(d) && d >= "2020-01-01" && d <= "2040-12-31")) return { ok: false, error: "Departure must be a date (YYYY-MM-DD) or empty" };
    set.departure_date = d as string | null;
  }
  if (has("down_payment")) {
    const v = patch.down_payment;
    if (v !== null && !(typeof v === "number" && isFinite(v) && v >= 0 && v < 1e11)) return { ok: false, error: "DP must be zero or more, or empty" };
    set.down_payment = v as number | null;
  }
  if (has("pay_status")) {
    const s = patch.pay_status;
    if (s !== null && !PAY_STATUSES.includes(s as (typeof PAY_STATUSES)[number])) return { ok: false, error: "Status must be dp, paid, cancelled or empty" };
    set.pay_status = s as string | null;
  }
  if (has("label")) set.label = text(patch.label, 40);
  if (has("consultant")) set.consultant = text(patch.consultant, 60);
  if (has("source")) set.source = text(patch.source, 80);
  if (has("package_name")) set.package_name = text(patch.package_name, 80);
  if (has("room_type")) set.room_type = text(patch.room_type, 30);

  if (Object.keys(set).length === 0) return { ok: false, error: "Nothing to change" };
  return { ok: true, set };
}

export function canDelete(sale: SaleState): { ok: true } | { ok: false; error: string } {
  return sale.meta_state === "sent"
    ? { ok: false, error: "This sale was sent to Meta and cannot be deleted. Mark it cancelled instead." }
    : { ok: true };
}
