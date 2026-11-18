// Unified spend: Meta (synced) + marketplace/other spend entered by hand.

import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { ClientFilter } from "../components/ClientFilter";
import { PageHeader } from "../components/PageHeader";
import { useClientScope } from "../context/ClientScope";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, useApi } from "../lib/api";
import { presetByKey, todayJakarta, type DateRange } from "../lib/dates";
import { fmtCompact, fmtDay, fmtDigits, fmtDayFull, fmtPct, fmtRp } from "../lib/format";
import { DateRangePicker } from "../components/DateRangePicker";
import { KpiCard } from "../components/KpiCard";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";
import { Btn, Nested, RowList } from "../components/kit";

const SOURCES = [
  { key: "meta", label: "Meta Ads", color: "var(--color-chart-1)" },
  { key: "shopee", label: "Shopee", color: "var(--color-chart-2)" },
  { key: "tiktok", label: "TikTok", color: "var(--color-chart-3)" },
  { key: "tokopedia", label: "Tokopedia", color: "var(--color-chart-4)" },
  { key: "other", label: "Other", color: "var(--color-muted)" },
];
const label = (key: string) => SOURCES.find((s) => s.key === key)?.label ?? key;
const MANUAL_SOURCES = SOURCES.filter((s) => s.key !== "meta");

type Summary = {
  total: number;
  previous_total: number;
  by_source: Array<{ source: string; category: string; amount: number }>;
  by_client: Array<{ client_id: number | null; client_name: string | null; amount: number }>;
  trend: Array<{ date: string; source: string; amount: number }>;
};
type Entry = {
  id: number;
  client_name: string | null;
  source: string;
  category: string;
  date: string;
  amount: number;
  note: string | null;
};


