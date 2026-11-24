// One input per custom field of the number, typed (number, date, choice, yes/no, link). Values are strings keyed by field id.
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "../data/shared";
import type { FieldDef } from "./api";

export function FieldsForm({ fields, values, onChange }: { fields: FieldDef[]; values: Record<string, string>; onChange: (id: number, v: string) => void }) {
  if (!fields.length) return null;
  return (
    <div className="space-y-3">
      {fields.map((f) => {
        const v = values[f.id] ?? "";
        const id = `field-${f.id}`;
        if (f.type === "checkbox") {
          return (
            <label key={f.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
              <Checkbox checked={v === "1"} onCheckedChange={(on) => onChange(f.id, on ? "1" : "")} />
              {f.label}
            </label>
          );
        }
        return (
          <Field key={f.id} label={f.label}>
            {f.type === "select" ? (
              <NativeSelect id={id} className="w-full" value={v} onChange={(e) => onChange(f.id, e.target.value)}>
                <option value="">Not set</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </NativeSelect>
            ) : (
              <Input id={id} value={v} onChange={(e) => onChange(f.id, e.target.value)}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined} placeholder={f.type === "url" ? "https://" : undefined} maxLength={500} />
            )}
          </Field>
        );
      })}
    </div>
  );
}

/** Only the entries that differ from what was loaded; "" clears a value. */
export function changedValues(before: Record<string, string>, after: Record<string, string>, fields: FieldDef[]) {
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    const a = after[f.id] ?? "", b = before[f.id] ?? "";
    if (a !== b) out[f.id] = a === "" ? null : a;
  }
  return out;
}
