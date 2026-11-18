// Shopee sales dashboard, per client. Team only. Shows sales totals, daily revenue and top products
// from orders synced out of Shopee. No buyer information is stored or shown (see worker/lib/shopee.ts).

import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../components/Controls";
import { useSearchParams } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { addDays, todayJakarta } from "../lib/dates";
import { fmtDay, fmtNum, fmtRp } from "../lib/format";
import { CardSkeleton, ErrorState } from "../components/ui";
import { DataTable } from "../components/DataTable";
import { Btn, ConfirmBtn, Empty, Nested, Panel, Pill, useNotify, type Tone } from "../components/kit";
import { PageHeader } from "../components/PageHeader";
import { NeedsClient } from "../components/NeedsClient";
import { useClientScope } from "../context/ClientScope";

type Status = {
  configured: boolean;
  connected: boolean;
  shop: { shop_id: number; synced_to: number; last_sync_at: string | null; last_error: string | null; refresh_expires_at: number } | null;
};
type Summary = {
  totals: { orders: number; units: number; revenue: number; avg_order: number };
  daily: { day: string; orders: number; revenue: number; units: number }[];
  top_products: { item_id: number; name: string; units: number; revenue: number }[];
  statuses: { status: string; orders: number }[];
};

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "month", label: "This month" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const CALLBACK_NOTES: Record<string, { text: string; kind: "ok" | "err" }> = {
  connected: { text: "Shopee shop connected. Run a sync to pull orders.", kind: "ok" },
  failed: { text: "Shopee did not accept the authorisation. Try again.", kind: "err" },
  expired: { text: "That authorisation link expired. Start again from this page.", kind: "err" },
  invalid: { text: "The authorisation response was incomplete. Start again.", kind: "err" },
  unconfigured: { text: "Shopee is not configured on the server yet.", kind: "err" },
};

const STATUS_TONE: Record<string, Tone> = { COMPLETED: "good", SHIPPED: "accent", READY_TO_SHIP: "accent", PROCESSED: "accent", CANCELLED: "crit", IN_CANCEL: "warn", UNPAID: "warn" };
const statusLabel = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function rangeDates(key: RangeKey): [string, string] {
  const today = todayJakarta();
  if (key === "month") return [today.slice(0, 8) + "01", today];
  return [addDays(today, -(Number(key) - 1)), today];
}

/** Every day in [from, to], with zero for days that had no sales. */
function fillDays(from: string, to: string, daily: Summary["daily"]) {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const out: { day: string; orders: number; revenue: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, orders: byDay.get(d)?.orders ?? 0, revenue: byDay.get(d)?.revenue ?? 0 });
  return out;
}

const fmtSynced = (utc: string | null) =>
  utc ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utc.replace(" ", "T") + "Z")) + " WIB" : "never";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-ink tabular-nums sm:text-xl">{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink2">{note}</p>}
    </div>
  );
}

