// The audience as one plain sentence ("Contacts who have tag iklan or leads, and stage is Interested, except tag optout."),
// so the whole filter can be read at a glance instead of decoded from toggles.
import type { ReactNode } from "react";
import { fmtNum } from "../../../lib/format";
import { describeRules, type Names, type Rules } from "./audience";

const Strong = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>;
const list = (values: string[]) => values.map((v, i) => <span key={v}>{i > 0 && (i === values.length - 1 ? " or " : ", ")}<Strong>{v}</Strong></span>);

export function AudienceSummary({ rules, names, extra = 0 }: { rules: Rules; names: Names; extra?: number }) {
  const d = describeRules(rules, names);
  const verb = (kind: string, label: string) => (kind === "tag" ? `have tag` : kind === "chat" ? "" : `${label} is`);
  const lead = d.everyone ? <>Everyone in this number</> : d.include.length === 0 && d.chosen === 0 && extra === 0 ? <span className="text-muted">Nobody yet. Add a filter, or choose Everyone</span> : d.include.length > 0 ? <>Contacts who</> : null;
  return (
    <p className="text-sm leading-relaxed text-ink2">
      {lead}
      {!d.everyone && d.include.map((p, i) => (
        <span key={`${p.kind}-${i}`}>{i > 0 ? ", and " : " "}{verb(p.kind, p.label)} {list(p.values)}</span>
      ))}
      {d.exclude.length > 0 && <span>, except tag {list(d.exclude)}</span>}
      {d.chosen > 0 && <span>{d.everyone || d.include.length ? ", plus " : ""}<Strong>{fmtNum(d.chosen)}</Strong> chosen {d.chosen === 1 ? "contact" : "contacts"}</span>}
      {extra > 0 && <span>, plus <Strong>{fmtNum(extra)}</Strong> typed {extra === 1 ? "number" : "numbers"}</span>}
      .
    </p>
  );
}
