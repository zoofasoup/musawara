// Saved sales as a data grid: sort, search, filter by month, closer and
// Meta state, toggle columns, page through, export what is on screen.

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useTable, type ColumnDef, type PaginationState, type SortingState, type ColumnVisibilityState } from "@tanstack/react-table";
import { Columns3, Download, Pencil } from "lucide-react";
import { csvCell } from "../lib/csv";
import { fmtDayFull, fmtNum, fmtRp } from "../lib/format";
import { Btn, ConfirmBtn, Panel, Pill, Sheet, type Notify, type Tone } from "../components/kit";
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";

export type SavedSale = {
  id: number;
  edited_at: string | null;
  sale_date: string;
  label: string | null;
  value: number;
  source: string | null;
  consultant: string | null;
  meta_state: string;
  departure_date: string | null;
  package_name: string | null;
  room_type: string | null;
  down_payment: number | null;
  pay_status: string | null;
};

const PAY: Record<string, { label: string; tone: Tone }> = {
  dp: { label: "DP", tone: "warn" },
  paid: { label: "Lunas", tone: "good" },
  cancelled: { label: "Batal", tone: "crit" },
};

const STATES = [["all", "All"], ["dashboard", "Dashboard only"], ["sent", "Sent to Meta"]] as const;
type State = (typeof STATES)[number][0];

const dash = <span className="text-muted">–</span>;

const makeColumns = (onEdit: (s: SavedSale) => void): ColumnDef<DataGridFeatures, SavedSale>[] => [
  {
    accessorKey: "sale_date",
    size: 120,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Date" />,
    cell: ({ row }) => <span className="tnum">{fmtDayFull(row.original.sale_date)}</span>,
    meta: { headerTitle: "Date" },
  },
  {
    accessorKey: "label",
    size: 110,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Who" />,
    cell: ({ row }) => (
      <span>
        {row.original.label || dash}
        {row.original.edited_at && <span className="ml-1 text-xs text-muted" title="Edited by hand">·edited</span>}
      </span>
    ),
    meta: { headerTitle: "Who" },
  },
  {
    accessorKey: "value",
    size: 140,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Value" />,
    cell: ({ row }) => <span className="tnum whitespace-nowrap">{fmtRp(row.original.value)}</span>,
    meta: { headerTitle: "Value", cellClassName: "text-right", headerClassName: "text-right" },
  },
  {
    accessorKey: "consultant",
    size: 90,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Closer" />,
    cell: ({ row }) => row.original.consultant || dash,
    meta: { headerTitle: "Closer" },
  },
  {
    accessorKey: "departure_date",
    size: 105,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Departure" />,
    cell: ({ row }) => (row.original.departure_date ? <span className="tnum">{fmtDayFull(row.original.departure_date)}</span> : dash),
    meta: { headerTitle: "Departure" },
  },
  {
    id: "package",
    size: 105,
    accessorFn: (r) => [r.package_name, r.room_type].filter(Boolean).join(" · "),
    header: ({ column }) => <DataGridColumnHeader column={column} title="Package" />,
    cell: ({ getValue }) => (getValue<string>() || dash),
    meta: { headerTitle: "Package" },
  },
  {
    accessorKey: "down_payment",
    size: 120,
    header: ({ column }) => <DataGridColumnHeader column={column} title="DP" />,
    cell: ({ row }) => (row.original.down_payment != null ? <span className="tnum whitespace-nowrap">{fmtRp(row.original.down_payment)}</span> : dash),
    meta: { headerTitle: "DP", cellClassName: "text-right", headerClassName: "text-right" },
  },
  {
    accessorKey: "pay_status",
    size: 80,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const p = row.original.pay_status && PAY[row.original.pay_status];
      return p ? <Pill tone={p.tone}>{p.label}</Pill> : dash;
    },
    meta: { headerTitle: "Status" },
  },
  {
    accessorKey: "source",
    size: 140,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Source" />,
    cell: ({ row }) => <span className="block max-w-[10rem] truncate" title={row.original.source ?? ""}>{row.original.source || "–"}</span>,
    meta: { headerTitle: "Source" },
  },
  {
    accessorKey: "meta_state",
    size: 130,
    header: ({ column }) => <DataGridColumnHeader column={column} title="Meta" />,
    cell: ({ row }) => (row.original.meta_state === "sent" ? <Pill tone="good" icon="check">Sent</Pill> : <Pill tone="neutral">Dashboard only</Pill>),
    meta: { headerTitle: "Meta" },
  },
  {
    id: "edit",
    size: 56,
    enableSorting: false,
    enableHiding: false,
    header: () => <span className="sr-only">Edit</span>,
    cell: ({ row }) => (
      <button type="button" aria-label={`Edit ${row.original.label ?? "sale"}`} onClick={() => onEdit(row.original)} className="inline-flex size-9 items-center justify-center rounded-lg text-ink2 hover:bg-secondary hover:text-ink">
        <Pencil className="size-4" />
      </button>
    ),
    meta: { headerTitle: "Edit" },
  },
];

