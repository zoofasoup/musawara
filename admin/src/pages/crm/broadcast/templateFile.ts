// The attachment saved on a template, fetched as a File so the chat box and the broadcast send it the normal way.
import { accountParam } from "../crmApi";

export async function templateFile(t: { id: number; media_name?: string | null; media_mime?: string | null }): Promise<File | null> {
  if (!t.media_name) return null;
  const res = await fetch(`/api/crm/templates/${t.id}/media${accountParam() ? `?${accountParam()}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error(`The attachment "${t.media_name}" could not be loaded.`);
  return new File([await res.blob()], t.media_name, { type: t.media_mime || res.headers.get("content-type") || "application/octet-stream" });
}
