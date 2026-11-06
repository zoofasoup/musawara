// Organic content: per client, stories against the daily target and a grid of
// posts, each carrying a performance label relative to its own account.

import { useMemo, useState } from "react";
import { api, useApi } from "../lib/api";
import { fmtCompact, fmtDay, fmtPct } from "../lib/format";
import { labelPosts, type PostLabel } from "../lib/organicLabel";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";
import { btnCls as btn, ConfirmBtn, selectSmCls as sel, Sheet } from "../components/kit";

type Day = { day: string; count: number };
type Account = {
  id: number;
  client_id: number;
  client_name: string;
  ig_username: string | null;
  ig_user_id: string;
  story_target: number;
  last_poll_at: string | null;
  last_error: string | null;
  days: Day[];
};
type Candidate = { ig_user_id: string; ig_username: string | null; page_id: string; page_name: string };
type Post = {
  media_id: string;
  ig_user_id: string;
  client_id: number;
  followers: number | null;
  ig_username: string | null;
  posted_at: string;
  day: string;
  format: string;
  permalink: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  views: number | null;
  saves: number | null;
  shares: number | null;
  avg_watch_ms: number | null;
};

const FORMATS = [["", "All formats"], ["reel", "Reels"], ["carousel", "Carousel"], ["image", "Photo"], ["video", "Video"]];
const FORMAT_NAME: Record<string, string> = { reel: "Reel", carousel: "Carousel", image: "Photo", video: "Video" };
const rate = (n: number | null, d: number | null) => (n != null && d ? n / d : null);
const SORTS: Record<string, [string, (p: Post, l: PostLabel | null | undefined) => number | null]> = {
  newest: ["Newest", (p) => new Date(p.posted_at).getTime()],
  reach: ["Reach", (p) => p.reach],
  shares: ["Shares", (p) => p.shares],
  save_rate: ["Save rate", (p) => rate(p.saves, p.reach)],
  share_rate: ["Share rate", (p) => rate(p.shares, p.reach)],
  watch: ["Avg watch time", (p) => p.avg_watch_ms],
};
const LABELS: Record<PostLabel, { text: string; cls: string }> = {
  top: { text: "Top", cls: "bg-good text-white" },
  good: { text: "Good", cls: "bg-good/15 text-good" },
  average: { text: "Average", cls: "bg-surface3 text-ink2" },
  weak: { text: "Weak", cls: "bg-crit/15 text-crit" },
  new: { text: "New", cls: "bg-surface3 text-muted" },
};


