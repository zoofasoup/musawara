// The living style guide: every shared component in every state it can be in. Team only, not in the menu.
// Rule of this app: build a screen from these, and if a state is missing here, add it here first.
import { useMemo, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, PanelLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { PillNav, pillTabCls } from "../components/PillNav";
import { StatusBadge } from "../components/ui";
import { Callout } from "../components/Callout";
import { DataTable } from "../components/DataTable";
import { FormField, FormGrid } from "../components/FormField";
import { AskBtn, Chip, DashedBtn, FilterBtn, GlowBtn, IconTile, RaisedBtn, SearchField, Segmented, StepperAction } from "../components/Controls";
import { Bubble } from "./crm/inbox/ThreadView";
import type { Msg } from "./crm/inbox/util";
import { PageHeader } from "../components/PageHeader";
import { Kanban } from "../components/Kanban";
import { Btn, ConfirmBtn, CopyBtn, Empty, Nested, Panel, Pill, RowList, Sheet, useNotify, type Tone } from "../components/kit";
import { CardSkeleton, ErrorState } from "../components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const TONES: Tone[] = ["neutral", "good", "warn", "crit", "info", "accent"];

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid items-start gap-2 sm:grid-cols-[9rem_1fr]">
      <p className="pt-2.5 text-xs text-muted">{label}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

const PIC = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='violet'/><stop offset='1' stop-color='skyblue'/></linearGradient></defs><rect width='320' height='240' fill='url(#g)'/></svg>");

/** A 3 second 440 Hz tone as a WAV, so the voice-note player has something real to play in the demo. */
function toneUrl() {
  const rate = 8000, n = rate * 3;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128 + Math.round(40 * Math.sin((2 * Math.PI * 440 * i) / rate) * Math.min(1, (n - i) / 800)));
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
function ControlsDemo() {
  const [align, setAlign] = useState<"l" | "c" | "r">("l");
  const [mins, setMins] = useState(30);
  const [filters, setFilters] = useState(2);
  const [chip, setChip] = useState(true);
  const [seg, setSeg] = useState("week");
  return (
    <div className="flex flex-col gap-5 rounded-3xl bg-surface2 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <AskBtn />
        {chip ? <Chip label="Ella M." avatar="Ella M." onRemove={() => setChip(false)} /> : <RaisedBtn onClick={() => setChip(true)}>Restore chip</RaisedBtn>}
        <DashedBtn>Upload</DashedBtn>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <FilterBtn count={filters} onClick={() => setFilters((n) => n + 1)} onClear={() => setFilters(0)} />
        <Segmented label="Alignment" value={align} onChange={setAlign} options={[
          { value: "l", label: "Align left", iconOnly: true, icon: <AlignLeft className="h-4 w-4" /> },
          { value: "c", label: "Align centre", iconOnly: true, icon: <AlignCenter className="h-4 w-4" /> },
          { value: "r", label: "Align right", iconOnly: true, icon: <AlignRight className="h-4 w-4" /> },
        ]} />
        <StepperAction value={<>{mins} <span className="font-normal text-muted">mins</span></>} onStep={(d) => setMins((m) => Math.max(15, Math.min(120, m + d * 15)))} action={<GlowBtn className="rounded-xl">Book a Call</GlowBtn>} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <IconTile label="Toggle sidebar"><PanelLeft className="h-4 w-4" /></IconTile>
        <Pill size="lg" tone="good">Online</Pill>
        <Pill size="lg" tone="info" busy>In progress</Pill>
        <Pill size="lg" tone="warn">Needs review</Pill>
        <Pill size="lg" tone="crit">Failed</Pill>
        <Pill size="lg" tone="neutral" dot={false}>Draft</Pill>
        <div className="min-w-56 flex-1 sm:max-w-xs"><SearchField><Input placeholder="Search" aria-label="Search demo" /></SearchField></div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Range" value={seg} onChange={setSeg} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        <GlowBtn flat>Flat accent</GlowBtn>
        <RaisedBtn>Secondary</RaisedBtn>
        <RaisedBtn disabled>Disabled</RaisedBtn>
        <GlowBtn disabled>Disabled</GlowBtn>
      </div>
    </div>
  );
}

const T0 = Math.floor(new Date("2026-11-18T11:46:00+07:00").getTime() / 1000);
const msg = (id: string, o: Partial<Msg>): Msg => ({ wa_id: id, phone: "6281234567890", from_me: 0, body: "", media_type: null, ack: 3, is_read: 1, ts: T0, ...o });

function ChatDemo() {
  const tone = useMemo(toneUrl, []);
  const Day = ({ children }: { children: ReactNode }) => <div className="my-1 flex justify-center"><span className="rounded-full bg-surface3 px-3 py-1 text-xs text-ink2">{children}</span></div>;
  return (
    <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl bg-surface2 p-3">
      <Day>Today</Day>
      <Bubble m={msg("g1", { body: "Halo kak, invoicenya sudah masuk ya?", ts: T0 })} />
      <Bubble m={msg("g2", { from_me: 1, body: "Sudah kak, terima kasih. Ini fotonya ya.", ack: 3, ts: T0 + 60 })} />
      <Bubble m={msg("g3", { from_me: 1, media_type: "image", body: "pic with description", ack: 3, ts: T0 + 120 })} demo={{ src: PIC }} />
      <Bubble m={msg("g4", { from_me: 1, media_type: "document", ack: 2, ts: T0 + 180 })} demo={{ src: "/none.pdf", meta: { name: "Invoice-Grabsite-Edo.pdf", size: 168_000, type: "application/pdf" } }} />
      <Bubble m={msg("g5", { media_type: "ptt", ts: T0 + 240 })} demo={{ src: tone }} />
      <Bubble m={msg("g6", { media_type: "sticker", ts: T0 + 300 })} demo={{ src: PIC }} />
      <Bubble m={msg("g7", { media_type: "video", body: "Video loads, or says so", ts: T0 + 360 })} demo={{ src: "/none.mp4" }} />
      <Bubble m={msg("g8", { from_me: 1, body: "Delivered, not yet read", ack: 2, ts: T0 + 420 })} />
      <Bubble m={msg("g9", { from_me: 1, body: "Sent", ack: 1, ts: T0 + 480 })} />
      <Bubble m={msg("pending-1", { from_me: 1, body: "Sending…", ack: 0, ts: T0 + 540 })} />
      <Bubble m={msg("g10", { from_me: 1, body: "Failed to send", ack: -1, ts: T0 + 600 })} />
    </div>
  );
}

export function Styleguide() {
  const { notify, node } = useNotify();
  const [sheet, setSheet] = useState(false);
  const [seg2, setSeg2] = useState("day");
  const [checked, setChecked] = useState(true);
  const [text, setText] = useState("");
  const [demo, setDemo] = useState([
    { id: 1, title: "Reel launch", col: "todo" },
    { id: 2, title: "Carousel tips", col: "doing" },
    { id: 3, title: "Locked: already live", col: "done" },
  ]);

  return (
    <div className="max-w-4xl space-y-8 pb-10">
      {node}
      <PageHeader title="Style guide" subtitle="Every shared component and each state. Build from these; do not restyle raw HTML controls." />

      <Section title="Buttons & Controls (v2 Language)" note="Raised and recessed visual language. Primary buttons carry the warm radial glow with white rim; secondary buttons are white raised tiles with soft shadow (no harsh borders); ghost buttons are clean; danger actions are tactile tiles.">
        <div className="space-y-4 rounded-3xl bg-surface2 p-6">
          <Row label="Tones (40/44px)">
            <Btn tone="primary">Primary Glow</Btn>
            <Btn tone="primary" flat>Flat Accent</Btn>
            <Btn tone="secondary">Secondary Raised</Btn>
            <Btn tone="ghost">Ghost</Btn>
            <Btn tone="danger">Danger</Btn>
          </Row>
          <Row label="Compact (size=&quot;sm&quot;)">
            <Btn tone="primary" size="sm">Primary</Btn>
            <Btn tone="secondary" size="sm">Secondary</Btn>
            <Btn tone="ghost" size="sm">Ghost</Btn>
            <Btn tone="danger" size="sm">Danger</Btn>
          </Row>
          <Row label="With icon">
            <Btn tone="primary" icon="plus">Add Item</Btn>
            <Btn tone="secondary" icon="refresh">Sync Now</Btn>
          </Row>
          <Row label="Loading">
            <Btn tone="primary" icon="refresh" loading>Saving...</Btn>
            <Btn tone="secondary" icon="refresh" loading>Refreshing</Btn>
          </Row>
          <Row label="Disabled">
            <Btn tone="primary" disabled>Primary</Btn>
            <Btn tone="secondary" disabled>Secondary</Btn>
          </Row>
          <Row label="Two-tap delete">
            <ConfirmBtn label="Delete item" onConfirm={() => notify("Deleted (demo)")} />
          </Row>
          <Row label="Copy tile">
            <CopyBtn text="https://musawara.id" label="Copy link" />
          </Row>
        </div>
      </Section>

      <Section title="Specialised Controls v2" note="Wadah cekung (recessed wells) menampung pilihan; tombol interaktif terangkat (raised tiles); kontrol segmented, filter, dan chip khusus.">
        <ControlsDemo />
      </Section>

      <Section title="Choosing and navigating" note="Three controls, three jobs. Segmented: pick one value you hold in state (a range, a filter, a role). PillNav: move between pages (route tabs, sticks under the phone top bar). Tabs: switch panels inside one page.">
        <div className="space-y-5 rounded-3xl bg-surface2 p-6">
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Segmented, text with counts</p>
            <Segmented label="Demo filter" value={seg2} onChange={setSeg2} options={[{ value: "day", label: "All", badge: 12 }, { value: "week", label: "Active", badge: 8 }, { value: "month", label: "Paused", badge: 4 }]} />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">Segmented, full width</p>
            <div className="max-w-sm"><Segmented fill label="Demo status" value={seg2} onChange={setSeg2} options={[{ value: "day", label: "All" }, { value: "week", label: "Unread" }, { value: "month", label: "Needs reply" }]} /></div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted">PillNav, route tabs</p>
            <PillNav label="Demo menu">
              {["Overview", "Ads", "Sales", "Alerts"].map((t, i) => <Link key={t} to="/styleguide" className={pillTabCls(i === 0)}>{t}</Link>)}
            </PillNav>
          </div>
        </div>
      </Section>

      <Section title="Callout" note="One banner for things worth knowing: stale data, open alerts, something waiting, a service down. Tinted fill, no border. Pass `to` to make the whole banner a link, `action` for a button, `compact` inside a card.">
        <div className="max-w-2xl space-y-3">
          <Callout tone="info" title="Heads up">Numbers refresh after every sync, at about 02:00 WIB.</Callout>
          <Callout tone="good">Sync finished. 1.240 rows updated.</Callout>
          <Callout tone="warn">Data may be stale: Musafar Ads last synced 15 Nov, 02.00.</Callout>
          <Callout tone="crit" title="Cannot reach the WhatsApp gateway" action={<Btn icon="refresh" onClick={() => notify("Retrying (demo)")}>Try again</Btn>}>The server that runs WhatsApp did not answer. This page keeps trying and recovers on its own.</Callout>
          <Callout tone="crit" to="/styleguide">2 open alerts, review them</Callout>
          <Callout tone="accent" to="/styleguide">3 items are waiting for your approval.</Callout>
          <Callout tone="warn" compact>Compact, for use inside a card or a form.</Callout>
        </div>
      </Section>

      <Section title="Table" note="Tinted header, hairline rows, numbers right-aligned in tabular figures, optional clickable row, an empty row, and secondary columns that drop on narrow screens (`hideBelow`). Wide tables scroll inside their own box.">
        <div className="space-y-4">
          <DataTable
            rows={[{ id: 1, n: "Musafar Dummy", spend: 17333250, leads: 338, cpa: 666663 }, { id: 2, n: "NurAlive", spend: 9876543, leads: 210, cpa: 823000 }, { id: 3, n: "Padel DRGI", spend: 4200000, leads: 90, cpa: 0 }]}
            getKey={(r) => r.id}
            onRowClick={(r) => notify(`Opened ${r.n} (demo)`)}
            columns={[
              { key: "n", header: "Client", cell: (r) => <span className="font-medium">{r.n}</span> },
              { key: "spend", header: "Spend", numeric: true, cell: (r) => `Rp ${r.spend.toLocaleString("id-ID")}` },
              { key: "leads", header: "Leads", numeric: true, hideBelow: "md", cell: (r) => r.leads },
              { key: "cpa", header: "CPA", numeric: true, cell: (r) => (r.cpa ? `Rp ${r.cpa.toLocaleString("id-ID")}` : "–") },
            ]}
          />
          <DataTable rows={[]} getKey={() => 0} columns={[{ key: "a", header: "Product", cell: () => null }, { key: "b", header: "Revenue", numeric: true, cell: () => null }]} empty="No sales in this range." />
        </div>
      </Section>

      <Section title="Form field" note="Label above the control, then a hint or an error. The label wraps the control so tapping it focuses the field. Fields sit in a FormGrid: one column on phones, two from tablet.">
        <Panel className="p-5">
          <FormGrid>
            <FormField label="Name"><Input placeholder="Full name" aria-label="Name" /></FormField>
            <FormField label="Email" hint="We only use it to sign you in."><Input placeholder="you@example.com" aria-label="Email" /></FormField>
            <FormField label="Phone" optional><Input placeholder="62…" aria-label="Phone" /></FormField>
            <FormField label="Budget" error="Enter a number above 0."><Input aria-invalid defaultValue="-1" aria-label="Budget" /></FormField>
            <FormField label="Role"><NativeSelect className="w-full" aria-label="Role"><option>Team</option><option>Client</option></NativeSelect></FormField>
            <FormField label="Notes" className="sm:col-span-2"><Textarea placeholder="Anything else" aria-label="Notes" /></FormField>
          </FormGrid>
        </Panel>
      </Section>

      <Section title="Pills & Badges v2" note="Status bertitik semantik dengan kontras lembut, rounded-xl tanpa border kaku.">
        <div className="rounded-3xl bg-surface2 p-6">
          <div className="flex flex-wrap items-center gap-2.5">
            {TONES.map((t) => <Pill key={t} tone={t}>{t}</Pill>)}
            <Pill tone="good" icon="checkCircle">Verified</Pill>
            <Pill tone="warn" dot={false}>No dot</Pill>
            <span className="h-5 w-px bg-border/60" />
            <span className="text-xs text-muted">Compact (size=&quot;sm&quot;):</span>
            <Pill tone="accent" size="sm">Active</Pill>
            <span className="h-5 w-px bg-border/60" />
            <StatusBadge status="ACTIVE" /><StatusBadge status="CAMPAIGN_PAUSED" /><StatusBadge status="ARCHIVED" /><StatusBadge status="DELETED" />
            <Pill tone="good" size="sm" icon="check">Done</Pill>
          </div>
        </div>
      </Section>

      <Section title="Form controls" note="Input, Textarea, NativeSelect and Checkbox from components/ui. They size themselves: 44px on phones, 40px from tablet.">
        <div className="space-y-4 rounded-3xl bg-surface2 p-6">
          <Row label="Recessed Search">
            <div className="w-full sm:max-w-xs">
              <SearchField><Input placeholder="Search field..." aria-label="Search" /></SearchField>
            </div>
          </Row>
          <Row label="Input">
            <Input placeholder="Placeholder" value={text} onChange={(e) => setText(e.target.value)} aria-label="Demo input" className="sm:max-w-xs" />
          </Row>
          <Row label="Disabled">
            <Input value="Cannot edit" disabled aria-label="Disabled input" className="sm:max-w-xs" />
          </Row>
          <Row label="Invalid">
            <Input value="not-an-email" aria-invalid onChange={() => {}} aria-label="Invalid input" className="sm:max-w-xs" />
            <span className="text-xs text-crit">Enter a valid email.</span>
          </Row>
          <Row label="Select">
            <NativeSelect aria-label="Demo select" defaultValue="b">
              <option value="a">Option A</option>
              <option value="b">Option B</option>
            </NativeSelect>
            <NativeSelect size="sm" aria-label="Small select" defaultValue="a">
              <option value="a">Small</option>
              <option value="b">Select</option>
            </NativeSelect>
          </Row>
          <Row label="Textarea">
            <Textarea placeholder="Longer text" aria-label="Demo textarea" className="sm:max-w-md" />
          </Row>
          <Row label="Checkbox">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <Checkbox checked={checked} onCheckedChange={setChecked} />
              Checked is {String(checked)}
            </label>
          </Row>
        </div>
      </Section>

      <Section title="Loading, empty and error" note="Every list or data view needs all three. Empty teaches the first step.">
        <div className="space-y-4 rounded-3xl bg-surface2 p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <CardSkeleton lines={3} />
            <Empty icon="info" title="Nothing here yet" hint="Say what this page is for and what to do first." action={<Btn tone="primary" icon="plus">Add the first one</Btn>} />
            <ErrorState message="Request failed (500)" onRetry={() => notify("Retrying (demo)")} />
          </div>
          <Empty title="Compact empty state" hint="For inside a card or list." />
        </div>
      </Section>

      <Section title="Nested card and row list" note="Group with tint, not with outlines. A number or small summary is a Nested card; a list is one RowList with hairlines, never a bordered box per item.">
        <div className="space-y-4 rounded-3xl bg-surface2 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Nested title="Total spend"><p className="tnum text-xl font-semibold text-ink">Rp 12.600.000</p><p className="mt-1 text-xs text-good">+2.1% <span className="text-muted">vs prev.</span></p></Nested>
            <Nested title="Leads" right={<Pill tone="warn">Low</Pill>}><p className="tnum text-xl font-semibold text-ink">184</p><p className="mt-1 text-xs text-crit">-3.2% <span className="text-muted">vs prev.</span></p></Nested>
            <Nested title="Cost / lead"><p className="tnum text-xl font-semibold text-ink">Rp 68.400</p><p className="mt-1 text-xs text-muted">Target Rp 70.000</p></Nested>
          </div>
          <RowList>
            {["Brief Desember", "Paket promo 12.12", "Reel teaser Nobar"].map((t) => (
              <li key={t} className="flex min-h-14 items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm font-medium text-ink">{t}</span>
                <Pill tone="accent">Waiting</Pill>
              </li>
            ))}
          </RowList>
        </div>
      </Section>

      <Section title="Kanban" note="Drag a card to another column with mouse, touch (hold briefly) or keyboard (Space, arrows, Space). A locked card does not move; a column that fills in by itself does not accept drops.">
        <Kanban
          columns={[
            { id: "todo", label: "To do", color: "bg-muted", onAdd: () => notify("Add (demo)") },
            { id: "doing", label: "Doing", color: "bg-chart-2" },
            { id: "done", label: "Done", color: "bg-chart-3", droppable: false, empty: "Fills in by itself" },
          ]}
          items={demo}
          getId={(c) => c.id}
          getColumn={(c) => c.col}
          canDrag={(c) => c.col !== "done"}
          onMove={async (c, to) => setDemo((d) => d.map((x) => (x.id === c.id ? { ...x, col: to } : x)))}
          renderCard={(c) => <div className="rounded-xl bg-surface p-3 text-sm font-medium text-ink shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-panel)]">{c.title}</div>}
          className="lg:grid-cols-3"
        />
      </Section>

      <Section title="Chat" note="WhatsApp-style messages in the CRM inbox. Incoming on the left in white, ours on the right in the client's tint. Images enlarge on tap, voice notes have a waveform, documents show type, name and size. Ticks: clock sending, one sent, two delivered, blue two read, red failed.">
        <ChatDemo />
      </Section>

      <Section title="Overlays and feedback">
        <Panel className="flex flex-wrap gap-2 p-4">
          <Btn tone="secondary" onClick={() => setSheet(true)}>Open sheet</Btn>
          <Btn tone="secondary" onClick={() => notify("Saved.")}>Success toast</Btn>
          <Btn tone="secondary" onClick={() => notify("Something went wrong.", "err")}>Error toast</Btn>
        </Panel>
        {sheet && (
          <Sheet title="Demo sheet" onClose={() => setSheet(false)}>
            <h3 className="text-base font-semibold text-ink">Demo sheet</h3>
            <p className="mt-1 text-sm text-ink2">Bottom sheet on phones, right panel on larger screens. Escape and the scrim close it.</p>
            <div className="mt-4 space-y-3">
              <Input placeholder="Title" aria-label="Title" />
              <Textarea placeholder="Message" aria-label="Message" />
              <div className="flex gap-2">
                <Btn tone="primary" onClick={() => setSheet(false)}>Save</Btn>
                <Btn tone="ghost" onClick={() => setSheet(false)}>Cancel</Btn>
              </div>
            </div>
          </Sheet>
        )}
      </Section>
    </div>
  );
}
