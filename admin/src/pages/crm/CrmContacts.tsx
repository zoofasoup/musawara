// Contacts: searchable, tag-filterable table of every gateway contact, with add/edit/delete,
// bulk tag add/remove, CSV/Excel/pasted import (with preview) and CSV export.

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTable, type ColumnDef, type PaginationState, type SortingState } from "@tanstack/react-table";
import { Download, Pencil, Search, Send, Upload } from "lucide-react";
import { crm, crmUpload } from "./crmApi";
import { csvCell } from "../../lib/csv";
import { fmtNum } from "../../lib/format";
import { Btn, ConfirmBtn, Empty, Panel, Pill, Sheet, useNotify, type Notify } from "../../components/kit";
import { Checkbox } from "@/components/ui/checkbox";
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { downloadText, ErrorPanel, Field, fmtPhone, ListSkeleton, normalizePhone, PageHead, parseTags, TagChip, useDebounced, useGateway } from "./data/shared";
import { buildPreview, readRows, type ImportPreview } from "./data/importer";

type Contact = { id: number; phone: string; name: string; notes: string; created_at: number; tags: string[] };
type ImportResult = { created: number; updated: number; invalid: Array<{ row: number; value: string }> };

const dash = <span className="text-muted">–</span>;

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="-m-2 inline-flex size-11 cursor-pointer items-center justify-center" onClick={(e) => e.target === e.currentTarget && onChange(!checked)}>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} aria-label={label} />
    </span>
  );
}

/* ---------- add / edit ---------- */

