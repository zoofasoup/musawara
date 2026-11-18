import { Btn } from "../../../components/kit";
import { Callout } from "../../../components/Callout";
import { classify } from "./util";

/** Plain-language explanation for a failed gateway call, including the proxy's 503 and 502 cases. */
export function GatewayNotice({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const p = classify(error);
  const copy =
    p.kind === "unconfigured"
      ? {
          title: "WhatsApp is not set up yet",
          body: "The platform has no WhatsApp gateway address or access token. An administrator needs to set WA_GATEWAY_URL and WA_GATEWAY_TOKEN on the Worker. Until then the CRM cannot show or send anything.",
        }
      : p.kind === "down"
        ? {
            title: "Cannot reach the WhatsApp gateway",
            body: "The server that runs WhatsApp did not answer. It may be off, restarting or offline. This page keeps trying and will recover on its own once the server is back.",
          }
        : p.kind === "notConnected"
          ? { title: "WhatsApp is not connected", body: p.message }
          : { title: "Something went wrong", body: p.message };
  return (
    <Callout
      tone="crit"
      title={copy.title}
      compact={compact}
      className={compact ? "" : "p-6"}
      action={onRetry && <Btn icon="refresh" onClick={onRetry}>Try again</Btn>}
    >
      {copy.body}
    </Callout>
  );
}