export function Spend() {
  const [range, setRange] = useState<DateRange>(presetByKey("month"));
  const { clientId: scopeId, clients: scopeClients } = useClientScope();
  const [companyWide, setCompanyWide] = useState(false);
  const clientId = companyWide ? "none" : scopeId ? String(scopeId) : "";
  const [error, setError] = useState("");
  const [form, setForm] = useState({ source: "shopee", category: "ads", client_id: "", date: todayJakarta(), amount: "", note: "" });

  const qs = `from=${range.from}&to=${range.to}${clientId ? `&client_id=${clientId}` : ""}`;
  const clients = { data: { clients: scopeClients } };
  const summary = useApi<Summary>(`/admin/spend?${qs}`);
  const entries = useApi<{ entries: Entry[] }>(`/admin/spend/entries?${qs}`);

  const days = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const r of summary.data?.trend ?? []) {
      const d = byDate.get(r.date) ?? { date: r.date };
      d[r.source] = ((d[r.source] as number) ?? 0) + r.amount;
      byDate.set(r.date, d);
    }
    return [...byDate.values()];
  }, [summary.data]);

  const sources = useMemo(() => {
    const m = new Map<string, { ads: number; fee: number }>();
    for (const r of summary.data?.by_source ?? []) {
      const s = m.get(r.source) ?? { ads: 0, fee: 0 };
      s[r.category as "ads" | "fee"] += r.amount;
      m.set(r.source, s);
    }
    return [...m.entries()]
      .map(([key, v]) => ({ key, ...v, total: v.ads + v.fee }))
      .sort((a, b) => b.total - a.total);
  }, [summary.data]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/spend/entries", { body: { ...form, amount: Number(form.amount) } });
      setForm({ ...form, amount: "", note: "" });
      summary.reload();
      entries.reload();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function remove(id: number) {
    await api(`/admin/spend/entries/${id}`, { method: "DELETE" });
    summary.reload();
    entries.reload();
  }

  const d = summary.data;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Spend"
        subtitle="Ad spend and marketplace costs for the chosen client."
        actions={
          <>
            <ClientFilter />
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink2">
              <Checkbox checked={companyWide} onCheckedChange={(on) => setCompanyWide(on)} />
              Company-wide only
            </label>
          </>
        }
      />
      <DateRangePicker value={range} onChange={setRange} />

      {summary.error ? (
        <ErrorState message={summary.error} onRetry={summary.reload} />
      ) : summary.loading && !d ? (
        <CardSkeleton lines={5} />
      ) : (
        d && (
          <>
            <Nested title="Spend in this range">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
                <KpiCard bare label="Total spend" value={fmtRp(d.total)} current={d.total} previous={d.previous_total} direction="neutral" />
                {sources.slice(0, 3).map((s) => (
                  <div key={s.key} className="min-w-0">
                    <p className="text-xs font-medium text-muted">{label(s.key)}</p>
                    <p className="tnum mt-1 truncate text-xl font-semibold text-ink">{fmtRp(s.total)}</p>
                    <p className="tnum mt-1 text-xs text-ink2">{fmtPct(d.total ? (s.total / d.total) * 100 : 0, 0)} of total</p>
                  </div>
                ))}
              </div>
            </Nested>

            {days.length === 0 ? (
              <EmptyState title="No spend in this range" hint="Meta syncs nightly. Add marketplace spend below." />
            ) : (
              <Nested
                title="Spend per day"
                right={
                  <span className="flex flex-wrap justify-end gap-x-3 gap-y-1 font-normal">
                    {sources.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: SOURCES.find((x) => x.key === s.key)?.color }} />
                        {label(s.key)}
                      </span>
                    ))}
                  </span>
                }
              >
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <BarChart data={days} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={{ stroke: "var(--color-border2)" }} tickLine={false} minTickGap={24} />
                      <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fill: "var(--color-muted)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
                      <Tooltip
                        cursor={{ fill: "var(--color-hair)" }}
                        content={({ active, payload, label: l }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-lg border border-border2 bg-surface px-3 py-2 text-xs shadow-panel">
                              <p className="mb-1 font-semibold text-ink">{fmtDayFull(String(l))}</p>
                              {payload.map((p) => (
                                <p key={String(p.dataKey)} className="tnum text-ink2">
                                  {label(String(p.dataKey))}: <span className="text-ink">{fmtRp(p.value as number)}</span>
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      {sources.map((s) => (
                        <Bar key={s.key} dataKey={s.key} stackId="spend" fill={SOURCES.find((x) => x.key === s.key)?.color} maxBarSize={28} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Nested>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <SectionTitle>By source</SectionTitle>
                <RowList>
                  {sources.map((s) => (
                    <li key={s.key} className="tnum flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                      <span className="text-ink">{label(s.key)}</span>
                      <span className="text-right">
                        <span className="font-semibold text-ink">{fmtRp(s.total)}</span>
                        {s.fee > 0 && <span className="block text-xs text-muted">ads {fmtRp(s.ads)} · fees {fmtRp(s.fee)}</span>}
                      </span>
                    </li>
                  ))}
                  {sources.length === 0 && <li className="px-4 py-3 text-sm text-muted">–</li>}
                </RowList>
              </div>
              <div>
                <SectionTitle>By client</SectionTitle>
                <RowList>
                  {d.by_client.map((c) => (
                    <li key={c.client_id ?? "none"} className="tnum flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                      <span className="truncate text-ink">{c.client_name ?? "Company-wide"}</span>
                      <span className="font-semibold text-ink">{fmtRp(c.amount)}</span>
                    </li>
                  ))}
                  {d.by_client.length === 0 && <li className="px-4 py-3 text-sm text-muted">–</li>}
                </RowList>
              </div>
            </div>
          </>
        )
      )}

      <div>
        <SectionTitle>Marketplace spend</SectionTitle>
        <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
          <NativeSelect value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} aria-label="Source">
            {MANUAL_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </NativeSelect>
          <NativeSelect value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} aria-label="Category">
            <option value="ads">Ads</option>
            <option value="fee">Fees</option>
          </NativeSelect>
          <NativeSelect value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} aria-label="Client">
            <option value="">Company-wide</option>
            {clients.data?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
          <Input className="w-auto" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
          <Input type="text" required inputMode="numeric" value={fmtDigits(form.amount)} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, "") })} placeholder="Amount (Rp)" aria-label="Amount in Rupiah" className="w-full sm:w-40" />
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note" aria-label="Note" maxLength={200} className="w-full sm:w-auto sm:flex-1" />
          <Btn tone="secondary" type="submit">Add</Btn>
        </form>
        {error && <p role="alert" className="mb-2 text-xs text-crit">{error}</p>}
        {entries.error ? (
          <ErrorState message={entries.error} onRetry={entries.reload} />
        ) : entries.data?.entries.length ? (
          <RowList>
            {entries.data.entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="tnum block text-ink">{fmtRp(e.amount)} · {label(e.source)} · {e.category === "fee" ? "fees" : "ads"}</span>
                  <span className="block truncate text-xs text-muted">
                    {fmtDayFull(e.date)} · {e.client_name ?? "Company-wide"}{e.note ? ` · ${e.note}` : ""}
                  </span>
                </span>
                <Btn tone="secondary" onClick={() => remove(e.id)} aria-label={`Delete entry ${fmtRp(e.amount)} ${label(e.source)}`}>Delete</Btn>
              </li>
            ))}
          </RowList>
        ) : (
          <EmptyState title="No manual entries in this range" hint="Add Shopee, TikTok or Tokopedia spend above." />
        )}
      </div>
    </div>
  );
}
