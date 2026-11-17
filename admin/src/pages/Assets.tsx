// Asset library for one client (team only). Files live on Google Drive: we store the link, never the file.

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "../components/PageHeader";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { CardSkeleton, EmptyState, ErrorState } from "../components/ui";
import { Btn, ConfirmBtn, CopyBtn, Pill, Sheet, useNotify } from "../components/kit";
import { Icon } from "../components/icons";

export type Asset = { id: number; title: string; kind: "image" | "video" | "doc" | "other"; drive_url: string; tags: string[]; notes: string; created_at: string };
const KINDS = [["image", "Image"], ["video", "Video"], ["doc", "Document"], ["other", "Other"]] as const;
const KIND_NAME: Record<string, string> = Object.fromEntries(KINDS);
const KIND_ICON = { image: "image", video: "camera", doc: "board", other: "link" } as const;
const isDriveUrl = (s: string) => {
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" && (u.hostname === "drive.google.com" || u.hostname === "docs.google.com");
  } catch {
    return false;
  }
};

function AssetForm({ clientId, asset, onClose, onSaved }: { clientId: number; asset: Asset | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: asset?.title ?? "", kind: asset?.kind ?? "image", drive_url: asset?.drive_url ?? "", tags: asset?.tags.join(", ") ?? "", notes: asset?.notes ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const urlBad = f.drive_url.trim() !== "" && !isDriveUrl(f.drive_url);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await api(`/approvals/${clientId}/assets${asset ? `/${asset.id}` : ""}`, { method: asset ? "PUT" : "POST", body: f });
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <Sheet title={asset ? "Edit asset" : "Add asset"} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <h2 className="text-base font-semibold text-ink">{asset ? "Edit asset" : "Add asset"}</h2>
        <label className="block text-xs text-ink2">
          Title
          <Input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="mt-1" />
        </label>
        <label className="block text-xs text-ink2">
          Type
          <NativeSelect value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Asset["kind"] })} className="mt-1 w-full">
            {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </NativeSelect>
        </label>
        <label className="block text-xs text-ink2">
          Google Drive link
          <Input required type="url" inputMode="url" placeholder="https://drive.google.com/file/d/..." value={f.drive_url} onChange={(e) => setF({ ...f, drive_url: e.target.value })} aria-invalid={urlBad} className="mt-1" />
          <span className={`mt-1 block ${urlBad ? "text-crit" : "text-muted"}`}>{urlBad ? "Only https links on drive.google.com or docs.google.com." : "Set sharing so the client can open it."}</span>
        </label>
        <label className="block text-xs text-ink2">
          Tags (comma separated)
          <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="reel, padel, 11.11" className="mt-1" />
        </label>
        <label className="block text-xs text-ink2">
          Notes
          <Textarea rows={3} maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="mt-1 py-2" />
        </label>
        {error && <p role="alert" className="text-xs text-crit">{error}</p>}
        <div className="flex gap-2">
          <Btn type="submit" tone="primary" loading={saving} disabled={urlBad}>{asset ? "Save changes" : "Add asset"}</Btn>
          <Btn type="button" tone="ghost" onClick={onClose}>Cancel</Btn>
        </div>
      </form>
    </Sheet>
  );
}

export function Assets({ clientId }: { clientId: number }) {
  const meta = useApi<{ client: { name: string } }>(`/clients/${clientId}/meta`);
  const list = useApi<{ assets: Asset[] }>(`/approvals/${clientId}/assets`);
  const { notify, node } = useNotify();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Asset | "new" | null>(null);

  const all = list.data?.assets ?? [];
  const tags = useMemo(() => [...new Set(all.flatMap((a) => a.tags))].sort(), [all]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((a) => (!tag || a.tags.includes(tag)) && (!kind || a.kind === kind) && (!needle || `${a.title} ${a.notes} ${a.tags.join(" ")}`.toLowerCase().includes(needle)));
  }, [all, q, tag, kind]);

  async function remove(a: Asset) {
    try {
      await api(`/approvals/${clientId}/assets/${a.id}`, { method: "DELETE" });
      notify("Asset deleted");
      list.reload();
    } catch (e: any) {
      notify(e.message, "err");
    }
  }

  if (list.error?.toLowerCase().includes("forbidden")) return <ErrorState message="Only the Musawara team can manage the asset library." />;

  return (
    <div className="space-y-4">
      {node}
      <PageHeader
        title="Asset library"
        subtitle={<Link to={`/c/${clientId}`} className="hover:text-ink hover:underline">{meta.data?.client.name ?? "Client"}</Link>}
        actions={
          <>
            <Link to={`/c/${clientId}/approvals`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-medium text-ink2 hover:bg-surface hover:text-ink">Approvals</Link>
            <Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>Add asset</Btn>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, notes, tags" aria-label="Search assets" className="w-full sm:w-72" />
        <NativeSelect value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by tag">
          <option value="">All tags</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </NativeSelect>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </NativeSelect>
      </div>

      {list.loading && !list.data ? (
        <div className="grid gap-3 sm:grid-cols-2"><CardSkeleton /><CardSkeleton /></div>
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : all.length === 0 ? (
        <EmptyState title="No assets yet" hint="Add a Google Drive link to start the library." />
      ) : shown.length === 0 ? (
        <EmptyState title="No assets match" hint="Try another search or clear the filters." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-ink2"><Icon name={KIND_ICON[a.kind]} className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <a href={a.drive_url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-ink hover:underline">{a.title}</a>
                  <p className="text-xs text-muted">{KIND_NAME[a.kind]} · added {fmtDateTime(a.created_at)}</p>
                  {a.notes && <p className="mt-1 whitespace-pre-line text-xs text-ink2">{a.notes}</p>}
                  {a.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.tags.map((t) => (
                        <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full"><Pill>{t}</Pill></button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1">
                <CopyBtn text={a.drive_url} label="Copy link" />
                <Btn tone="ghost" onClick={() => setEditing(a)}>Edit</Btn>
                <ConfirmBtn label="Delete" onConfirm={() => remove(a)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <AssetForm
          clientId={clientId}
          asset={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            notify(editing === "new" ? "Asset added" : "Asset saved");
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}
