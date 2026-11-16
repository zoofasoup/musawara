// WhatsApp connection: state, linked number, QR to scan, time in state, and logout/relink.
// Polls GET /wa/status every 3 s while not connected, every 15 s once connected.

import { useEffect, useState } from "react";
import { crm } from "./crmApi";
import { Btn, ConfirmBtn, Panel, Pill, useNotify, type Tone } from "../../components/kit";
import { Skeleton } from "../../components/ui";
import { GatewayNotice } from "./inbox/GatewayNotice";
import { classify, fmtPhone, fmtSince, useWaStatus, type WaState } from "./inbox/util";

const STATE: Record<WaState["status"], { label: string; tone: Tone; hint: string }> = {
  starting: { label: "Starting", tone: "neutral", hint: "The gateway is opening WhatsApp Web. This usually takes under a minute." },
  qr: { label: "Waiting for QR scan", tone: "warn", hint: "Scan the code below with the phone that owns the business number." },
  loading: { label: "Loading chats", tone: "warn", hint: "Linked. WhatsApp is loading the chat list, which can take a minute." },
  ready: { label: "Connected", tone: "good", hint: "Messages are being received and can be sent." },
  disconnected: { label: "Disconnected", tone: "crit", hint: "The connection dropped. The gateway retries on its own with growing pauses." },
  error: { label: "Error", tone: "crit", hint: "The gateway could not open WhatsApp. It retries automatically." },
};

export function CrmConnection() {
  const { data, error, loaded, reload, ready } = useWaStatus();
  const { notify, node } = useNotify();
  const [now, setNow] = useState(Date.now());
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  async function logout() {
    setLoggingOut(true);
    try {
      await crm("/wa/logout", { method: "POST" });
      notify("WhatsApp was unlinked. A new QR code will appear shortly.");
    } catch (e) {
      // Relinking restarts Chrome and can outlast the proxy's timeout; the status poll shows the real result.
      const p = classify(e);
      if (p.kind === "down") notify("The gateway is still restarting. Watch the status below.", "ok");
      else notify(p.message, "err");
    } finally {
      setLoggingOut(false);
      void reload();
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!data) return <GatewayNotice error={error} onRetry={reload} />;

  const s = STATE[data.status] ?? { label: data.status, tone: "neutral" as Tone, hint: "" };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {node}
      {error != null && (
        <p className="rounded-lg bg-warn/12 px-3 py-2 text-xs text-warn" role="status">
          {classify(error).kind === "down" ? "The gateway is not answering right now." : classify(error).message} The status below may be out of date; retrying.
        </p>
      )}

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-ink">WhatsApp connection</h1>
            <p className="mt-1 text-xs text-muted">{s.hint}</p>
          </div>
          <Pill tone={s.tone}>{s.label}</Pill>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">In this state for</dt>
            <dd className="font-medium text-ink">{data.since ? fmtSince(now - data.since) : "Unknown"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Number</dt>
            <dd className="font-medium text-ink">{data.me?.phone ? fmtPhone(data.me.phone) : "Not linked"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Account name</dt>
            <dd className="break-words font-medium text-ink">{data.me?.name || "Not available"}</dd>
          </div>
        </dl>

        {data.error && data.status !== "ready" && (
          <p className="mt-4 break-words rounded-lg bg-crit/10 px-3 py-2 text-xs text-crit" role="alert">
            {data.error}
          </p>
        )}
      </Panel>

      {data.status === "qr" && (
        <Panel className="p-4 sm:p-5">
          <h2 className="text-sm font-medium text-ink">Link this number</h2>
          <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {data.qr ? (
              <img src={data.qr} alt="WhatsApp QR code to scan" width={280} height={280} className="h-auto w-full max-w-[280px] rounded-lg border border-border bg-white" />
            ) : (
              <Skeleton className="h-[280px] w-full max-w-[280px]" />
            )}
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink2">
              <li>Open WhatsApp on the phone with the business number.</li>
              <li>Go to Settings, then Linked devices.</li>
              <li>Tap Link a device and point the camera at this code.</li>
              <li>This page updates by itself once it is linked. The code refreshes now and then, so scan the one on screen.</li>
            </ol>
          </div>
        </Panel>
      )}

      {data.status === "loading" && (
        <Panel className="p-4 text-sm text-ink2">Linked successfully. Loading chats from WhatsApp, please wait.</Panel>
      )}

      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Unlink and relink</p>
          <p className="text-xs text-muted">Signs this number out of the CRM and shows a new QR code. You will need the phone to scan it again, and sending stops until then.</p>
        </div>
        {ready ? (
          loggingOut ? (
            <Btn loading icon="refresh" disabled className="min-h-11">
              Unlinking
            </Btn>
          ) : (
            <ConfirmBtn label="Unlink WhatsApp" confirmLabel="Tap again to unlink" icon="link" onConfirm={logout} />
          )
        ) : (
          <p className="text-xs text-muted">Available once connected.</p>
        )}
      </Panel>
    </div>
  );
}
