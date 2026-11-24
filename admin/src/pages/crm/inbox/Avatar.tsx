// A contact's WhatsApp profile picture (fetched and cached by the gateway), or their initial when they have none.
import { useState } from "react";
import { accountParam } from "../crmApi";

const missing = new Set<string>(); // numbers without a picture: asked once per page load, not on every render

export function Avatar({ phone, name, size = 40 }: { phone: string; name?: string; size?: number }) {
  const key = `${accountParam()}:${phone}`;
  const [failed, setFailed] = useState(missing.has(key));
  const initial = (name || "").trim().charAt(0).toUpperCase() || "#";
  const box = { width: size, height: size };
  return failed ? (
    <span style={box} className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface3 text-sm font-semibold text-ink2" aria-hidden>{initial}</span>
  ) : (
    <img src={`/api/crm/contacts/${phone}/avatar${accountParam() ? `?${accountParam()}` : ""}`} alt="" style={box} loading="lazy" referrerPolicy="no-referrer"
      className="shrink-0 rounded-full bg-surface3 object-cover" onError={() => { missing.add(key); setFailed(true); }} />
  );
}