function ContactEditor({ contact, allTags, notify, onClose, onChanged }: { contact: Contact | null; allTags: string[]; notify: Notify; onClose: () => void; onChanged: () => void }) {
  const [f, setF] = useState({ name: contact?.name ?? "", phone: contact?.phone ?? "", tags: contact?.tags.join(", ") ?? "", notes: contact?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const normalized = normalizePhone(f.phone);

  const save = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      if (contact) {
        await crm(`/contacts/${contact.id}`, { method: "PUT", body: f });
        notify("Contact saved.");
      } else {
        const r = await crm<{ id: number; created: boolean }>("/contacts", { method: "POST", body: f });
        notify(r.created ? "Contact added." : "That number already existed, so the existing contact was updated.");
      }
      onChanged();
      onClose();
    } catch (e: any) {
      setErr(e.message); // the gateway's own wording, e.g. invalid number or number already used
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!contact) return;
    try {
      await crm("/contacts/delete", { method: "POST", body: { ids: [contact.id] } });
      notify("Contact deleted. Chat history is kept.");
      onChanged();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <Sheet title={contact ? "Edit contact" : "New contact"} onClose={onClose}>
      <h3 className="text-base font-semibold text-ink">{contact ? "Edit contact" : "New contact"}</h3>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Name">
          <Input value={f.name} onChange={set("name")} autoComplete="off" />
        </Field>
        <Field label="WhatsApp number" hint={f.phone ? (normalized ? `Will be saved as +${normalized}` : "Not a valid number yet. Example: 081234567890 or 6281234567890") : "Example: 081234567890 or 6281234567890"}>
          <Input value={f.phone} onChange={set("phone")} inputMode="tel" required autoComplete="off" />
        </Field>
        <Field label="Tags" hint="Separate with commas. Tags are lowercased.">
          <Input value={f.tags} onChange={set("tags")} list="crm-tag-options" placeholder="customer, jakarta" autoComplete="off" />
          <datalist id="crm-tag-options">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Notes">
          <Textarea value={f.notes} onChange={set("notes")} rows={3} className="py-2" />
        </Field>
        {err && (
          <p role="alert" className="text-xs text-crit">
            {err}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Btn tone="primary" type="submit" loading={busy}>
            {contact ? "Save changes" : "Add contact"}
          </Btn>
          {contact && <ConfirmBtn label="Delete" confirmLabel="Delete contact" onConfirm={remove} />}
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- import ---------- */

function ImportSheet({ notify, onClose, onChanged }: { notify: Notify; onClose: () => void; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [extraTags, setExtraTags] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [noPreview, setNoPreview] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setNoPreview(false);
    setProblem(undefined);
    setResult(null);
  };

  const check = async () => {
    reset();
    try {
      const rows = await readRows(file, pasted);
      setPreview(buildPreview(rows));
    } catch (e: any) {
      if (e.message === "PREVIEW_UNSUPPORTED") setNoPreview(true);
      else setProblem(e.message);
    }
  };

  const run = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const fd = new FormData();
      // Pasted text goes up as a CSV file: the gateway only reads files.
      fd.set("file", file ?? new File([pasted], "pasted.csv", { type: "text/csv" }));
      if (extraTags.trim()) fd.set("tags", extraTags);
      const r = await crmUpload<ImportResult>("/contacts/import", fd);
      setResult(r);
      notify(`Import done: ${r.created} new, ${r.updated} updated.`);
      onChanged();
    } catch (e: any) {
      setProblem(e.message);
    }
    setBusy(false);
  };

  const hasInput = Boolean(file) || pasted.trim().length > 0;
  const count = preview?.valid.length ?? 0;

  return (
    <Sheet title="Import contacts" onClose={onClose}>
      <h3 className="text-base font-semibold text-ink">Import contacts</h3>
      {result ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-ink">
            <b>{fmtNum(result.created)}</b> new contacts, <b>{fmtNum(result.updated)}</b> updated.
          </p>
          {result.invalid.length > 0 && (
            <div className="rounded-lg border border-crit/30 bg-crit/5 p-3 text-xs text-crit">
              <p className="font-medium">{fmtNum(result.invalid.length)} invalid numbers were skipped</p>
              <p className="mt-1 break-words text-ink2">
                {result.invalid.slice(0, 15).map((x) => `row ${x.row} (${x.value})`).join(", ")}
                {result.invalid.length > 15 ? ", ..." : ""}
              </p>
            </div>
          )}
          <Btn tone="primary" onClick={onClose}>
            Done
          </Btn>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            A .csv, .xlsx or .xls file, or pasted CSV text, with headers in the first row. A phone column is required (Nomor, No HP, WA, Phone). Optional: Nama, Tag, Catatan. Numbers that already exist are updated, never duplicated, and a blank name or note never overwrites an existing one.
          </p>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                reset();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Btn onClick={() => fileRef.current?.click()}>
                <Upload className="size-4" />
                {file ? "Change file" : "Choose file"}
              </Btn>
              {file && <span className="min-w-0 break-all text-xs text-ink2">{file.name}</span>}
            </div>
          </div>
          {!file && (
            <Field label="Or paste CSV text" hint="First line is the header, for example: Nama,Nomor,Tag">
              <Textarea
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  reset();
                }}
                rows={5}
                className="py-2 font-mono text-xs"
                placeholder={"Nama,Nomor,Tag\nBudi,081234567890,customer"}
              />
            </Field>
          )}
          <Field label="Add these tags to every contact (optional)">
            <Input value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="event-padel" autoComplete="off" />
          </Field>

          {problem && (
            <p role="alert" className="text-xs text-crit">
              {problem}
            </p>
          )}

          {preview && (
            <div className="space-y-2 rounded-xl border border-border bg-surface2 p-3 text-xs">
              <p className="text-ink">
                <b>{fmtNum(preview.total)}</b> rows read: <b className="text-good">{fmtNum(count)}</b> valid
                {preview.invalid.length > 0 && (
                  <>
                    , <b className="text-crit">{fmtNum(preview.invalid.length)}</b> invalid
                  </>
                )}
                {preview.duplicates > 0 && <>, {fmtNum(preview.duplicates)} repeat a number in this file</>}.
              </p>
              <p className="text-muted">
                Columns: phone = {preview.cols.phone}; name = {preview.cols.name ?? "none"}; tags = {preview.cols.tags ?? "none"}; notes = {preview.cols.notes ?? "none"}
              </p>
              {preview.valid.slice(0, 5).map((r) => (
                <div key={r.line} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-2">
                  <span className="min-w-0 break-words font-medium text-ink">{r.name || "No name"}</span>
                  <span className="tnum text-ink2">{fmtPhone(r.phone)}</span>
                  {r.tags.map((t) => (
                    <TagChip key={t}>{t}</TagChip>
                  ))}
                </div>
              ))}
              {preview.valid.length > 5 && <p className="text-muted">and {fmtNum(preview.valid.length - 5)} more</p>}
              {preview.invalid.length > 0 && (
                <p className="break-words text-crit">
                  Will be skipped: {preview.invalid.slice(0, 8).map((x) => `row ${x.line} (${x.value})`).join(", ")}
                  {preview.invalid.length > 8 ? ", ..." : ""}
                </p>
              )}
            </div>
          )}
          {noPreview && <p className="text-xs text-muted">.xls files cannot be previewed here. The gateway can still import them.</p>}

          <div className="flex flex-wrap gap-2">
            {!preview && !noPreview ? (
              <Btn tone="primary" disabled={!hasInput} onClick={() => void check()}>
                Preview
              </Btn>
            ) : (
              <Btn tone="primary" loading={busy} disabled={preview != null && count === 0} onClick={() => void run()}>
                {preview ? `Import ${fmtNum(count)} contacts` : "Import"}
              </Btn>
            )}
            {(preview || noPreview) && <Btn onClick={reset}>Back</Btn>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- page ---------- */

export function CrmContacts() {
  const { notify, node } = useNotify();
  const navigate = useNavigate();
  const list = useGateway<Contact[]>("/contacts");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 200);
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [bulkTag, setBulkTag] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const rows = list.data ?? [];
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of rows) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const filtered = useMemo(() => {
    const s = dq.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    const alt = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
    return rows.filter(
      (c) => (!tag || c.tags.includes(tag)) && (!s || c.name.toLowerCase().includes(s) || (digits && (c.phone.includes(digits) || c.phone.includes(alt))))
    );
  }, [rows, dq, tag]);

  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const toggle = (id: number, on: boolean) =>
    setSelected((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const toggleAll = (on: boolean) =>
    setSelected((p) => {
      const n = new Set(p);
      filtered.forEach((c) => (on ? n.add(c.id) : n.delete(c.id)));
      return n;
    });

  const columns = useMemo<ColumnDef<DataGridFeatures, Contact>[]>(
    () => [
      {
        id: "select",
        size: 52,
        enableSorting: false,
        header: () => <Check checked={allSelected} onChange={toggleAll} label="Select all matching contacts" />,
        cell: ({ row }) => <Check checked={selected.has(row.original.id)} onChange={(v) => toggle(row.original.id, v)} label={`Select ${row.original.name || row.original.phone}`} />,
        meta: { headerTitle: "Select" },
      },
      {
        accessorKey: "name",
        size: 190,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Name" />,
        cell: ({ row }) => <span className="block max-w-[14rem] truncate">{row.original.name || dash}</span>,
        meta: { headerTitle: "Name" },
      },
      {
        accessorKey: "phone",
        size: 150,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Number" />,
        cell: ({ row }) => <span className="tnum whitespace-nowrap">{fmtPhone(row.original.phone)}</span>,
        meta: { headerTitle: "Number" },
      },
      {
        id: "tags",
        size: 220,
        enableSorting: false,
        accessorFn: (r) => r.tags.join(" "),
        header: () => <span>Tags</span>,
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.tags.length ? row.original.tags.map((t) => <TagChip key={t}>{t}</TagChip>) : dash}
          </span>
        ),
        meta: { headerTitle: "Tags" },
      },
      {
        accessorKey: "notes",
        size: 220,
        enableSorting: false,
        header: () => <span>Notes</span>,
        cell: ({ row }) => <span className="block max-w-[16rem] truncate text-ink2" title={row.original.notes}>{row.original.notes || dash}</span>,
        meta: { headerTitle: "Notes" },
      },
      {
        id: "edit",
        size: 60,
        enableSorting: false,
        header: () => <span className="sr-only">Edit</span>,
        cell: ({ row }) => (
          <button type="button" aria-label={`Edit ${row.original.name || row.original.phone}`} onClick={() => setEditing(row.original)} className="-m-1 inline-flex size-11 items-center justify-center rounded-lg text-ink2 hover:bg-secondary hover:text-ink">
            <Pencil className="size-4" />
          </button>
        ),
        meta: { headerTitle: "Edit" },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, allSelected, filtered]
  );

  const table = useTable({
    features: dataGridFeatures,
    data: filtered,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const firstPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));
  const chosen = rows.filter((c) => selected.has(c.id));

  const exportCsv = (src: Contact[]) => {
    const head = "Nama,Nomor,Tag,Catatan";
    const lines = src.map((c) => [c.name, c.phone, c.tags.join(","), c.notes].map(csvCell).join(","));
    downloadText(`contacts-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...lines].join("\n"));
  };

  const deleteSelected = async () => {
    try {
      const r = await crm<{ deleted: number }>("/contacts/delete", { method: "POST", body: { ids: chosen.map((c) => c.id) } });
      notify(`${r.deleted} contacts deleted. Chat history is kept.`);
      setSelected(new Set());
      list.reload();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  // The gateway has no bulk-tag endpoint: change each contact through PUT with its full record.
  const bulkTags = async (mode: "add" | "remove") => {
    const tags = parseTags(bulkTag);
    if (!tags.length) return notify("Type a tag first.", "err");
    const jobs = chosen
      .map((c) => ({ c, next: mode === "add" ? [...new Set([...c.tags, ...tags])] : c.tags.filter((t) => !tags.includes(t)) }))
      .filter((j) => j.next.length !== j.c.tags.length || j.next.some((t) => !j.c.tags.includes(t)));
    if (!jobs.length) return notify(mode === "add" ? "Everyone selected already has that tag." : "None of the selected contacts has that tag.");
    setBulkBusy(true);
    let failed = 0;
    let i = 0;
    const worker = async () => {
      while (i < jobs.length) {
        const { c, next } = jobs[i++];
        try {
          await crm(`/contacts/${c.id}`, { method: "PUT", body: { name: c.name, phone: c.phone, notes: c.notes, tags: next } });
        } catch {
          failed++;
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setBulkBusy(false);
    list.reload();
    if (failed) notify(`${jobs.length - failed} updated, ${failed} failed. Try again for the rest.`, "err");
    else notify(`${mode === "add" ? "Added" : "Removed"} "${tags.join(", ")}" on ${jobs.length} contacts.`);
  };

  return (
    <div className="space-y-4">
      {node}
      <PageHead
        title="Contacts"
        hint="Everyone you can message on WhatsApp. Numbers are cleaned automatically: 0812..., +62 812... and 812... all become 62812...."
        actions={
          <>
            <Btn onClick={() => setImporting(true)}>
              <Upload className="size-4" />
              Import
            </Btn>
            <Btn onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
              <Download className="size-4" />
              Export
            </Btn>
            <Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>
              Add contact
            </Btn>
          </>
        }
      />

      {list.error && !list.data ? (
        <ErrorPanel error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <ListSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <Empty
          icon="users"
          title="No contacts yet"
          hint="Add one by hand or import a CSV or Excel file. Contacts can then be tagged and used as broadcast recipients."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>
                Add contact
              </Btn>
              <Btn onClick={() => setImporting(true)}>Import file</Btn>
            </div>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative min-w-[12rem] flex-1 text-xs text-muted">
              <span className="sr-only">Search contacts</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); firstPage(); }} placeholder="Search name or number" className="pl-9" />
            </label>
            <NativeSelect value={tag} onChange={(e) => { setTag(e.target.value); firstPage(); }} className="sm:min-w-[11rem]" aria-label="Filter by tag">
              <option value="">All tags</option>
              {tagCounts.map(([t, n]) => (
                <option key={t} value={t}>
                  {t} ({n})
                </option>
              ))}
            </NativeSelect>
          </div>

          {chosen.length > 0 && (
            <Panel className="space-y-3 border-[var(--accent)]/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="accent">{fmtNum(chosen.length)} selected</Pill>
                <Btn tone="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Btn>
                <Btn onClick={() => navigate("/crm/broadcasts", { state: { contactIds: chosen.map((c) => c.id) } })}>
                  <Send className="size-4" />
                  Broadcast to these
                </Btn>
                <Btn onClick={() => exportCsv(chosen)}>
                  <Download className="size-4" />
                  Export selected
                </Btn>
                <ConfirmBtn label="Delete" confirmLabel={`Delete ${chosen.length} contacts`} onConfirm={() => void deleteSelected()} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} list="crm-bulk-tags" placeholder="Tag to add or remove" aria-label="Tag to add or remove" className="sm:max-w-[16rem]" />
                <datalist id="crm-bulk-tags">
                  {tagCounts.map(([t]) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <Btn loading={bulkBusy} onClick={() => void bulkTags("add")}>
                  Add tag
                </Btn>
                <Btn loading={bulkBusy} onClick={() => void bulkTags("remove")}>
                  Remove tag
                </Btn>
              </div>
            </Panel>
          )}

          <p className="text-xs text-muted" aria-live="polite">
            {fmtNum(filtered.length)} of {fmtNum(rows.length)} contacts
          </p>

          {filtered.length === 0 ? (
            <Empty
              icon="users"
              title="No contacts match"
              hint="Try a different search or tag."
              action={
                <Btn onClick={() => { setQ(""); setTag(""); }}>Clear filters</Btn>
              }
            />
          ) : (
            <DataGrid table={table} recordCount={filtered.length} className="space-y-3">
              <DataGridContainer className="bg-card">
                <DataGridTable />
              </DataGridContainer>
              <DataGridPagination />
            </DataGrid>
          )}
        </>
      )}

      {editing && <ContactEditor key={editing === "new" ? "new" : editing.id} contact={editing === "new" ? null : editing} allTags={tagCounts.map(([t]) => t)} notify={notify} onClose={() => setEditing(null)} onChanged={list.reload} />}
      {importing && <ImportSheet notify={notify} onClose={() => setImporting(false)} onChanged={list.reload} />}
    </div>
  );
}
