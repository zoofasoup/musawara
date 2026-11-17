// SMM planning: content calendar (month/week, Asia/Jakarta) and idea kanban, per client or all clients.
// Team only. Ideas are planning cards, not Publish posts: nothing here schedules or publishes.

import { useMemo, useState } from "react";
import { api, useApi } from "../lib/api";
import { todayJakarta } from "../lib/dates";
import { CardSkeleton, ErrorState } from "../components/ui";
import { Btn, Empty, fieldCls, Pill, Sheet, ConfirmBtn, useNotify, type Tone } from "../components/kit";
import { Icon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { useClientScope } from "../context/ClientScope";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addDaysYmd, monthGrid, POST_STATUS, STAGES, STAGE_LABEL, MANUAL_STAGES, weekStart, type Stage } from "../../worker/lib/planning";

type Card = {
  id: number; client_id: number; client_name: string; title: string; brief: string; kind: string; stage: Stage;
  planned_date: string | null; owner_user_id: number | null; owner_name: string | null;
  post_id: number | null; post_status: string | null; post_scheduled_at: string | null;
};
type CalPost = { id: number; client_id: number; client_name: string; status: string; kind: string; caption: string; scheduled_at: string; day: string; platforms: string[]; card_id: number | null; last_error: string | null };
type Calendar = { posts: CalPost[]; cards: Card[]; counts: Record<string, number> };
type Board = { cards: Card[]; owners: { id: number; name: string }[] };
type ClientRow = { id: number; name: string };
type Picked = { type: "day"; day: string } | { type: "post"; post: CalPost } | { type: "card"; id: number } | null;

