// Everything the broadcast builder reads: contacts and tags (gateway), the last conversation of each person (inbox list), and the
// number's pipeline (stage, owner, custom fields). All loaded once when the builder opens; the filtering itself is audience.ts.
import { useMemo } from "react";
import { useGateway } from "../data/shared";
import { usePipeline, useFieldValues } from "../pipeline/api";
import type { Conv } from "../inbox/util";
import { variablesFor, valuesForPerson, type Contact, type Ctx } from "./audience";

export function useAudienceData() {
  const contactsQ = useGateway<Contact[]>("/contacts?lite=1");
  const tagsQ = useGateway<Array<{ tag: string; count: number }>>("/tags");
  const convsQ = useGateway<Conv[]>("/conversations");
  const board = usePipeline();
  const valuesQ = useFieldValues(board.account);

  // Stable identities: the audience is memoised on these, and a new array on every render would recompute it (and re-ask the gateway) forever.
  const contacts = useMemo(() => contactsQ.data ?? [], [contactsQ.data]);
  const stages = useMemo(() => board.data?.stages ?? [], [board.data]);
  const fields = useMemo(() => board.data?.fields ?? [], [board.data]);
  const owners = useMemo(() => board.data?.owners ?? [], [board.data]);
  const leadOf = useMemo(() => new Map((board.data?.leads ?? []).map((l) => [l.phone, l])), [board.data]);
  const lastTs = useMemo(() => new Map((convsQ.data ?? []).map((c) => [c.phone, c.ts])), [convsQ.data]);
  const values = useMemo(() => valuesQ.data?.values ?? {}, [valuesQ.data]);
  const vars = useMemo(() => variablesFor(fields), [fields]);

  const stageName = (phone: string) => stages.find((s) => s.id === leadOf.get(phone)?.stage_id)?.name ?? "";
  const ownerName = (phone: string) => owners.find((o) => o.id === leadOf.get(phone)?.owner_user_id)?.name ?? "";
  const valuesOfPerson = (phone: string) => valuesForPerson(vars, { phone }, { stageName, ownerName, fieldValue: (p, id) => values[p]?.[id] ?? "" });

  const ctx = useMemo<Ctx>(() => ({
    stageOf: (p) => leadOf.get(p)?.stage_id,
    ownerOf: (p) => (leadOf.has(p) ? leadOf.get(p)!.owner_user_id : undefined),
    valuesOf: (p) => values[p],
    lastChatTs: (p) => lastTs.get(p),
    now: Math.floor(Date.now() / 1000),
  }), [leadOf, values, lastTs]);
  return {
    contacts, tags: tagsQ.data ?? [], stages, fields, owners, vars, ctx, valuesOfPerson,
    loading: contactsQ.loading || tagsQ.loading,
    error: contactsQ.error && !contactsQ.data ? contactsQ.error : undefined,
    pipelineReady: Boolean(board.data),
  };
}
export type AudienceData = ReturnType<typeof useAudienceData>;
