// Approvals. One page per client: client users review and decide, the team creates and
// resubmits. TeamApprovals lists every request across clients with a status filter.

import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "../components/PageHeader";
import { useClientScope } from "../context/ClientScope";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { fmtDateTime } from "../lib/format";
import { CardSkeleton, EmptyState, ErrorState } from "../components/ui";
import { Btn, Pill, RowList, Sheet, useNotify, type Tone } from "../components/kit";
import type { Asset } from "./Assets";

type Status = "pending" | "approved" | "changes_requested";
type LinkedAsset = Pick<Asset, "id" | "title" | "kind" | "drive_url">;
type HistoryRow = { id: number; version: number; action: string; actor_name: string; comment: string; created_at: string };
type Req = {
  id: number;
  title: string;
  message: string;
  status: Status;
  version: number;
  post_id: number | null;
  updated_at: string;
  assets: LinkedAsset[];
  history?: HistoryRow[];
  post_kind?: string | null;
  post_caption?: string | null;
};

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for review", tone: "warn" },
  approved: { label: "Approved", tone: "good" },
  changes_requested: { label: "Changes requested", tone: "crit" },
};
const ACTION: Record<string, string> = { submitted: "Submitted", resubmitted: "Resubmitted", approved: "Approved", changes_requested: "Requested changes" };
const FILTERS: Array<[string, string]> = [["", "All"], ["pending", "Waiting"], ["changes_requested", "Changes requested"], ["approved", "Approved"]];

const denied = (m?: string) => !!m && /forbidden|unauthori/i.test(m);
function Denied() {
  return <ErrorState message="You do not have access to this page." />;
}

