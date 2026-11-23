// Two-factor authentication: set it up with an authenticator app, keep backup codes, turn it off. Used on the profile page and
// as the whole screen when a team account is required to have it.
import { useState } from "react";
import qrcode from "qrcode-generator";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Btn, CopyBtn, Panel, Pill } from "./kit";
import { Callout } from "./Callout";
import { FormField } from "./FormField";
import { Icon } from "./icons";

type Setup = { totpURI: string; backupCodes: string[] };

function Qr({ uri }: { uri: string }) {
  const q = qrcode(0, "M");
  q.addData(uri);
  q.make();
  // generated here from our own data, never from user input
  return <div role="img" aria-label="QR code for your authenticator app" className="h-44 w-44 rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) }} />;
}

export function SecurityCard({ required = false }: { required?: boolean }) {
  const { user, refresh } = useAuth();
  const on = Boolean(user?.two_factor);
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null); // backup codes to show once
  const [mode, setMode] = useState<"" | "off" | "codes">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    const d = await api<Setup>("/auth/two-factor/enable", { body: { password } });
    setSetup(d);
    setPassword("");
  });
  const confirm = () => run(async () => {
    await api("/auth/two-factor/verify-totp", { body: { code: code.replace(/\s/g, "") } });
    setCodes(setup!.backupCodes);
    setSetup(null);
    setCode("");
    await refresh();
  });
  const turnOff = () => run(async () => {
    await api("/auth/two-factor/disable", { body: { password } });
    setPassword("");
    setMode("");
    await refresh();
  });
  const newCodes = () => run(async () => {
    const d = await api<{ backupCodes: string[] }>("/auth/two-factor/generate-backup-codes", { body: { password } });
    setCodes(d.backupCodes);
    setPassword("");
    setMode("");
  });

  const secret = setup ? new URL(setup.totpURI).searchParams.get("secret") ?? "" : "";

  return (
    <Panel className="space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Icon name="shield" className="h-4 w-4 text-ink2" />
        <h2 className="text-sm font-semibold text-ink">Two-factor authentication</h2>
        {on && <Pill tone="good" size="sm">On</Pill>}
      </div>
      {required && !on && !setup && !codes && (
        <Callout tone="warn">Your team now requires a second step at sign-in. Set it up to continue.</Callout>
      )}
      {error && <Callout tone="crit" compact>{error}</Callout>}

      {codes ? (
        <div className="space-y-2">
          <Callout tone="good" title="Two-factor is on. Save these backup codes now.">Each works once, if you lose your phone. They are not shown again.</Callout>
          <ul className="grid grid-cols-2 gap-1.5 font-mono text-xs text-ink">{codes.map((c) => <li key={c} className="rounded-lg bg-surface2 px-2 py-1.5">{c}</li>)}</ul>
          <div className="flex gap-2"><CopyBtn text={codes.join("\n")} label="Copy codes" /><Btn tone="primary" onClick={() => setCodes(null)}>I saved them</Btn></div>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm text-ink2">Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then type the 6-digit code it shows.</p>
          <Qr uri={setup.totpURI} />
          <p className="break-all text-xs text-muted">Or enter this key by hand: <span className="font-mono text-ink">{secret}</span></p>
          <FormField label="6-digit code"><Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} /></FormField>
          <Btn tone="primary" loading={busy} disabled={code.replace(/\s/g, "").length !== 6} onClick={confirm}>Turn on</Btn>
        </div>
      ) : on ? (
        <div className="space-y-3">
          <p className="text-sm text-ink2">Signing in asks for a code from your authenticator app.</p>
          {mode ? (
            <div className="space-y-2">
              <FormField label="Your password, to confirm"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
              <div className="flex gap-2">
                <Btn tone={mode === "off" ? "danger" : "primary"} loading={busy} disabled={!password} onClick={mode === "off" ? turnOff : newCodes}>{mode === "off" ? "Turn off" : "Make new codes"}</Btn>
                <Btn tone="ghost" onClick={() => { setMode(""); setPassword(""); setError(""); }}>Cancel</Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Btn tone="secondary" onClick={() => setMode("codes")}>New backup codes</Btn>
              <Btn tone="ghost" onClick={() => setMode("off")}>Turn off</Btn>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink2">Adds a code from your phone to every sign-in, so a stolen password alone is not enough.</p>
          <FormField label="Your password, to start"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
          <Btn tone="primary" loading={busy} disabled={!password} onClick={start}>Set up</Btn>
        </div>
      )}
    </Panel>
  );
}
