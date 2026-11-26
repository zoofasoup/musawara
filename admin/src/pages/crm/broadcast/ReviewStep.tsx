// Step 3: check before sending. The hero says what goes to whom in one sentence (and lets you name it); warnings come next;
// the exact recipients sit one click away (searchable, with a way to take people out); the WhatsApp preview can flip through people.
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, UserMinus, UserPlus } from "lucide-react";
import { Callout } from "../../../components/Callout";
import { Input } from "@/components/ui/input";
import { Btn, Panel } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";
import { fmtDuration, fmtPhone } from "../data/shared";
import { AudienceSummary } from "./AudienceSummary";
import { emptyCounts, renderMessage, unknownTokens, type Contact, type Names, type Rules } from "./audience";
import type { AudienceData } from "./useAudienceData";
import { WaPreview } from "./WaPreview";

export function ReviewStep({ data, rules, names, people, skipped, setSkipped, template, file, name, setName, delayMin, delayMax, extraCount, total }: {
  data: AudienceData; rules: Rules; names: Names; people: Contact[]; skipped: Set<number>; setSkipped: (s: Set<number>) => void; template: string; file: File | null;
  name: string; setName: (v: string) => void; delayMin: number; delayMax: number; extraCount: number; total: number;
}) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [showList, setShowList] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  const active = useMemo(() => people.filter((p) => !skipped.has(p.id)), [people, skipped]);
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return (showSkipped ? people.filter((p) => skipped.has(p.id)) : active).filter((p) => !n || p.name.toLowerCase().includes(n) || p.phone.includes(n.replace(/\D/g, "") || "\u0000")); }, [q, people, active, skipped, showSkipped]);
  const who = active[Math.min(at, Math.max(active.length - 1, 0))];
  const gaps = useMemo(() => emptyCounts(template, data.vars, active, data.valuesOfPerson).filter((g) => g.missing > 0), [template, data.vars, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const unknown = unknownTokens(template, data.vars);
  const noName = active.filter((p) => !p.name.trim()).length;
  const usesName = /\{\s*(nama|name)\s*\}/i.test(template);
  const skip = (id: number) => { const s = new Set(skipped); if (s.has(id)) s.delete(id); else s.add(id); setSkipped(s); };
  const shownText = who ? renderMessage(template, { name: who.name, phone: who.phone, vars: data.valuesOfPerson(who.phone) }) : template;
  const hasWarnings = unknown.length > 0 || gaps.length > 0 || (usesName && noName > 0) || total > 1000;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <Panel className="space-y-3 p-4">
          <label htmlFor="broadcast-name" className="text-xs font-medium text-ink2">Broadcast name (only for you)</label>
          <Input id="broadcast-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80} />
          <AudienceSummary rules={rules} names={names} extra={extraCount} />
          <p className="text-sm text-ink2">
            {file ? <>With attachment <b className="text-ink">{file.name}</b>. </> : null}
            Paced <b className="tnum text-ink">{delayMin}–{delayMax} s</b> apart, <b className="text-ink">{fmtDuration(total * ((delayMin + delayMax) / 2))}</b> in total.
            {skipped.size > 0 && <> <b className="text-ink">{fmtNum(skipped.size)}</b> taken out.</>}
          </p>
        </Panel>

        {hasWarnings && (
          <div className="space-y-2">
            {unknown.length > 0 && (
              <Callout tone="crit" compact>
                {unknown.map((t) => `{${t}}`).join(", ")} {unknown.length === 1 ? "is not a known field" : "are not known fields"}: everyone will receive {unknown.length === 1 ? "it" : "them"} exactly as typed. Go back and fix the message.
              </Callout>
            )}
            {gaps.map((g) => (
              <Callout key={g.token} tone="warn" compact action={<Btn tone="ghost" size="sm" onClick={() => { const s = new Set(skipped); for (const p of active) if (!(data.valuesOfPerson(p.phone)[g.token] ?? "").trim()) s.add(p.id); setSkipped(s); setAt(0); }}>Take them out</Btn>}>
                {fmtNum(g.missing)} {g.missing === 1 ? "person has" : "people have"} no {g.label}, so {`{${g.token}}`} will be empty in their message.
              </Callout>
            ))}
            {usesName && noName > 0 && <Callout tone="info" compact>{fmtNum(noName)} {noName === 1 ? "person has" : "people have"} no saved name; {"{nama}"} becomes "Kak" for them.</Callout>}
            {total > 1000 && <Callout tone="warn" compact>{fmtNum(total)} messages is a lot for one number. Consider splitting it over several days and keep the pause long, so the number is not flagged as spam.</Callout>}
          </div>
        )}

        <div className="space-y-2">
          <Btn tone="secondary" size="sm" aria-expanded={showList} onClick={() => setShowList(!showList)}>{showList ? "Hide recipients" : `Show the ${fmtNum(active.length)} recipients`}</Btn>
          {showList && (
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
                    <Btn tone="ghost" size="icon" aria-label={skipped.has(p.id) ? `Add ${p.name || p.phone} back` : `Take ${p.name || p.phone} out`} onClick={() => skip(p.id)}>{skipped.has(p.id) ? <UserPlus className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}</Btn>
                  </li>
                ))}
                {list.length === 0 && <li className="py-3 text-center text-xs text-muted">Nobody matches.</li>}
              </ul>
              {list.length > 200 && <p className="text-xs text-muted">Showing the first 200 of {fmtNum(list.length)}. Search to find a specific person.</p>}
            </Panel>
          )}
        </div>

        <p className="rounded-xl bg-surface2 px-3 py-2 text-xs text-ink2">
          This sends real WhatsApp messages as soon as you confirm. Only message people who know your business; reports as spam can get the number blocked. You can pause or cancel from the broadcast page, but messages already sent cannot be recalled.
        </p>
      </div>

      <aside className="lg:sticky lg:top-2 lg:self-start">
        <Panel className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted">What they will see</p>
            {active.length > 1 && (
              <span className="flex items-center gap-1">
                <Btn tone="ghost" size="icon" aria-label="Previous person" disabled={at <= 0} onClick={() => setAt(at - 1)}><ChevronLeft className="h-4 w-4" /></Btn>
                <span className="tnum text-xs text-ink2">{Math.min(at, active.length - 1) + 1} / {fmtNum(active.length)}</span>
                <Btn tone="ghost" size="icon" aria-label="Next person" disabled={at >= active.length - 1} onClick={() => setAt(at + 1)}><ChevronRight className="h-4 w-4" /></Btn>
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