export function Shopee() {
  const { notify, node } = useNotify();
  const [params, setParams] = useSearchParams();
  const { clientId: scopeId } = useClientScope();
  const clientId: number | "" = scopeId ?? "";
  const [range, setRange] = useState<RangeKey>("30");
  const [busy, setBusy] = useState<"sync" | "connect" | null>(null);

  // Landing back from Shopee: show the outcome once, then clean the address.
  useEffect(() => {
    const r = params.get("shopee");
    if (!r) return;
    const note = CALLBACK_NOTES[r];
    if (note) notify(note.text, note.kind);
    params.delete("shopee");
    setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [from, to] = useMemo(() => rangeDates(range), [range]);
  const status = useApi<Status>(clientId === "" ? null : `/shopee/status?client_id=${clientId}`);
  const connected = status.data?.connected === true;
  const summary = useApi<Summary>(clientId !== "" && connected ? `/shopee/summary?client_id=${clientId}&from=${from}&to=${to}` : null);

  const connect = async () => {
    setBusy("connect");
    try {
      const { url } = await api<{ url: string }>("/shopee/auth-url", { method: "POST", body: { client_id: clientId } });
      window.location.assign(url);
    } catch (e: any) {
      notify(e.message, "err");
      setBusy(null);
    }
  };

  // One call pulls at most 15 days, so repeat until the sync position reaches now.
  const syncNow = async () => {
    setBusy("sync");
    try {
      let total = 0;
      for (let i = 0; i < 12; i++) {
        const r = await api<{ orders: number; caught_up: boolean }>("/shopee/sync", { method: "POST", body: { client_id: clientId } });
        total += r.orders;
        if (r.caught_up) break;
      }
      notify(`Synced ${fmtNum(total)} order${total === 1 ? "" : "s"}.`);
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(null);
      status.reload();
      summary.reload();
    }
  };

  const disconnect = async () => {
    try {
      await api(`/shopee/connection?client_id=${clientId}`, { method: "DELETE" });
      notify("Shop disconnected and its orders deleted.");
      status.reload();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const s = summary.data;
  const days = s ? fillDays(from, to, s.daily) : [];
  const maxRev = Math.max(1, ...days.map((d) => d.revenue));
  const reauthSoon = status.data?.shop && status.data.shop.refresh_expires_at - Date.now() / 1000 < 5 * 24 * 3600;

  return (
    <div className="max-w-7xl">
      {node}
      <PageHeader title="Shopee" subtitle="Sales from the client's Shopee shop. Buyer details are never stored. Days are Asia/Jakarta." />

      <div className="space-y-4">
        {clientId === "" ? (
          <NeedsClient what="Shopee" />
        ) : status.loading ? (
          <CardSkeleton lines={2} />
        ) : status.error ? (
          <ErrorState message={status.error} onRetry={status.reload} />
        ) : !status.data?.configured ? (
          <Empty icon="info" title="Shopee is not set up on the server yet" hint="Once the Shopee Open Platform app is approved, add its Partner ID and Partner Key as Worker secrets. This page then lets you connect the shop." />
        ) : !connected ? (
          <Empty
            icon="link"
            title="No Shopee shop connected"
            hint="The shop owner approves read-only access on Shopee, then comes back here. Sign in to Shopee with the seller account first."
            action={<Btn tone="primary" icon="link" loading={busy === "connect"} onClick={connect}>Connect Shopee shop</Btn>}
          />
        ) : (
          <>
            <Panel className="flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-[14rem] flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  Shop {status.data.shop!.shop_id}
                  {status.data.shop!.last_error ? <Pill tone="crit" icon="alert">Sync failing</Pill> : <Pill tone="good" icon="checkCircle">Connected</Pill>}
                  {reauthSoon && <Pill tone="warn" icon="clock">Reconnect soon</Pill>}
                </p>
                <p className="mt-0.5 text-xs text-muted">Last sync {fmtSynced(status.data.shop!.last_sync_at)}</p>
                {status.data.shop!.last_error && <p className="mt-1 break-words text-xs text-crit">{status.data.shop!.last_error}</p>}
              </div>
              {(status.data.shop!.last_error || reauthSoon) && <Btn tone="secondary" icon="link" loading={busy === "connect"} onClick={connect}>Reconnect</Btn>}
              <Btn tone="primary" icon="refresh" loading={busy === "sync"} onClick={syncNow}>Sync now</Btn>
              <ConfirmBtn label="Disconnect" confirmLabel="Delete orders and disconnect" onConfirm={disconnect} />
            </Panel>

            <Segmented label="Date range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.key, label: r.label }))} />

            {summary.loading ? (
              <CardSkeleton lines={4} />
            ) : summary.error ? (
              <ErrorState message={summary.error} onRetry={summary.reload} />
            ) : s && s.totals.orders === 0 && s.statuses.length === 0 ? (
              <Empty icon="chart" title="No orders in this range" hint="Run Sync now to pull the latest orders, or pick a longer range." action={<Btn tone="secondary" icon="refresh" loading={busy === "sync"} onClick={syncNow}>Sync now</Btn>} />
            ) : s ? (
              <>
                <Nested title="Key numbers">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
                    <Tile label="Revenue" value={fmtRp(s.totals.revenue)} />
                    <Tile label="Orders" value={fmtNum(s.totals.orders)} note="Excludes unpaid and cancelled" />
                    <Tile label="Units sold" value={fmtNum(s.totals.units)} />
                    <Tile label="Average order" value={fmtRp(s.totals.avg_order)} />
                  </div>
                </Nested>

                <Nested title="Revenue per day">
                  <div className="flex h-40 items-end gap-0.5" role="img" aria-label={`Daily revenue, highest ${fmtRp(maxRev)}`}>
                    {days.map((d) => (
                      <div key={d.day} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${fmtDay(d.day)}: ${fmtRp(d.revenue)}, ${d.orders} order${d.orders === 1 ? "" : "s"}`}>
                        <div className="w-full rounded-t-sm bg-[color-mix(in_srgb,var(--accent)_45%,white)] group-hover:bg-[var(--accent)]" style={{ height: `${d.revenue > 0 ? Math.max(3, (d.revenue / maxRev) * 100) : 0}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted">
                    <span>{fmtDay(days[0].day)}</span>
                    <span>Peak {fmtRp(maxRev)}</span>
                    <span>{fmtDay(days[days.length - 1].day)}</span>
                  </div>
                </Nested>

                <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                  <Nested title="Top products">
                    {s.top_products.length === 0 ? (
                      <p className="p-3 text-sm text-muted">No sales in this range.</p>
                    ) : (
                      <DataTable
                        rows={s.top_products}
                        getKey={(p) => p.item_id}
                        columns={[
                          { key: "name", header: "Product", className: "max-w-[18rem] truncate", cell: (p) => <span title={p.name}>{p.name || `Item ${p.item_id}`}</span> },
                          { key: "units", header: "Units", numeric: true, cell: (p) => fmtNum(p.units) },
                          { key: "revenue", header: "Revenue", numeric: true, cell: (p) => fmtRp(p.revenue) },
                        ]}
                      />
                    )}
                  </Nested>
                  <Nested title="Orders by status">
                    <ul className="space-y-2">
                      {s.statuses.map((x) => (
                        <li key={x.status} className="flex items-center justify-between gap-2 text-sm">
                          <Pill tone={STATUS_TONE[x.status] ?? "neutral"}>{statusLabel(x.status)}</Pill>
                          <span className="tabular-nums text-ink">{fmtNum(x.orders)}</span>
                        </li>
                      ))}
                    </ul>
                  </Nested>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
