// WhatsApp accounts (one number each): types, status wording and a context shared by the layout and the numbers page.
import { createContext, useContext } from "react";
import type { Tone } from "../../components/kit";

export type AccountStatus = "starting" | "qr" | "loading" | "ready" | "disconnected" | "error" | "stopped";

export type Account = {
  id: number;
  name: string;
  client_id: number | null;
  status: AccountStatus;
  phone: string | null;
  wa_name: string | null;
  since: number | null; // ms epoch of the last state change
  error: string | null;
  is_default: boolean | number;
};

export type AccountStatusDetail = {
  id: number;
  status: AccountStatus;
  qr: string | null;
  me: { phone?: string; name?: string } | null;
  error: string | null;
  since: number | null;
};

export type Client = { id: number; name: string };

export const STATUS: Record<AccountStatus, { label: string; short: string; tone: Tone; dot: string; hint: string }> = {
  starting: { label: "Starting", short: "Starting", tone: "neutral", dot: "bg-muted", hint: "The gateway is opening WhatsApp Web. This usually takes under a minute." },
  qr: { label: "Waiting for QR scan", short: "Needs QR", tone: "warn", dot: "bg-warn", hint: "Scan the code below with the phone that owns this number." },
  loading: { label: "Loading chats", short: "Loading", tone: "warn", dot: "bg-warn", hint: "Linked. WhatsApp is loading the chat list, which can take a minute." },
  ready: { label: "Connected", short: "Ready", tone: "good", dot: "bg-good", hint: "Messages are being received and can be sent." },
  disconnected: { label: "Disconnected", short: "Disconnected", tone: "crit", dot: "bg-crit", hint: "The connection dropped. The gateway retries on its own with growing pauses." },
  error: { label: "Error", short: "Error", tone: "crit", dot: "bg-crit", hint: "The gateway could not open WhatsApp. It retries automatically." },
  stopped: { label: "Stopped", short: "Stopped", tone: "crit", dot: "bg-crit", hint: "This number is switched off. Restart it to bring it back." },
};
export const statusInfo = (s: string) => STATUS[s as AccountStatus] ?? { label: s, short: s, tone: "neutral" as Tone, dot: "bg-muted", hint: "" };

export type AccountsCtx = {
  accounts: Account[];
  clients: Client[];
  reload: () => void;
  /** The account every CRM call currently targets. */
  selectedId: number | null;
  select: (id: number) => void;
};

export const AccountsContext = createContext<AccountsCtx | null>(null);
export const useAccounts = () => {
  const c = useContext(AccountsContext);
  if (!c) throw new Error("useAccounts needs CrmLayout");
  return c;
};

export const clientName = (clients: Client[], id: number | null) => (id == null ? null : clients.find((c) => c.id === id)?.name ?? null);