const KINDS = ["feed", "carousel", "reel", "story"];
const KIND_NAME: Record<string, string> = { feed: "Photo", carousel: "Carousel", reel: "Reel", story: "Story" };
const TONE_DOT: Record<Tone, string> = { neutral: "bg-muted", good: "bg-good", warn: "bg-warn", crit: "bg-crit", accent: "bg-[var(--accent)]" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtTime = (utc: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utc.replace(" ", "T") + "Z"));
const fmtDayLong = (ymd: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(ymd + "T00:00:00Z"));
const monthStart = (ymd: string) => ymd.slice(0, 8) + "01";
const addMonths = (ymd: string, n: number) => {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

export function Planning() {
  const { notify, node } = useNotify();
  const { clients: scopeClients, clientId: scopeId } = useClientScope();
  const [tab, setTab] = useState<"calendar" | "board">("calendar");
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(todayJakarta());
  const clientId: number | "" = scopeId ?? "";
  const [picked, setPicked] = useState<Picked>(null);

  const q = clientId === "" ? "" : `client_id=${clientId}`;
  const [from, to] = useMemo(() => {
    if (view === "week") {
      const s = weekStart(cursor);
      return [s, addDaysYmd(s, 6)];
    }
    const g = monthGrid(cursor);
    return [g[0][0], g.at(-1)!.at(-1)!];
  }, [view, cursor]);

  const cal = useApi<Calendar>(tab === "calendar" ? `/admin/plan/calendar?from=${from}&to=${to}${q ? "&" + q : ""}` : null);
  const board = useApi<Board>(`/admin/plan/board${q ? "?" + q : ""}`);
  const reload = () => {
    cal.reload();
    board.reload();
  };

  const step = (n: number) => setCursor(view === "week" ? addDaysYmd(cursor, 7 * n) : addMonths(cursor, n));
  const title = view === "month" ? `${MONTHS[+cursor.slice(5, 7) - 1]} ${cursor.slice(0, 4)}` : `${fmtDayLong(from)} to ${fmtDayLong(to)}`;
  const cards = board.data?.cards ?? [];
  const pickedCard = picked?.type === "card" ? cards.find((c) => c.id === picked.id) ?? null : null;
  const selectedClient = clientId === "" ? null : clientId;

  return (
    <div className="mx-auto max-w-7xl">
      {node}
      <PageHeader title="Planning" subtitle="Content calendar and idea board. Times are Asia/Jakarta (WIB)." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "calendar" | "board")} className="mt-4">
        <TabsList variant="line" className="h-auto w-full justify-start border-b border-border">
          <TabsTrigger value="calendar" className="min-h-11 flex-none px-4 text-sm">Calendar</TabsTrigger>
          <TabsTrigger value="board" className="min-h-11 flex-none px-4 text-sm">Board</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "calendar" ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={() => step(-1)} aria-label="Previous">‹</Btn>
            <Btn onClick={() => setCursor(todayJakarta())}>Today</Btn>
            <Btn onClick={() => step(1)} aria-label="Next">›</Btn>
            <h2 className="ml-1 text-base font-semibold text-ink">{title}</h2>
            <span className="ml-auto inline-flex gap-1">
              {(["month", "week"] as const).map((v) => (
                <Btn key={v} tone={view === v ? "primary" : "secondary"} onClick={() => setView(v)}>{v === "month" ? "Month" : "Week"}</Btn>
              ))}
            </span>
          </div>
          <Legend />
          {cal.loading && !cal.data ? <div className="mt-4"><CardSkeleton lines={6} /></div>
            : cal.error ? <div className="mt-4"><ErrorState message={cal.error} onRetry={cal.reload} /></div>
            : <CalendarGrid view={view} cursor={cursor} data={cal.data!} onPick={setPicked} showClient={selectedClient == null} />}
          {cal.data && !cal.data.posts.length && !cal.data.cards.length && !cal.loading && (
            <p className="mt-3 text-center text-xs text-muted">Nothing planned in this period. Tap a day to add an idea.</p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {board.loading && !board.data ? <CardSkeleton lines={6} />
            : board.error ? <ErrorState message={board.error} onRetry={board.reload} />
            : <KanbanBoard cards={cards} onChanged={reload} onOpen={(id) => setPicked({ type: "card", id })} notify={notify} onAdd={() => setPicked({ type: "day", day: "" })} />}
        </div>
      )}

      {picked?.type === "day" && (
        <DaySheet day={picked.day} clients={scopeClients} clientId={selectedClient} owners={board.data?.owners ?? []}
          items={picked.day ? { posts: cal.data?.posts.filter((p) => p.day === picked.day) ?? [], cards: cal.data?.cards.filter((c) => c.planned_date === picked.day) ?? [] } : null}
          onPick={setPicked} onClose={() => setPicked(null)} onSaved={() => { setPicked(null); reload(); notify("Idea added"); }} notify={notify} />
      )}
      {picked?.type === "post" && <PostSheet post={picked.post} onClose={() => setPicked(null)} onChanged={() => { setPicked(null); reload(); }} notify={notify} />}
      {pickedCard && <CardSheet card={pickedCard} owners={board.data?.owners ?? []} onClose={() => setPicked(null)} onChanged={() => { setPicked(null); reload(); }} notify={notify} />}
      {picked?.type === "card" && !pickedCard && !board.loading && <Sheet title="Card" onClose={() => setPicked(null)}><p className="text-sm text-ink2">This card is not available any more.</p></Sheet>}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink2">
      {Object.values(POST_STATUS).map((s) => <span key={s.label} className="inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${TONE_DOT[s.tone]}`} />{s.label}</span>)}
      <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full border border-dashed border-ink2" />Idea (no post yet)</span>
    </div>
  );
}

function CalendarGrid({ view, cursor, data, onPick, showClient }: { view: "month" | "week"; cursor: string; data: Calendar; onPick: (p: Picked) => void; showClient: boolean }) {
  const today = todayJakarta();
  const weeks = view === "month" ? monthGrid(cursor) : [Array.from({ length: 7 }, (_, i) => addDaysYmd(weekStart(cursor), i))];
  const byDay = (d: string) => ({ posts: data.posts.filter((p) => p.day === d), cards: data.cards.filter((c) => c.planned_date === d) });
  const max = view === "week" ? 20 : 3;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface2 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
        {DOW.map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      {weeks.map((w) => (
        <div key={w[0]} className="grid grid-cols-7 border-b border-border last:border-b-0">
          {w.map((d) => {
            const { posts, cards } = byDay(d);
            const total = posts.length + cards.length;
            const outside = view === "month" && d.slice(0, 7) !== cursor.slice(0, 7);
            return (
              <div key={d} className={`min-h-[4.5rem] border-r border-border p-1 last:border-r-0 sm:min-h-28 ${view === "week" ? "sm:min-h-64" : ""} ${outside ? "bg-surface2/50" : ""}`}>
                <button type="button" onClick={() => onPick({ type: "day", day: d })} aria-label={`${fmtDayLong(d)}, ${total} items. Add idea`}
                  className={`flex min-h-8 w-full items-center justify-between rounded px-1 text-xs hover:bg-surface3 ${d === today ? "font-bold text-musawara-ink" : outside ? "text-muted" : "text-ink2"}`}>
                  <span className={d === today ? "rounded-full bg-[var(--accent)] px-1.5 text-white" : ""}>{+d.slice(8)}</span>
                  <Icon name="plus" className="h-3 w-3 opacity-40" />
                </button>
                {/* phones: dots only, tap the day for the list */}
                <div className="flex flex-wrap gap-1 px-1 sm:hidden">
                  {posts.slice(0, 6).map((p) => <i key={"p" + p.id} className={`h-2 w-2 rounded-full ${TONE_DOT[POST_STATUS[p.status]?.tone ?? "neutral"]}`} />)}
                  {cards.slice(0, 6).map((c) => <i key={"c" + c.id} className="h-2 w-2 rounded-full border border-dashed border-ink2" />)}
                </div>
                <div className="hidden space-y-1 sm:block">
                  {posts.slice(0, max).map((p) => {
                    const s = POST_STATUS[p.status] ?? POST_STATUS.draft;
                    return (
                      <button key={"p" + p.id} type="button" onClick={() => onPick({ type: "post", post: p })}
                        className="flex w-full items-center gap-1.5 rounded border border-border bg-bg px-1.5 py-1 text-left text-[11px] leading-tight hover:border-border2">
                        <i className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[s.tone]}`} aria-label={s.label} />
                        <span className="shrink-0 tabular-nums text-muted">{fmtTime(p.scheduled_at)}</span>
                        <span className="truncate text-ink">{showClient ? `${p.client_name}: ` : ""}{p.caption || KIND_NAME[p.kind]}</span>
                      </button>
                    );
                  })}
                  {cards.slice(0, Math.max(0, max - posts.length)).map((c) => (
                    <button key={"c" + c.id} type="button" onClick={() => onPick({ type: "card", id: c.id })}
                      className="flex w-full items-center gap-1.5 rounded border border-dashed border-border2 px-1.5 py-1 text-left text-[11px] leading-tight text-ink2 hover:bg-surface2">
                      <span className="truncate">{showClient ? `${c.client_name}: ` : ""}{c.title}</span>
                    </button>
                  ))}
                  {total > max && <button type="button" onClick={() => onPick({ type: "day", day: d })} className="px-1 text-[11px] text-muted hover:text-ink">+{total - max} more</button>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ItemRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface2">{children}</button>;
}

function DaySheet({ day, clients, clientId, owners, items, onPick, onClose, onSaved, notify }: {
  day: string; clients: ClientRow[]; clientId: number | null; owners: { id: number; name: string }[];
  items: { posts: CalPost[]; cards: Card[] } | null; onPick: (p: Picked) => void; onClose: () => void; onSaved: () => void; notify: (t: string, k?: "ok" | "err") => void;
}) {
  const [form, setForm] = useState({ title: "", kind: "feed", client: clientId ?? ("" as number | ""), date: day, owner: "" as number | "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/admin/plan/cards", { body: { client_id: form.client, title: form.title, kind: form.kind, planned_date: form.date || null, owner_user_id: form.owner || null } });
      onSaved();
    } catch (e: any) {
      notify(e.message, "err");
      setBusy(false);
    }
  };
  return (
    <Sheet title="New idea" onClose={onClose}>
      <h2 className="text-lg font-semibold text-ink">{day ? fmtDayLong(day) : "New idea"}</h2>
      {items && (items.posts.length > 0 || items.cards.length > 0) && (
        <div className="mt-3 space-y-1.5">
          {items.posts.map((p) => (
            <ItemRow key={"p" + p.id} onClick={() => onPick({ type: "post", post: p })}>
              <i className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[POST_STATUS[p.status]?.tone ?? "neutral"]}`} />
              <span className="tabular-nums text-muted">{fmtTime(p.scheduled_at)}</span><span className="truncate">{p.client_name}: {p.caption || KIND_NAME[p.kind]}</span>
            </ItemRow>
          ))}
          {items.cards.map((c) => <ItemRow key={"c" + c.id} onClick={() => onPick({ type: "card", id: c.id })}><span className="truncate">{c.client_name}: {c.title}</span><Pill>{STAGE_LABEL[c.stage]}</Pill></ItemRow>)}
        </div>
      )}
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">New idea</p>
        <input className={fieldCls + " w-full"} placeholder="Idea title" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" />
        <div className="grid grid-cols-2 gap-2">
          <select className={fieldCls} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value ? Number(e.target.value) : "" })} aria-label="Client">
            <option value="">Client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={fieldCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Type">
            {KINDS.map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}
          </select>
          <input type="date" className={fieldCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Planned date" />
          <select className={fieldCls} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value ? Number(e.target.value) : "" })} aria-label="Owner">
            <option value="">No owner</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <Btn tone="primary" type="submit" loading={busy} disabled={!form.title.trim() || form.client === ""} className="w-full min-h-11">Add idea</Btn>
        <p className="text-xs text-muted">An idea is a planning card only. It does not create or schedule a post.</p>
      </form>
    </Sheet>
  );
}

function PostSheet({ post, onClose, onChanged, notify }: { post: CalPost; onClose: () => void; onChanged: () => void; notify: (t: string, k?: "ok" | "err") => void }) {
  const s = POST_STATUS[post.status] ?? POST_STATUS.draft;
  const [busy, setBusy] = useState(false);
  const addToBoard = async () => {
    setBusy(true);
    try {
      await api("/admin/plan/cards", { body: { client_id: post.client_id, title: (post.caption || KIND_NAME[post.kind]).slice(0, 80), kind: post.kind, post_id: post.id, planned_date: post.day } });
      notify("Added to the board");
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
      setBusy(false);
    }
  };
  return (
    <Sheet title="Post" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2"><Pill tone={s.tone}>{s.label}</Pill><Pill>{KIND_NAME[post.kind]}</Pill>{post.platforms.map((p) => <Pill key={p}>{p === "instagram" ? "Instagram" : "Facebook"}</Pill>)}</div>
      <h2 className="mt-3 text-lg font-semibold text-ink">{post.client_name}</h2>
      <p className="text-sm text-ink2">{fmtDayLong(post.day)}, {fmtTime(post.scheduled_at)} WIB</p>
      <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{post.caption || "No caption yet."}</p>
      {post.last_error && <p className="mt-3 rounded-lg bg-crit/10 px-3 py-2 text-xs text-crit">{post.last_error}</p>}
      <p className="mt-4 text-xs text-muted">Edit, reschedule or retry this post in Publish. This page never changes a post.</p>
      {post.card_id == null && <Btn className="mt-3 min-h-11" onClick={addToBoard} loading={busy}>Add to board</Btn>}
    </Sheet>
  );
}

function CardSheet({ card, owners, onClose, onChanged, notify }: { card: Card; owners: { id: number; name: string }[]; onClose: () => void; onChanged: () => void; notify: (t: string, k?: "ok" | "err") => void }) {
  const [f, setF] = useState({ title: card.title, brief: card.brief, kind: card.kind, date: card.planned_date ?? "", owner: card.owner_user_id ?? ("" as number | ""), post: card.post_id ?? ("" as number | "") });
  const [busy, setBusy] = useState(false);
  const linkable = useApi<{ posts: { id: number; status: string; kind: string; caption: string; scheduled_at: string | null }[] }>(`/admin/plan/linkable-posts?client_id=${card.client_id}`);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      notify(ok);
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
      setBusy(false);
    }
  };
  const save = () => run(() => api(`/admin/plan/cards/${card.id}`, { method: "PATCH", body: { title: f.title, brief: f.brief, kind: f.kind, planned_date: f.date || null, owner_user_id: f.owner || null, post_id: f.post || null } }), "Saved");
  return (
    <Sheet title="Card" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2"><Pill tone="accent">{STAGE_LABEL[card.stage]}</Pill><span className="text-xs text-muted">{card.client_name}</span></div>
      <div className="mt-3 space-y-3">
        <input className={fieldCls + " w-full"} value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Title" />
        <textarea className={fieldCls + " min-h-24 w-full"} placeholder="Brief" value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} aria-label="Brief" />
        <div className="grid grid-cols-2 gap-2">
          <select className={fieldCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Type">{KINDS.map((k) => <option key={k} value={k}>{KIND_NAME[k]}</option>)}</select>
          <input type="date" className={fieldCls} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Planned date" />
          <select className={fieldCls + " col-span-2"} value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value ? Number(e.target.value) : "" })} aria-label="Owner">
            <option value="">No owner</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <select className={fieldCls + " col-span-2"} value={f.post} onChange={(e) => setF({ ...f, post: e.target.value ? Number(e.target.value) : "" })} aria-label="Linked Publish post">
            <option value="">No linked post</option>
            {card.post_id != null && <option value={card.post_id}>Post #{card.post_id} ({POST_STATUS[card.post_status ?? "draft"]?.label})</option>}
            {(linkable.data?.posts ?? []).map((p) => <option key={p.id} value={p.id}>#{p.id} {POST_STATUS[p.status]?.label}: {p.caption || KIND_NAME[p.kind]}</option>)}
          </select>
        </div>
        {card.post_id != null && <p className="text-xs text-muted">Linked card moves forward by itself when its post is scheduled or published. Moving or deleting the card never changes the post.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="primary" className="min-h-11" onClick={save} loading={busy} disabled={!f.title.trim()}>Save</Btn>
          <ConfirmBtn label="Delete card" onConfirm={() => run(() => api(`/admin/plan/cards/${card.id}`, { method: "DELETE" }), "Card deleted")} />
        </div>
      </div>
    </Sheet>
  );
}

function KanbanBoard({ cards, onChanged, onOpen, notify, onAdd }: { cards: Card[]; onChanged: () => void; onOpen: (id: number) => void; notify: (t: string, k?: "ok" | "err") => void; onAdd: () => void }) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const move = async (card: Card, stage: Stage) => {
    setBusyId(card.id);
    try {
      await api(`/admin/plan/cards/${card.id}/move`, { body: { stage } });
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
    }
    setBusyId(null);
  };
  if (!cards.length) return <Empty icon="board" title="No ideas yet" hint="Add an idea and move it from Idea to Drafting to In review. Scheduled and Published fill in by themselves from Publish." action={<Btn tone="primary" className="min-h-11" onClick={onAdd}>Add idea</Btn>} />;
  return (
    <>
      <div className="mb-3 flex justify-end"><Btn tone="primary" className="min-h-11" onClick={onAdd} icon="plus">Add idea</Btn></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const col = cards.filter((c) => c.stage === stage);
          const manual = MANUAL_STAGES.includes(stage);
          return (
            <section key={stage} aria-label={STAGE_LABEL[stage]} className="min-w-0 rounded-xl bg-surface2 p-2"
              onDragOver={(e) => manual && dragId != null && e.preventDefault()}
              onDrop={() => { const c = cards.find((x) => x.id === dragId); setDragId(null); if (c && manual && c.stage !== stage) void move(c, stage); }}>
              <h3 className="flex items-center justify-between px-1 py-1 text-xs font-semibold uppercase tracking-wide text-ink2">{STAGE_LABEL[stage]}<span className="text-muted">{col.length}</span></h3>
              <div className="space-y-2">
                {col.map((c) => {
                  const idx = MANUAL_STAGES.indexOf(c.stage);
                  const locked = c.post_status != null && ["scheduled", "publishing", "published"].includes(c.post_status);
                  const ps = c.post_status ? POST_STATUS[c.post_status] : null;
                  return (
                    <article key={c.id} draggable={!locked && manual} onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)} className="rounded-lg border border-border bg-surface p-2.5">
                      <button type="button" onClick={() => onOpen(c.id)} className="block w-full text-left">
                        <span className="block text-sm font-medium text-ink">{c.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span>{c.client_name}</span><span>· {KIND_NAME[c.kind]}</span>
                          {c.planned_date && <span>· {c.planned_date.slice(5)}</span>}
                          {c.owner_name && <span>· {c.owner_name}</span>}
                        </span>
                        {ps && <span className="mt-1.5 inline-block"><Pill tone={ps.tone}>Post: {ps.label}</Pill></span>}
                      </button>
                      {manual && !locked && (
                        <div className="mt-2 flex gap-1.5">
                          {idx > 0 && <Btn className="min-h-11 flex-1" disabled={busyId === c.id} onClick={() => move(c, MANUAL_STAGES[idx - 1])} aria-label={`Move ${c.title} back`}>‹ {STAGE_LABEL[MANUAL_STAGES[idx - 1]]}</Btn>}
                          {idx < MANUAL_STAGES.length - 1 && <Btn className="min-h-11 flex-1" disabled={busyId === c.id} onClick={() => move(c, MANUAL_STAGES[idx + 1])} aria-label={`Move ${c.title} forward`}>{STAGE_LABEL[MANUAL_STAGES[idx + 1]]} ›</Btn>}
                        </div>
                      )}
                    </article>
                  );
                })}
                {!col.length && <p className="px-1 py-3 text-center text-xs text-muted">{manual ? "Empty" : "Fills in from Publish"}</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
