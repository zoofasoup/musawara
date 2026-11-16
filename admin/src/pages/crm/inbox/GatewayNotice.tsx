import { Btn, Panel } from "../../../components/kit";
import { Icon } from "../../../components/icons";
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
    <Panel className={`border-crit/30 bg-crit/5 ${compact ? "p-3" : "p-6"}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-crit">
          <Icon name="alert" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1" role="alert">
          <p className="text-sm font-medium text-ink">{copy.title}</p>
          <p className="mt-1 text-xs text-ink2">{copy.body}</p>
          {onRetry && (
            <Btn className="mt-3 min-h-11" icon="refresh" onClick={onRetry}>
              Try again
            </Btn>
          )}
        </div>
      </div>
    </Panel>
  );
}
