// The pipeline and custom fields live on the platform (D1), per WhatsApp number; contacts stay in the gateway.
import { api, useApi } from "../../../lib/api";
import { useAccountId } from "../crmApi";
import { TONE } from "../../../lib/tone";

export const STAGE_COLORS = ["neutral", "blue", "violet", "amber", "green", "rose"] as const;
export type StageColor = (typeof STAGE_COLORS)[number];
export type StageKind = "open" | "won" | "lost";
export type Stage = { id: number; name: string; color: StageColor; kind: StageKind; position: number };
export type Lead = { phone: string; stage_id: number; value_idr: number | null; expected_close: string | null; stage_changed_at: string; created_at: string };
export type FieldType = "text" | "number" | "date" | "select" | "checkbox" | "url";
export type FieldDef = { id: number; label: string; type: FieldType; options: string[]; position: number };
export type Overview = { stages: Stage[]; leads: Lead[]; fields: FieldDef[] };
export type HistoryEvent = { at: string; from_name: string | null; to_name: string; user_name: string | null };

/** Tailwind classes only (no raw colours): the colour bar of a stage and a soft chip. */
export const STAGE_BAR: Record<StageColor, string> = { neutral: "bg-muted", blue: "bg-chart-4", violet: "bg-chart-1", amber: "bg-chart-2", green: "bg-chart-3", rose: "bg-crit" };
export const STAGE_CHIP: Record<StageColor, string> = {
  neutral: "bg-surface3 text-ink2", blue: "bg-chart-4/12 text-chart-4", violet: "bg-chart-1/12 text-chart-1",
  amber: "bg-chart-2/12 text-chart-2", green: "bg-chart-3/12 text-chart-3", rose: TONE.crit.soft,
};
export const FIELD_TYPE_LABEL: Record<FieldType, string> = { text: "Text", number: "Number", date: "Date", select: "Choice", checkbox: "Yes / no", url: "Link" };

/** The board, stages and field definitions for the number picked in the switcher, plus a `call` that talks to that number's routes. */
export function usePipeline() {
  const account = useAccountId();
  const q = useApi<Overview>(account ? `/pipeline?account=${account}` : null, { key: String(account) });
  const call = <T = any>(method: string, sub: string, body?: unknown) =>
    api<T>(`/pipeline${sub}${sub.includes("?") ? "&" : "?"}account=${account}`, { method, ...(body !== undefined ? { body } : {}) });
  return { account, ...q, call };
}

export function useFieldValues(account: number | null) {
  return useApi<{ values: Record<string, Record<string, string>> }>(account ? `/pipeline/values?account=${account}` : null, { key: String(account) });
}