function exportCsv(rows: SavedSale[]) {
  const head = ["Date", "Who", "Value", "Closer", "Departure", "Package", "Room", "DP", "Status", "Source", "Meta"];
  const lines = rows.map((r) =>
    [r.sale_date, r.label, r.value, r.consultant, r.departure_date, r.package_name, r.room_type, r.down_payment, r.pay_status, r.source, r.meta_state === "sent" ? "sent" : "dashboard only"]
      .map(csvCell)
      .join(",")
  );
  const url = URL.createObjectURL(new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


const PAY_OPTIONS = [["", "Unknown"], ["dp", "DP"], ["paid", "Lunas"], ["cancelled", "Batal (cancelled)"]] as const;

function SaleEditor({ sale, notify, onClose, onChanged }: { sale: SavedSale; notify: Notify; onClose: () => void; onChanged: () => void }) {
  const sent = sale.meta_state === "sent";
  const [f, setF] = useState({
    label: sale.label ?? "",
    sale_date: sale.sale_date,
    value: String(sale.value),
    consultant: sale.consultant ?? "",
    departure_date: sale.departure_date ?? "",
    package_name: sale.package_name ?? "",
    room_type: sale.room_type ?? "",
    down_payment: sale.down_payment != null ? String(sale.down_payment) : "",
    pay_status: sale.pay_status ?? "",
    source: sale.source ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    const body: Record<string, unknown> = {
      label: f.label,
      consultant: f.consultant,
      source: f.source,
      package_name: f.package_name,
      room_type: f.room_type,
      departure_date: f.departure_date || null,
      down_payment: f.down_payment === "" ? null : Number(f.down_payment),
      pay_status: f.pay_status || null,
    };
    if (!sent) {
      body.sale_date = f.sale_date;
      body.value = Number(f.value);
    }
    setBusy(true);
    try {
      await api(`/admin/conversions/sales/${sale.id}`, { method: "PATCH", body });
      notify("Sale updated.");
      onChanged();
      onClose();
    } catch (e: any) {
      notify(e.message, "err");
    }
    setBusy(false);
  };

  const remove = async () => {
    try {
      await api(`/admin/conversions/sales/${sale.id}`, { method: "DELETE" });
      notify("Sale deleted. Uploading the same file again will not bring it back.");
      onChanged();
      onClose();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  const field = (label: string, k: keyof typeof f, props: Record<string, unknown> = {}, locked = false) => (
    <label className="block text-xs text-muted">{label}
      <Input value={f[k]} onChange={set(k)} disabled={locked} className="mt-1 disabled:opacity-60" {...props} />
    </label>
  );

  return (
    <Sheet title="Edit sale" onClose={onClose}>
      <h3 className="text-base font-semibold text-ink">Edit sale</h3>
      <p className="mt-1 text-xs text-muted">
        {sent
          ? "Sent to Meta: the date and value are locked because Meta already holds them. Everything else can change, and you can mark it cancelled."
          : "Not sent to Meta yet: every field can change."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2">{field("Who (label)", "label")}</div>
        {field("Date", "sale_date", { type: "date" }, sent)}
        {field("Value (Rp)", "value", { type: "number", inputMode: "numeric", min: 0 }, sent)}
        {field("Closer", "consultant")}
        {field("Departure", "departure_date", { type: "date" })}
        {field("Package", "package_name")}
        {field("Room", "room_type")}
        {field("DP (Rp)", "down_payment", { type: "number", inputMode: "numeric", min: 0 })}
        <label className="block text-xs text-muted">Status
          <NativeSelect value={f.pay_status} onChange={set("pay_status")} className="mt-1 w-full sm:w-auto">
            {PAY_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </label>
        <div className="col-span-2">{field("Source", "source")}</div>
      </div>
      {sale.edited_at && <p className="mt-3 text-xs text-muted">Edited by hand. A later upload of the original file will not overwrite this.</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Btn tone="primary" onClick={save} loading={busy}>Save changes</Btn>
        {sent ? (
          <span className="text-xs text-muted">Sent sales cannot be deleted.</span>
        ) : (
          <ConfirmBtn label="Delete" confirmLabel="Delete sale" onConfirm={remove} />
        )}
      </div>
    </Sheet>
  );
}

export function SalesGrid({ rows, months, notify, onChanged }: { rows: SavedSale[]; months: Array<{ month: string }>; notify: Notify; onChanged: () => void }) {
  const [editing, setEditing] = useState<SavedSale | null>(null);
  const columns = useMemo(() => makeColumns(setEditing), []);
  const [state, setState] = useState<State>("all");
  const [month, setMonth] = useState("");
  const [closer, setCloser] = useState("");
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "sale_date", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({ down_payment: false, source: false });

  const closers = useMemo(() => [...new Set(rows.map((r) => r.consultant).filter(Boolean) as string[])].sort(), [rows]);

  const monthRows = useMemo(() => rows.filter((r) => !month || r.sale_date.startsWith(month)), [rows, month]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthRows.filter(
      (r) =>
        (state === "all" || (state === "sent") === (r.meta_state === "sent")) &&
        (!closer || r.consultant === closer) &&
        (!q || [r.label, r.consultant, r.source, r.package_name, r.room_type].some((f) => f?.toLowerCase().includes(q)))
    );
  }, [monthRows, state, closer, query]);

  // Per-closer totals follow the month filter and skip cancelled sales (same rule as the dashboard).
  const byCloser = useMemo(() => {
    const m = new Map<string, { n: number; value: number }>();
    for (const r of monthRows) {
      if (r.pay_status === "cancelled") continue;
      const k = r.consultant || "(no closer)";
      const c = m.get(k) ?? { n: 0, value: 0 };
      c.n += 1;
      c.value += r.value;
      m.set(k, c);
    }
    const total = [...m.values()].reduce((s, c) => s + c.value, 0);
    return [...m].map(([name, c]) => ({ name, ...c, share: total ? Math.round((c.value / total) * 100) : 0 })).sort((a, b) => b.value - a.value);
  }, [monthRows]);

  const table = useTable({
    features: dataGridFeatures,
    data: filtered,
    columns,
    state: { sorting, pagination, columnVisibility: visibility },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setVisibility,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">Month
          <NativeSelect value={month} onChange={(e) => { setMonth(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }} className="mt-1 min-w-[9rem]">
            <option value="">All months</option>
            {months.map((m) => <option key={m.month} value={m.month}>{m.month}</option>)}
          </NativeSelect>
        </label>
        <label className="text-xs text-muted">Closer
          <NativeSelect value={closer} onChange={(e) => { setCloser(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }} className="mt-1 min-w-[9rem]">
            <option value="">All closers</option>
            {closers.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </label>
        <label className="min-w-[10rem] flex-1 text-xs text-muted">Search
          <Input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPagination((p) => ({ ...p, pageIndex: 0 })); }} placeholder="Name, closer, source, package" className="mt-1" />
        </label>
      </div>

      <DataGrid table={table} recordCount={filtered.length} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filter sales" className="inline-flex rounded-lg bg-surface3 p-0.5">
          {STATES.map(([k, l]) => (
            <button key={k} onClick={() => { setState(k); setPagination((p) => ({ ...p, pageIndex: 0 })); }} aria-pressed={state === k} className={`inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium lg:min-h-8 ${state === k ? "bg-surface text-ink shadow-sm" : "text-ink2 hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <DataGridColumnVisibility table={table} trigger={<Btn icon={undefined}><Columns3 className="h-4 w-4" />Columns</Btn>} />
          <Btn onClick={() => exportCsv(filtered)} disabled={!filtered.length}><Download className="h-4 w-4" />Export CSV</Btn>
        </div>
      </div>

      <p className="text-xs text-muted">{fmtNum(filtered.length)} of {fmtNum(rows.length)} sales</p>

        <DataGridContainer className="bg-card">
          <DataGridTable />
        </DataGridContainer>
        <DataGridPagination />
      </DataGrid>

      <div className="pt-3">
        <p className="mb-1.5 text-xs font-medium text-ink">By closer{month ? ` · ${month}` : ""}</p>
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <tr><th className="px-3 py-2">Closer</th><th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">Average</th><th className="px-3 py-2 text-right">Share</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {byCloser.map((c) => (
                <tr key={c.name}>
                  <td className="px-3 py-2 font-medium text-ink">{c.name}</td>
                  <td className="tnum px-3 py-2 text-right text-ink2">{fmtNum(c.n)}</td>
                  <td className="tnum px-3 py-2 text-right text-ink2">{fmtRp(c.value)}</td>
                  <td className="tnum px-3 py-2 text-right text-ink2">{fmtRp(c.n ? c.value / c.n : 0)}</td>
                  <td className="tnum px-3 py-2 text-right text-ink2">{c.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      {editing && <SaleEditor key={editing.id} sale={editing} notify={notify} onClose={() => setEditing(null)} onChanged={onChanged} />}
    </div>
  );
}
