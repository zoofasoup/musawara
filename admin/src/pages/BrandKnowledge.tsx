// Brand knowledge: what the agency knows about a client's brand. Admins edit,
// clients read. "Copy for AI" gives the filled sections as one markdown prompt.

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { api, useApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";
import { Btn } from "../components/kit";

type Section = { key: string; label: string; hint: string; body: string; updated_at: string | null; updated_by: string | null };
type Link = { id: number; label: string; url: string };
type Brand = { sections: Section[]; links: Link[]; markdown: string };


function SectionCard({ clientId, s, canEdit, onSaved }: { clientId: number; s: Section; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      await api(`/admin/clients/${clientId}/brand/${s.key}`, { method: "PUT", body: { body: draft } });
      setEditing(false);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{s.label}</h3>
        {canEdit && !editing && (
          <Btn tone="secondary"
           
            onClick={() => {
              setDraft(s.body);
              setEditing(true);
            }}
          >
            {s.body ? "Edit" : "Add"}
          </Btn>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            placeholder={s.hint}
            className="w-full rounded-lg border border-border2 bg-bg p-3 text-sm text-ink focus:outline-none"
          />
          {error && <p className="text-xs text-crit">{error}</p>}
          <div className="flex gap-2">
            <Btn tone="secondary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Btn>
            <Btn tone="secondary" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      ) : s.body ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink2">{s.body}</p>
          {s.updated_at && (
            <p className="mt-2 text-xs text-muted">
              Updated {s.updated_at.slice(0, 10)}
              {s.updated_by ? ` by ${s.updated_by}` : ""}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">{s.hint}</p>
      )}
    </section>
  );
}

function LinksPanel({ clientId, links, canEdit, onChanged }: { clientId: number; links: Link[]; canEdit: boolean; onChanged: () => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      await api(`/admin/clients/${clientId}/brand-links`, { body: { label, url } });
      setLabel("");
      setUrl("");
      onChanged();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!links.length && !canEdit) return null;
  return (
    <div>
      <SectionTitle>References</SectionTitle>
      <div className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-4">
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-musawara underline-offset-2 hover:underline">
                {l.label}
              </a>
              {canEdit && (
                <button
                  className="text-xs text-muted hover:text-crit"
                  onClick={async () => {
                    await api(`/admin/clients/${clientId}/brand-links/${l.id}`, { method: "DELETE" });
                    onChanged();
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form onSubmit={add} className="mt-3 flex flex-wrap gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Logo folder)" required className="min-w-0 flex-1 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm text-ink" />
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required className="min-w-0 flex-[2] rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm text-ink" />
            <Btn tone="secondary" type="submit">Add link</Btn>
            {error && <p className="w-full text-xs text-crit">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

export function BrandKnowledge({ clientId }: { clientId: number }) {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const { data, error, loading, reload } = useApi<Brand>(`/clients/${clientId}/brand`);
  const [copied, setCopied] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <CardSkeleton lines={6} />;

  const visible = canEdit ? data.sections : data.sections.filter((s) => s.body.trim());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Brand knowledge</h1>
        <Btn tone="secondary"
         
          onClick={async () => {
            await navigator.clipboard.writeText(data.markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy for AI"}
        </Btn>
      </div>
      {visible.length === 0 ? (
        <EmptyState title="No brand knowledge yet" hint="The team has not filled this in." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((s) => (
            <SectionCard key={s.key + s.updated_at} clientId={clientId} s={s} canEdit={canEdit} onSaved={reload} />
          ))}
        </div>
      )}
      <LinksPanel clientId={clientId} links={data.links} canEdit={canEdit} onChanged={reload} />
    </div>
  );
}
