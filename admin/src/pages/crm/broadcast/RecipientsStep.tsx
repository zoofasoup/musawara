// Step 1: who gets it. One panel reads like a sentence and holds the filters you add; opt-outs are always one click away; extra numbers
// stay hidden until asked for. The count lives in the bar at the bottom, next to the Continue button.
import { useState } from "react";
import { Callout } from "../../../components/Callout";
import { Textarea } from "@/components/ui/textarea";
import { Picker } from "@/components/ui/picker";
import { Segmented } from "../../../components/Segmented";
import { Btn, Panel } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";
import { AudienceSummary } from "./AudienceSummary";
import { FilterBuilder } from "./FilterBuilder";
import type { Names, Rules } from "./audience";
import type { AudienceData } from "./useAudienceData";

export function RecipientsStep({ data, rules, setRules, numbers, setNumbers, extraCount, invalid, names }: {
  data: AudienceData; rules: Rules; setRules: (r: Rules) => void; numbers: string; setNumbers: (v: string) => void; extraCount: number; invalid: string[]; names: Names;
}) {
  const [showNumbers, setShowNumbers] = useState(numbers.trim() !== "");
  const set = (patch: Partial<Rules>) => setRules({ ...rules, ...patch });
  const tagItems = data.tags.map((t) => ({ value: t.tag, label: t.tag, count: t.count }));
  const excl = rules.excludeTags;

  return (
    <div className="space-y-4">
      <Panel className="space-y-3 p-4">
        <Segmented label="Send to" value={rules.everyone ? "all" : "match"} onChange={(v) => set({ everyone: v === "all" })} options={[{ value: "match", label: "Contacts who match" }, { value: "all", label: `Everyone (${fmtNum(data.contacts.length)})` }]} />
        <AudienceSummary rules={rules} names={names} extra={extraCount} />
        {!rules.everyone && <FilterBuilder data={data} rules={rules} setRules={setRules} />}
      </Panel>

      {tagItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm text-ink2">Never send to</span>
          <Picker label="Never send to these tags" items={tagItems} value={excl} onChange={(v) => set({ excludeTags: v })} searchPlaceholder="Search tags…">
            {excl.length === 0 ? "Choose tags (opt-outs, already customers)" : excl.length <= 2 ? excl.join(", ") : `${excl.slice(0, 2).join(", ")} +${excl.length - 2}`}
          </Picker>
          {excl.length > 0 && <span className="text-xs text-muted">This wins over every other choice.</span>}
        </div>
      )}

      {rules.chosen.length > 0 && (
        <Callout tone="info" compact action={<Btn tone="ghost" size="sm" onClick={() => set({ chosen: [] })}>Remove them</Btn>}>
          {fmtNum(rules.chosen.length)} contacts chosen on the Contacts page are included.
        </Callout>
      )}

      <div className="px-1">
        {showNumbers ? (
          <div className="space-y-1.5">
            <label htmlFor="extra-numbers" className="text-xs font-medium text-ink2">Numbers typed by hand (one per line, or "number, name")</label>
            <Textarea id="extra-numbers" value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={3} className="py-2" placeholder={"081234567890, Budi\n6285711112222"} />
            {invalid.length > 0 && <p className="text-xs text-warn">{fmtNum(invalid.length)} lines are not valid numbers and will be skipped.</p>}
          </div>
        ) : (
          <Btn tone="ghost" size="sm" onClick={() => setShowNumbers(true)}>+ Add numbers by hand</Btn>
        )}
      </div>
      {!data.pipelineReady && !rules.everyone && <p className="px-1 text-xs text-muted">Stage and owner filters appear once the pipeline loads.</p>}
    </div>
  );
}
