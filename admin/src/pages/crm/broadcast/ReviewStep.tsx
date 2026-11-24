// Step 3: check before sending. Who exactly (searchable, with a way to take people out), what each of them will see in WhatsApp
// (flip through the recipients), what to double-check (missing values, people without a name, how long it takes), then send.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, UserMinus, UserPlus } from "lucide-react";
import { Callout } from "../../../components/Callout";
import { Input } from "@/components/ui/input";
import { Btn, Panel, Pill } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";
import { fmtDuration, fmtPhone } from "../data/shared";
import { emptyCounts, renderMessage, type Contact, type Rules } from "./audience";
import type { AudienceData } from "./useAudienceData";
import { WaPreview } from "./WaPreview";

export function ReviewStep({ data, rules, people, skipped, setSkipped, template, file, name, delayMin, delayMax, extraCount, serverCount }: {
  data: AudienceData; rules: Rules; people: Contact[]; skipped: Set<number>; setSkipped: (s: Set<number>) => void; template: string; file: File | null;
  name: string; delayMin: number; delayMax: number; extraCount: number; serverCount: number | null;
}) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [showSkipped, setShowSkipped] = useState(false);
  const active = useMemo(() => people.filter((p) => !skipped.has(p.id)), [people, skipped]);
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return (showSkipped ? people.filter((p) => skipped.has(p.id)) : active).filter((p) => !n || p.name.toLowerCase().includes(n) || p.phone.includes(n.replace(/\D/g, "") || "\u0000")); }, [q, people, active, skipped, showSkipped]);
  const who = active[Math.min(at, Math.max(active.length - 1, 0))];
  const total = serverCount ?? active.length + extraCount;
  const gaps = useMemo(() => emptyCounts(template, data.vars, active, data.valuesOfPerson).filter((g) => g.missing > 0), [template, data.vars, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const noName = active.filter((p) => !p.name.trim()).length;
  const usesName = /\{\s*(nama|name)\s*\}/i.test(template);
  const mid = (delayMin + delayMax) / 2;
  const skip = (id: number) => { const s = new Set(skipped); s.has(id) ? s.delete(id) : s.add(id); setSkipped(s); };
  const shownText = who ? renderMessage(template, { name: who.name, phone: who.phone, vars: data.valuesOfPerson(who.phone) }) : template;

  const filters: string[] = [];
  if (rules.everyone) filters.push("Everyone");
  if (rules.tags.length) filters.push(`Tags: ${rules.tags.join(", ")}`);
  if (rules.stages.length) filters.push(`Stage: ${rules.stages.map((s) => data.stages.find((x) => x.id === s)?.name ?? "Not on the board").join(", ")}`);
  if (rules.owners.length) filters.push(`Owner: ${rules.owners.map((o) => data.owners.find((x) => x.id === o)?.name ?? "Nobody").join(", ")}`);
  for (const f of rules.fields) { const d = data.fields.find((x) => x.id === f.fieldId); if (d) filters.push(`${d.label}: ${f.mode === "in" ? f.values.join(" / ") || "none picked" : f.mode === "filled" ? "has a value" : "is empty"}`); }
  if (rules.chat === "never") filters.push("Never chatted");
  if (rules.chat === "within") filters.push(`Chatted in the last ${rules.chatDays} days`);
  if (rules.chosen.length) filters.push(`${fmtNum(rules.chosen.length)} chosen contacts`);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Panel className="space-y-3 p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-3xl font-semibold text-ink tnum">{fmtNum(total)}</p>
            <p className="text-sm text-ink2">{total === 1 ? "person" : "people"} will receive "{name}"</p>
          </div>
          <div className="flex flex-wrap gap-1.5">{filters.map((f) => <Pill key={f} tone="neutral">{f}</Pill>)}{extraCount > 0 && <Pill tone="neutral">{fmtNum(extraCount)} typed numbers</Pill>}</div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="text-muted">Pace</dt><dd className="text-ink">{delayMin} to {delayMax} s between messages</dd>
            <dt className="text-muted">Takes about</dt><dd className="text-ink">{fmtDuration(total * mid)}</dd>
            <dt className="text-muted">Attachment</dt><dd className="break-all text-ink">{file ? file.name : "None"}</dd>
            {skipped.size > 0 && <><dt className="text-muted">Taken out</dt><dd className="text-ink">{fmtNum(skipped.size)} {skipped.size === 1 ? "person" : "people"}</dd></>}
          </dl>
        </Panel>

        {(gaps.length > 0 || (usesName && noName > 0) || total > 1000) && (
          <div className="space-y-2">
            {gaps.map((g) => (
              <Callout key={g.token} tone="warn" compact>
                {fmtNum(g.missing)} {g.missing === 1 ? "person has" : "people have"} no {g.label}, so {`{${g.token}}`} will be empty in their message.
                <Btn tone="ghost" size="sm" onClick={() => { const s = new Set(skipped); for (const p of active) if (!(data.valuesOfPerson(p.phone)[g.token] ?? "").trim()) s.add(p.id); setSkipped(s); setAt(0); }}>Take them out</Btn>
              </Callout>
            ))}
            {usesName && noName > 0 && <Callout tone="info" compact>{fmtNum(noName)} {noName === 1 ? "person has" : "people have"} no saved name; {"{nama}"} becomes "Kak" for them.</Callout>}
            {total > 1000 && <Callout tone="warn" compact>{fmtNum(total)} messages is a lot for one number. Consider splitting it over several days and keep the pause long, so the number is not flagged as spam.</Callout>}
          </div>
        )}

        <Panel className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search recipients" className="pl-9" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {skipped.size > 0 && <Btn tone={showSkipped ? "primary" : "secondary"} size="sm" onClick={() => setShowSkipped(!showSkipped)}>{showSkipped ? "Show recipients" : `Taken out (${fmtNum(skipped.size)})`}</Btn>}
          </div>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
            {list.slice(0, 200).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { const i = active.findIndex((x) => x.id === p.id); if (i >= 0) setAt(i); }}>
                  <span className="block truncate text-ink">{p.name || "No name"}</span>
                  <span className="block text-xs text-muted tnum">{fmtPhone(p.phone)}</span>
                </button>
                <Btn tone="ghost" size="sm" aria-label={skipped.has(p.id) ? `Add ${p.name || p.phone} back` : `Take ${p.name || p.phone} out`} onClick={() => skip(p.id)}>{skipped.has(p.id) ? <UserPlus className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}</Btn>
              </li>
            ))}
            {list.length === 0 && <li className="py-3 text-center text-xs text-muted">Nobody matches.</li>}
          </ul>
          {list.length > 200 && <p className="text-xs text-muted">Showing the first 200 of {fmtNum(list.length)}. Search to find a specific person.</p>}
        </Panel>

        <p className="rounded-xl bg-surface2 px-3 py-2 text-xs text-ink2">
          This sends real WhatsApp messages as soon as you confirm. Only message people who know your business; reports as spam can get the number blocked. You can pause or cancel from the broadcast page, but messages already sent cannot be recalled.
        </p>
      </div>

      <aside className="lg:sticky lg:top-2 lg:self-start">
        <Panel className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">What {who ? "they" : "people"} will see</p>
            {active.length > 1 && (
              <span className="flex items-center gap-1">
                <Btn tone="ghost" size="sm" aria-label="Previous person" disabled={at <= 0} onClick={() => setAt(at - 1)}><ChevronLeft className="h-4 w-4" /></Btn>
                <span className="tnum text-xs text-ink2">{Math.min(at, active.length - 1) + 1} / {fmtNum(active.length)}</span>
                <Btn tone="ghost" size="sm" aria-label="Next person" disabled={at >= active.length - 1} onClick={() => setAt(at + 1)}><ChevronRight className="h-4 w-4" /></Btn>
              </span>
            )}
          </div>
          <WaPreview text={shownText} file={file} title={who?.name || "Kak"} subtitle={who ? fmtPhone(who.phone) : undefined} />
          <p className="text-xs text-muted">Choices such as {"{Halo|Hai}"} are picked again for each person.</p>
        </Panel>
      </aside>
    </div>
  );
}
