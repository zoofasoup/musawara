import { useState } from "react";
import { api, type useApi } from "../../lib/api";
import { Icon } from "../../components/icons";
import { Btn, inputCls, Panel, Pill, Section, type Notify } from "./kit";

export type TokenStatus = { configured: boolean; source?: string; ok?: boolean; name?: string; error?: string };

const STEPS = [
  "Open Meta Business Settings, then Users, System users.",
  "Pick the system user (or add one), and assign it the ad accounts with at least View performance.",
  "Choose Generate token, select the musawara-ads app, set expiry to Never, and tick: ads_read, ads_management, instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement, read_insights.",
  "Copy the token right away (it is shown once) and paste it below.",
];

export function MetaSection({ state, notify }: { state: ReturnType<typeof useApi<TokenStatus>>; notify: Notify }) {
  const { data, loading, reload } = state;
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const configured = Boolean(data?.configured);
  const valid = configured && data?.ok;
  const form = !configured || replacing || data?.ok === false;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    try {
      await api("/admin/token", { method: "POST", body: { token } });
      setToken("");
      setReplacing(false);
      reload();
      notify("Token saved. Checking it with Meta…");
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section id="meta" step={1} done={valid} icon="key" title="Meta connection" hint="One token for everything Meta: ad data, organic Instagram and Page content, and sending sales as offline conversions.">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${
                loading ? "bg-surface3 text-muted" : valid ? "bg-good/12 text-good" : configured ? "bg-crit/10 text-crit" : "bg-warn/12 text-warn"
              }`}
            >
              <Icon name={loading ? "refresh" : valid ? "checkCircle" : configured ? "xCircle" : "alert"} className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">
                {loading ? "Checking with Meta…" : valid ? "Connected" : configured ? "Token rejected by Meta" : "Not connected yet"}
              </p>
              <p className="text-xs text-muted">
                {valid
                  ? `${data?.name ? data.name + " · " : ""}stored ${data?.source === "env" ? "as a deployment secret" : "encrypted in the database"}`
                  : configured
                    ? "Paste a new token below."
                    : "Paste a system user token to start pulling data."}
              </p>
            </div>
          </div>
          {configured && !replacing && !loading && (
            <Btn icon="key" onClick={() => setReplacing(true)}>
              Replace token
            </Btn>
          )}
        </div>

        {data?.error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-crit/5 px-3 py-2 text-xs text-crit">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
            <span className="break-words">{data.error}</span>
          </p>
        )}

        {form && !loading && (
          <form onSubmit={save} className="mt-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={show ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token (starts with EAA…)"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Meta access token"
                  className={`${inputCls} pr-11 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide token" : "Show token"}
                  className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center text-muted hover:text-ink"
                >
                  <Icon name={show ? "eyeOff" : "eye"} />
                </button>
              </div>
              <Btn type="submit" tone="primary" loading={saving} disabled={!token.trim()}>
                Save
              </Btn>
              {replacing && (
                <Btn type="button" tone="ghost" onClick={() => setReplacing(false)}>
                  Cancel
                </Btn>
              )}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Icon name="shield" className="h-3.5 w-3.5" /> Encrypted before it is stored, never shown again after saving.
            </p>
          </form>
        )}

        <details className="group mt-4 border-t border-border pt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium text-ink2 hover:text-ink">
            <Icon name="info" className="h-4 w-4" />
            How do I get a token?
            <Icon name="chevronDown" className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ol className="mt-2 space-y-2 text-xs text-ink2">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface3 text-[11px] font-medium text-ink">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </details>
      </Panel>
    </Section>
  );
}