function AssetLinks({ assets }: { assets: LinkedAsset[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {assets.map((a) => (
        <li key={a.id}>
          <a href={a.drive_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 max-w-full flex-wrap items-center gap-x-1.5 text-[13px] font-medium text-musawara-ink hover:underline">
            <span className="min-w-0 break-words">{a.title}</span>
            <span className="whitespace-nowrap text-xs font-normal text-muted">({a.kind}) · opens in Google Drive</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function History({ clientId, id }: { clientId: number; id: number }) {
  const d = useApi<{ request: Req }>(`/approvals/${clientId}/requests/${id}`);
  if (d.loading && !d.data) return <CardSkeleton lines={2} />;
  if (d.error) return <ErrorState message={d.error} onRetry={d.reload} />;
  return (
    <ol className="mt-3 space-y-2 border-l border-border2 pl-3">
      {d.data!.request.history!.map((h) => (
        <li key={h.id} className="text-xs text-ink2">
          <span className="font-medium text-ink">{ACTION[h.action] ?? h.action}</span> v{h.version} · {h.actor_name || "Unknown"} · {fmtDateTime(h.created_at)}
          {h.comment && <p className="mt-0.5 whitespace-pre-line text-ink2">{h.comment}</p>}
        </li>
      ))}
    </ol>
  );
}

function ResubmitSheet({ clientId, req, onClose, onDone }: { clientId: number; req: Req; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState(req.message);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/approvals/${clientId}/requests/${req.id}/resubmit`, { method: "POST", body: { message } });
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <Sheet title="Resubmit for review" onClose={onClose}>
      <form onSubmit={go} className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Resubmit "{req.title}"</h2>
        <p className="text-xs text-muted">This sends version {req.version + 1} to the client. Update the Drive files first if needed.</p>
        <label className="block text-xs text-ink2">
          Message to the client
          <Textarea rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 py-2" />
        </label>
        {error && <p role="alert" className="text-xs text-crit">{error}</p>}
        <div className="flex gap-2">
          <Btn type="submit" tone="primary" loading={busy}>Resubmit</Btn>
          <Btn type="button" tone="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </form>
    </Sheet>
  );
}

function NewRequestSheet({ clientId, onClose, onDone }: { clientId: number; onClose: () => void; onDone: () => void }) {
  const assets = useApi<{ assets: Asset[] }>(`/approvals/${clientId}/assets`);
  const posts = useApi<{ posts: Array<{ id: number; kind: string; caption: string; status: string }> }>(`/clients/${clientId}/publish/posts`);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [postId, setPostId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api(`/approvals/${clientId}/requests`, { method: "POST", body: { title, message, asset_ids: picked, post_id: postId ? Number(postId) : null } });
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }
  const list = assets.data?.assets ?? [];
  return (
    <Sheet title="New approval request" onClose={onClose}>
      <form onSubmit={go} className="space-y-3">
        <h2 className="text-base font-semibold text-ink">New approval request</h2>
        <label className="block text-xs text-ink2">
          Title
          <Input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-xs text-ink2">
          Message to the client
          <Textarea rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 py-2" />
        </label>
        <fieldset className="min-w-0">
          <legend className="text-xs text-ink2">Assets to review</legend>
          {assets.loading && !assets.data ? (
            <CardSkeleton lines={2} />
          ) : assets.error ? (
            <ErrorState message={assets.error} onRetry={assets.reload} />
          ) : list.length === 0 ? (
            <p className="mt-1 text-xs text-muted">No assets yet. <Link to={`/c/${clientId}/assets`} className="text-musawara-ink underline">Add one in the library</Link> first.</p>
          ) : (
            <ul className="mt-1 max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border2 p-1">
              {list.map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ink hover:bg-surface2">
                    <Checkbox checked={picked.includes(a.id)} onCheckedChange={(on) => setPicked(on ? [...picked, a.id] : picked.filter((x) => x !== a.id))} />
                    <span className="min-w-0 truncate">{a.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">{a.kind}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {(posts.data?.posts.length ?? 0) > 0 && (
          <label className="block text-xs text-ink2">
            Publish post (optional)
            <NativeSelect value={postId} onChange={(e) => setPostId(e.target.value)} className="mt-1 w-full">
              <option value="">None</option>
              {posts.data!.posts.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.kind} · {(p.caption || "No caption").slice(0, 40)}</option>)}
            </NativeSelect>
          </label>
        )}
        {error && <p role="alert" className="text-xs text-crit">{error}</p>}
        <div className="flex gap-2">
          <Btn type="submit" tone="primary" loading={busy} disabled={picked.length === 0}>Send for approval</Btn>
          <Btn type="button" tone="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </form>
    </Sheet>
  );
}

function RequestCard({ clientId, req, team, onChanged, notify }: { clientId: number; req: Req; team: boolean; onChanged: () => void; notify: (t: string, k?: "ok" | "err") => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"" | "approved" | "changes_requested">("");
  const [showHistory, setShowHistory] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const s = STATUS[req.status];

  async function decide(decision: "approved" | "changes_requested") {
    setBusy(decision);
    try {
      await api(`/approvals/${clientId}/requests/${req.id}/decision`, { method: "POST", body: { decision, comment } });
      notify(decision === "approved" ? "Approved. Thank you." : "Changes sent to the team.");
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
      setBusy("");
      onChanged(); // someone may have decided meanwhile: show the real status
    }
  }

  return (
    <li className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{req.title}</h3>
          <p className="text-xs text-muted">Version {req.version} · updated {fmtDateTime(req.updated_at)}{req.post_id ? ` · linked to post #${req.post_id}` : ""}</p>
        </div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      {req.message && <p className="mt-2 whitespace-pre-line text-sm text-ink2">{req.message}</p>}
      <AssetLinks assets={req.assets} />

      {!team && req.status === "pending" && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-ink2">
            Comment (required if you request changes)
            <Textarea rows={2} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Btn tone="primary" icon="check" loading={busy === "approved"} disabled={!!busy} onClick={() => decide("approved")}>Approve</Btn>
            <Btn loading={busy === "changes_requested"} disabled={!!busy || !comment.trim()} onClick={() => decide("changes_requested")}>Request changes</Btn>
          </div>
        </div>
      )}
      {team && req.status === "changes_requested" && (
        <div className="mt-3"><Btn tone="primary" icon="refresh" onClick={() => setResubmitting(true)}>Resubmit</Btn></div>
      )}

      <button type="button" onClick={() => setShowHistory((v) => !v)} className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-ink2 hover:text-ink" aria-expanded={showHistory}>
        {showHistory ? "Hide history" : "Show history"}
      </button>
      {showHistory && <History clientId={clientId} id={req.id} />}
      {resubmitting && (
        <ResubmitSheet clientId={clientId} req={req} onClose={() => setResubmitting(false)} onDone={() => { setResubmitting(false); notify(`Version ${req.version + 1} sent`); onChanged(); }} />
      )}
    </li>
  );
}

export function Approvals({ clientId }: { clientId: number }) {
  const { user } = useAuth();
  const team = user?.role === "admin";
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const meta = useApi<{ client: { name: string } }>(`/clients/${clientId}/meta`);
  const list = useApi<{ requests: Req[] }>(`/approvals/${clientId}/requests${status ? `?status=${status}` : ""}`);
  const { notify, node } = useNotify();

  if (denied(list.error)) return <Denied />;
  const reqs = list.data?.requests ?? [];

  return (
    <div className="space-y-4">
      {node}
      <PageHeader
        title={team ? "Approvals" : "Waiting for your approval"}
        subtitle={team ? <Link to={`/c/${clientId}`} className="hover:text-ink hover:underline">{meta.data?.client.name ?? "Client"}</Link> : undefined}
        actions={team && (
          <>
            <Link to={`/c/${clientId}/assets`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-medium text-ink2 hover:bg-surface hover:text-ink">Asset library</Link>
            <Btn tone="primary" icon="plus" onClick={() => setCreating(true)}>New request</Btn>
          </>
        )}
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium ${status === k ? "border-[var(--accent)] bg-surface2 text-ink" : "border-border text-ink2 hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {list.loading && !list.data ? (
        <div className="space-y-3"><CardSkeleton lines={4} /><CardSkeleton lines={4} /></div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : reqs.length === 0 ? (
        <EmptyState title={status ? "Nothing with this status" : team ? "No approval requests yet" : "Nothing to approve right now"} hint={team ? "Create a request to send assets to the client." : "New items from the Musawara team will show up here."} />
      ) : (
        <ul className="space-y-3">
          {reqs.map((r) => <RequestCard key={r.id} clientId={clientId} req={r} team={!!team} onChanged={list.reload} notify={notify} />)}
        </ul>
      )}

      {creating && <NewRequestSheet clientId={clientId} onClose={() => setCreating(false)} onDone={() => { setCreating(false); notify("Request sent"); list.reload(); }} />}
    </div>
  );
}

type TeamRow = { id: number; client_id: number; client_name: string; title: string; status: Status; version: number; asset_count: number; updated_at: string };

export function TeamApprovals() {
  const [status, setStatus] = useState("");
  const list = useApi<{ requests: TeamRow[] }>(`/approvals${status ? `?status=${status}` : ""}`);
  if (denied(list.error)) return <Denied />;
  const { clientId: scopeId } = useClientScope();
  const rows = (list.data?.requests ?? []).filter((r) => !scopeId || r.client_id === scopeId);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        subtitle="Requests waiting on clients, and what they answered."
        actions={
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            {FILTERS.map(([k, label]) => <option key={k} value={k}>{k ? label : "All statuses"}</option>)}
          </NativeSelect>
        }
      />
      {list.loading && !list.data ? (
        <div className="space-y-3"><CardSkeleton /><CardSkeleton /></div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={status ? "No requests with this status" : "No approval requests yet"} hint="Open a client and choose Approvals to create one." />
      ) : (
        <RowList>
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/c/${r.client_id}/approvals`} className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="text-xs text-muted">{r.client_name} · v{r.version} · {r.asset_count} asset{r.asset_count === 1 ? "" : "s"} · {fmtDateTime(r.updated_at)}</span>
                </span>
                <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
              </Link>
            </li>
          ))}
        </RowList>
      )}
    </div>
  );
}
