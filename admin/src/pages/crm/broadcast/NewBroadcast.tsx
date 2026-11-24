// The new-broadcast flow: Recipients, Message, Review. The audience is worked out in the browser (audience.ts) and sent to the
// gateway as contact ids; named placeholders ({paket}, {bulan}…) travel as per-person values so every message is filled in correctly.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Callout } from "../../../components/Callout";
import { Btn, Panel, type Notify } from "../../../components/kit";
import { PageHead } from "../data/shared";
import { TONE } from "../../../lib/tone";
import { fmtNum } from "../../../lib/format";
import { crm, crmUpload } from "../crmApi";
import { normalizePhone, useGateway } from "../data/shared";
import { canonical, emptyRules, pickAudience, tokensIn, type Contact, type Rules } from "./audience";
import { useAudienceData } from "./useAudienceData";
import { RecipientsStep } from "./RecipientsStep";
import { MessageStep, type Template } from "./MessageStep";
import { ReviewStep } from "./ReviewStep";

const STEPS = ["Recipients", "Message", "Review"];
const MAX_FILE = 64 * 1024 * 1024;

export function NewBroadcast({ initialIds, ready, notify, onCancel, onCreated }: { initialIds: number[]; ready: boolean; notify: Notify; onCancel: () => void; onCreated: (id: number) => void }) {
  const data = useAudienceData();
  const tplQ = useGateway<unknown>("/templates");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [rules, setRules] = useState<Rules>(() => emptyRules(initialIds));
  const [numbers, setNumbers] = useState("");
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [template, setTemplate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("25");
  const [serverCount, setServerCount] = useState<number | null>(null);
  const [serverInvalid, setServerInvalid] = useState<string[]>([]);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  const templates: Template[] = useMemo(() => {
    const raw: any = tplQ.data;
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.templates) ? raw.templates : [];
    return arr.map((t: any) => ({ id: t.id, name: String(t.name ?? ""), body: String(t.body ?? t.template ?? t.text ?? "") }));
  }, [tplQ.data]);

  const picked = useMemo(() => pickAudience(data.contacts, rules, data.ctx), [data.contacts, rules, data.ctx.now, data.ctx.stageOf, data.ctx.valuesOf, data.ctx.lastChatTs]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = useMemo(() => picked.filter((p) => !skipped.has(p.id)), [picked, skipped]);

  // Typed numbers: counted the way the gateway will, minus people already in the audience.
  const typed = useMemo(() => {
    const valid = new Set<string>(); const bad: string[] = [];
    for (const line of numbers.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const p = normalizePhone(line.split(/[,;\t]/)[0]);
      if (p) valid.add(p); else bad.push(line.trim());
    }
    return { valid, bad };
  }, [numbers]);
  const extraCount = useMemo(() => { const have = new Set(active.map((p) => p.phone)); return [...typed.valid].filter((p) => !have.has(p)).length; }, [typed, active]);
  const count = active.length + extraCount;

  const min = Math.round(Number(delayMin) || 0), max = Math.round(Number(delayMax) || 0);
  const paceOk = min >= 3 && max >= min;

  // On the review step the gateway has the last word on the count (it removes duplicates and bad numbers the same way it will when sending).
  useEffect(() => {
    if (step !== 2) return;
    let alive = true;
    setServerCount(null);
    crm<{ count: number; invalid: string[] }>("/campaigns/recipients", { method: "POST", body: { tags: [], contactIds: active.map((p) => p.id), numbers } })
      .then((r) => { if (alive) { setServerCount(r.count); setServerInvalid(r.invalid); } })
      .catch((e) => alive && setProblem(e.message));
    return () => { alive = false; };
  }, [step, active, numbers]);

  const next = () => {
    setProblem(undefined);
    if (step === 0) {
      if (!name.trim()) return setProblem("Give the broadcast a name so you can find it later.");
      if (count === 0) return setProblem("Nobody is selected yet. Pick a tag, stage or another group, or choose Everyone.");
    }
    if (step === 1) {
      if (!template.trim() && !file) return setProblem("Write a message or attach a file.");
      if (!paceOk) return setProblem(min < 3 ? "The pause between messages must be at least 3 seconds." : "The longest pause must be at least the shortest.");
      if (file && file.size > MAX_FILE) return setProblem("That file is over 64 MB.");
    }
    setStep(step + 1);
  };

  const create = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      // Values for the named placeholders this message really uses (nama and nomor are filled by the gateway itself).
      const used = new Set(tokensIn(template).map(canonical));
      const wanted = data.vars.filter((v) => used.has(v.token) && v.builtin !== "nama" && v.builtin !== "nomor");
      const vars: Record<string, Record<string, string>> = {};
      if (wanted.length) for (const p of active) { const all = data.valuesOfPerson(p.phone); vars[p.phone] = Object.fromEntries(wanted.map((v) => [v.token, all[v.token] ?? ""])); }
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("template", template);
      fd.set("delayMin", String(min));
      fd.set("delayMax", String(max));
      fd.set("tags", "[]");
      fd.set("contactIds", JSON.stringify(active.map((p) => p.id)));
      fd.set("numbers", numbers);
      fd.set("vars", JSON.stringify(vars));
      if (file) fd.set("media", file);
      const r = await crmUpload<{ id: number; count: number }>("/campaigns", fd);
      notify(`Broadcast started for ${fmtNum(r.count)} people.`);
      onCreated(r.id);
    } catch (e: any) {
      setProblem(e.message);
      setBusy(false);
    }
  };

  const reviewReady = serverCount !== null;
  const sample: Contact | undefined = active[0];

  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onCancel}><ArrowLeft className="size-4" />All broadcasts</Btn>
      <PageHead title="New broadcast" />
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3 ${i === step ? "bg-[color-mix(in_srgb,var(--accent)_12%,white)] font-medium text-musawara-ink" : i < step ? TONE.good.soft : TONE.neutral.soft}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {data.error && <Callout tone="crit" compact>Could not load contacts: {String((data.error as Error).message ?? data.error)}</Callout>}
      {step === 0 && <RecipientsStep data={data} rules={rules} setRules={setRules} numbers={numbers} setNumbers={setNumbers} name={name} setName={setName} picked={active} extraCount={extraCount} invalid={typed.bad} />}
      {step === 1 && <MessageStep data={data} templates={templates} template={template} setTemplate={setTemplate} file={file} setFile={setFile} delayMin={delayMin} delayMax={delayMax} setDelayMin={setDelayMin} setDelayMax={setDelayMax} sample={sample} count={count} />}
      {step === 2 && <ReviewStep data={data} rules={rules} people={picked} skipped={skipped} setSkipped={setSkipped} template={template} file={file} name={name.trim()} delayMin={min} delayMax={max} extraCount={extraCount} serverCount={serverCount} />}
      {step === 2 && serverInvalid.length > 0 && <Callout tone="warn" compact>{fmtNum(serverInvalid.length)} typed lines are not valid numbers and will be skipped: {serverInvalid.slice(0, 4).join(", ")}{serverInvalid.length > 4 ? ", ..." : ""}</Callout>}

      {problem && <Callout tone="crit" compact>{problem}</Callout>}
      <Panel className="flex flex-wrap items-center gap-2 p-3">
        {step > 0 && <Btn onClick={() => { setProblem(undefined); setStep(step - 1); }} disabled={busy}>Back</Btn>}
        {step < 2 ? (
          <Btn tone="primary" onClick={next}>Continue{step === 0 && count > 0 ? ` with ${fmtNum(count)}` : ""}</Btn>
        ) : (
          <Btn tone="primary" loading={busy} disabled={!ready || !reviewReady || serverCount === 0} onClick={() => void create()}>
            Send to {fmtNum(serverCount ?? count)} {(serverCount ?? count) === 1 ? "person" : "people"}
          </Btn>
        )}
        {step === 2 && !ready && <span className="text-xs text-warn">Connect WhatsApp first. Sending is disabled until it is connected.</span>}
      </Panel>
    </div>
  );
}