function Thumb({ post, className = "" }: { post: Post; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!post.thumbnail_url || failed) {
    return (
      <div className={`flex items-center justify-center bg-surface3 text-xs font-medium text-muted ${className}`}>
        {FORMAT_NAME[post.format] ?? post.format}
      </div>
    );
  }
  return <img src={post.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
}

function LabelChip({ label }: { label: PostLabel | null | undefined }) {
  if (!label) return null;
  const l = LABELS[label];
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${l.cls}`}>{l.text}</span>;
}

function StoryRow({ a }: { a: Account }) {
  const today = a.days[a.days.length - 1]?.count ?? 0;
  const met = today >= a.story_target;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted">Stories today · @{a.ig_username ?? a.ig_user_id}</p>
        <p className={`tnum text-lg font-semibold ${met ? "text-good" : "text-ink"}`}>
          {today}<span className="text-sm font-normal text-muted"> / {a.story_target}</span>
        </p>
      </div>
      <div className="flex h-8 min-w-[8rem] flex-1 items-end gap-0.5" role="img" aria-label="Stories per day, last 14 days">
        {a.days.map((d) => (
          <div
            key={d.day}
            title={`${fmtDay(d.day)}: ${d.count}`}
            className={`flex-1 rounded-sm ${d.count >= a.story_target ? "bg-good" : "bg-warn"}`}
            style={{ height: `${Math.max(8, Math.min(100, (d.count / Math.max(a.story_target, 1)) * 100))}%`, opacity: d.count ? 1 : 0.25 }}
          />
        ))}
      </div>
      {a.last_error && <p className="w-full text-xs text-crit">{a.last_error}</p>}
    </div>
  );
}

function Detail({ post, label, onClose }: { post: Post; label: PostLabel | null | undefined; onClose: () => void }) {
  const followers = post.followers;
  const stat = (name: string, value: string) => (
    <div>
      <dt className="text-xs text-muted">{name}</dt>
      <dd className="tnum text-sm text-ink">{value}</dd>
    </div>
  );
  const n = (v: number | null) => (v == null ? "–" : fmtCompact(v));
  return (
    <Sheet title="Post detail" onClose={onClose}>
      <div>
        <div className="flex gap-3">
          <Thumb post={post} className="h-28 w-28 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><LabelChip label={label} /><span className="text-xs text-muted">{FORMAT_NAME[post.format]} · {fmtDay(post.day)}</span></div>
            <p className="mt-1 text-xs text-muted">@{post.ig_username}</p>
            {post.permalink && <a href={post.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-musawara-ink hover:underline">Open on Instagram</a>}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3">
          {stat("Reach", n(post.reach))}
          {stat("Reach / followers", rate(post.reach, followers) != null ? fmtPct(rate(post.reach, followers)! * 100) : "–")}
          {stat("Views", n(post.views))}
          {stat("Saves", post.saves == null ? "–" : `${post.saves}${rate(post.saves, post.reach) != null ? ` · ${fmtPct(rate(post.saves, post.reach)! * 100)}` : ""}`)}
          {stat("Shares", post.shares == null ? "–" : `${post.shares}${rate(post.shares, post.reach) != null ? ` · ${fmtPct(rate(post.shares, post.reach)! * 100)}` : ""}`)}
          {stat("Likes / comments", `${post.likes ?? "–"} / ${post.comments ?? "–"}`)}
          {post.format === "reel" && stat("Avg watch", post.avg_watch_ms != null ? `${(post.avg_watch_ms / 1000).toFixed(1)}s` : "–")}
        </dl>
        {post.caption && <p className="mt-4 whitespace-pre-line text-sm text-ink2">{post.caption}</p>}
        <button className={`${btn} mt-4 w-full justify-center`} onClick={onClose}>Close</button>
      </div>
    </Sheet>
  );
}

export function Organic() {
  const list = useApi<{ today: string; accounts: Account[] }>("/admin/organic");
  const posts = useApi<{ posts: Post[] }>("/admin/organic/posts");
  const clients = useApi<{ clients: { id: number; name: string }[] }>("/admin/clients");
  const [clientId, setClientId] = useState<number | null>(null);
  const [fmt, setFmt] = useState("");
  const [sort, setSort] = useState("newest");
  const [open, setOpen] = useState<Post | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const accounts = list.data?.accounts ?? [];
  const tabs = useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of accounts) if (!seen.has(a.client_id)) seen.set(a.client_id, a.client_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [accounts]);
  const activeId = clientId != null && tabs.some((t) => t.id === clientId) ? clientId : tabs[0]?.id ?? null;
  const clientAccounts = accounts.filter((a) => a.client_id === activeId);

  const allPosts = posts.data?.posts ?? [];
  const labels = useMemo(() => labelPosts(allPosts), [allPosts]);
  const shown = useMemo(() => {
    const get = SORTS[sort][1];
    return allPosts
      .filter((p) => p.client_id === activeId && (!fmt || p.format === fmt))
      .sort((a, b) => (get(b, labels.get(b.media_id)) ?? -1) - (get(a, labels.get(a.media_id)) ?? -1));
  }, [allPosts, labels, activeId, fmt, sort]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg("");
    try {
      await fn();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy("");
  };
  const reloadAll = () => {
    list.reload();
    posts.reload();
  };
  const discover = () =>
    run("discover", async () => {
      const r = await api<{ candidates: Candidate[] }>("/admin/organic/discover");
      setFound(r.candidates);
      if (!r.candidates.length) setMsg("No Instagram account found. Check the token permissions and that the Page is shared with your system user.");
    });
  const add = (c: Candidate) =>
    run("add" + c.ig_user_id, async () => {
      await api("/admin/organic/accounts", { method: "POST", body: { client_id: Number(pick[c.ig_user_id]), ig_user_id: c.ig_user_id, ig_username: c.ig_username, page_id: c.page_id } });
      await api("/admin/organic/poll", { method: "POST", body: {} });
      reloadAll();
    });
  const poll = () =>
    run("poll", async () => {
      const r = await api<{ added: number; errors: string[] }>("/admin/organic/poll", { method: "POST", body: {} });
      setMsg(r.errors.length ? r.errors[0] : `${r.added} new stories recorded`);
      reloadAll();
    });
  const remove = (a: Account) =>
    run("rm" + a.id, async () => {
      await api(`/admin/organic/accounts/${a.id}`, { method: "DELETE" });
      reloadAll();
    });

  const tracked = new Set(accounts.map((a) => a.ig_user_id));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Organic</h1>
          <p className="mt-1 text-sm text-ink2">Which content works, compared with each account's own average.</p>
        </div>
        <span className="flex gap-2">
          <button className={btn} disabled={!!busy} onClick={discover}>{busy === "discover" ? "Looking…" : "Find accounts"}</button>
          <button className={btn} disabled={!!busy} onClick={poll}>{busy === "poll" ? "Checking…" : "Check now"}</button>
        </span>
      </div>
      {msg && <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink2">{msg}</p>}

      {list.loading ? (
        <div className="mt-5"><CardSkeleton lines={4} /></div>
      ) : list.error ? (
        <div className="mt-5"><ErrorState message={list.error} onRetry={list.reload} /></div>
      ) : !tabs.length ? (
        <div className="mt-5"><EmptyState title="No account tracked yet" hint="Press Find accounts, then add the Instagram accounts to watch." /></div>
      ) : (
        <>
          <div className="mt-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={t.id === activeId}
                onClick={() => setClientId(t.id)}
                className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium ${t.id === activeId ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            {clientAccounts.map((a) => <StoryRow key={a.id} a={a} />)}
          </div>

          <div className="mt-6">
            <SectionTitle
              right={
                <span className="flex gap-2">
                  <select className={sel} value={fmt} onChange={(e) => setFmt(e.target.value)} aria-label="Format">
                    {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <select className={sel} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
                    {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </span>
              }
            >
              Posts, last 30 days
            </SectionTitle>
            {posts.loading ? (
              <CardSkeleton lines={4} />
            ) : !shown.length ? (
              <EmptyState title="No posts yet" hint="Posts appear after the first check. Insights are filled in within a day of posting." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {shown.map((p) => (
                  <button key={p.media_id} onClick={() => setOpen(p)} className="group text-left">
                    <div className="relative overflow-hidden rounded-lg border border-border">
                      <Thumb post={p} className="aspect-square w-full" />
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">{FORMAT_NAME[p.format] ?? p.format}</span>
                      <span className="absolute right-1.5 top-1.5"><LabelChip label={labels.get(p.media_id)} /></span>
                    </div>
                    <p className="tnum mt-1.5 text-xs text-ink2">
                      {fmtDay(p.day)} · {p.reach != null ? `${fmtCompact(p.reach)} reach` : "no insights yet"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {clientAccounts.map((a) => (
              <ConfirmBtn key={a.id} label={`Stop tracking @${a.ig_username ?? a.ig_user_id}`} confirmLabel="Stop (stories stay)" icon="trash" onConfirm={() => remove(a)} />
            ))}
          </div>
        </>
      )}

      {found && found.length > 0 && (
        <div className="mt-8">
          <SectionTitle>Accounts the token can see</SectionTitle>
          <div className="grid gap-2">
            {found.map((c) => (
              <div key={c.ig_user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
                <div>
                  <p className="text-sm font-medium text-ink">@{c.ig_username ?? c.ig_user_id}</p>
                  <p className="text-xs text-muted">Page: {c.page_name}</p>
                </div>
                {tracked.has(c.ig_user_id) ? (
                  <span className="text-xs text-muted">Tracked</span>
                ) : (
                  <span className="flex gap-2">
                    <select className={sel} value={pick[c.ig_user_id] ?? ""} onChange={(e) => setPick({ ...pick, [c.ig_user_id]: e.target.value })} aria-label="Client">
                      <option value="">Client…</option>
                      {clients.data?.clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                    </select>
                    <button className={btn} disabled={!pick[c.ig_user_id] || !!busy} onClick={() => add(c)}>Track</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {open && <Detail post={open} label={labels.get(open.media_id)} onClose={() => setOpen(null)} />}
    </div>
  );
}
