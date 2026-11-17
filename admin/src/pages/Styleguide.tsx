// The living style guide: every shared component in every state it can be in. Team only, not in the menu.
// Rule of this app: build a screen from these, and if a state is missing here, add it here first.
import { useState, type ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import { Kanban } from "../components/Kanban";
import { Btn, ConfirmBtn, CopyBtn, Empty, Panel, Pill, Sheet, useNotify, type Tone } from "../components/kit";
import { CardSkeleton, EmptyState, ErrorState } from "../components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const TONES: Tone[] = ["neutral", "good", "warn", "crit", "accent"];

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

export function Styleguide() {
  const { notify, node } = useNotify();
  const [sheet, setSheet] = useState(false);
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

      <Section title="Buttons" note="One primary per view. Secondary and ghost for the rest. Destructive always behind a confirm.">
        <Panel className="space-y-3 p-4">
          <Row label="Tones">
            <Btn tone="primary">Primary</Btn>
            <Btn tone="secondary">Secondary</Btn>
            <Btn tone="ghost">Ghost</Btn>
            <Btn tone="danger">Danger</Btn>
          </Row>
          <Row label="With icon">
            <Btn tone="primary" icon="plus">Add</Btn>
            <Btn tone="secondary" icon="refresh">Sync</Btn>
          </Row>
          <Row label="Loading">
            <Btn tone="primary" icon="refresh" loading>Saving</Btn>
          </Row>
          <Row label="Disabled">
            <Btn tone="primary" disabled>Primary</Btn>
            <Btn tone="secondary" disabled>Secondary</Btn>
          </Row>
          <Row label="Two-tap delete">
            <ConfirmBtn label="Delete" onConfirm={() => notify("Deleted (demo)")} />
          </Row>
          <Row label="Copy">
            <CopyBtn text="https://musawara.id" label="Copy link" />
          </Row>
        </Panel>
      </Section>

      <Section title="Pills" note="A status or category, never an action. Colour comes from the tone, not the page.">
        <Panel className="p-4">
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => <Pill key={t} tone={t}>{t}</Pill>)}
            <Pill tone="good" icon="checkCircle">With icon</Pill>
          </div>
        </Panel>
      </Section>

      <Section title="Form controls" note="Input, Textarea, NativeSelect and Checkbox from components/ui. They size themselves: 44px on phones, 40px from tablet.">
        <Panel className="space-y-3 p-4">
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
        </Panel>
      </Section>

      <Section title="Loading, empty and error" note="Every list or data view needs all three. Empty teaches the first step.">
        <div className="grid gap-4 md:grid-cols-3">
          <CardSkeleton lines={3} />
          <Empty icon="info" title="Nothing here yet" hint="Say what this page is for and what to do first." action={<Btn tone="primary" icon="plus">Add the first one</Btn>} />
          <ErrorState message="Request failed (500)" onRetry={() => notify("Retrying (demo)")} />
        </div>
        <EmptyState title="Compact empty state" hint="For inside a card or list." />
      </Section>

      <Section title="Kanban" note="Drag a card to another column with mouse, touch (hold briefly) or keyboard (Space, arrows, Space). A locked card does not move; a column that fills in by itself does not accept drops.">
        <Kanban
          columns={[{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }, { id: "done", label: "Done", droppable: false, empty: "Fills in by itself" }]}
          items={demo}
          getId={(c) => c.id}
          getColumn={(c) => c.col}
          canDrag={(c) => c.col !== "done"}
          onMove={async (c, to) => setDemo((d) => d.map((x) => (x.id === c.id ? { ...x, col: to } : x)))}
          renderCard={(c) => <div className="rounded-lg border border-border bg-surface p-2.5 text-sm font-medium text-ink">{c.title}</div>}
          className="lg:grid-cols-3"
        />
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
