import { Input } from "@/components/ui/input";
import { FormField } from "../components/FormField";
import { Callout } from "../components/Callout";
import { Btn } from "../components/kit";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Wordmark } from "../components/Layout";
import { LangSwitch } from "../components/LangSwitch";
import { ASSET_BASE } from "../lib/api";
import { T } from "../context/LangContext";
import { Icon } from "../components/icons";

export function Login() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // second step: the code from the authenticator app (or a one-time backup code)
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (needCode) {
        await verifyTwoFactor(code, backup);
      } else {
        const r = await login(email, password);
        if (r?.twoFactor) {
          setNeedCode(true);
          return;
        }
      }
      setPassword("");
      setCode("");
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-sky" style={{ backgroundImage: `url('${ASSET_BASE}/login-sky.jpg')` }}>
      <header className="login-header"><Wordmark /><LangSwitch compact /></header>
      <div className="login-content">
        <form onSubmit={submit} className="login-card space-y-4">
          <div className="login-intro">
            <span className="login-mark"><img src={`${ASSET_BASE}/logo/musawara-mark.png`} alt="" /></span>
            <h1 className="text-xl font-bold text-ink"><T>Sign in</T></h1>
            <p>Welcome to your Musawara workspace.</p>
          </div>
          {needCode ? (
            <div className="space-y-3">
              <FormField label={backup ? "Backup code" : "6-digit code from your authenticator app"}>
                <Input required autoFocus inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" maxLength={backup ? 24 : 7} value={code} onChange={(e) => setCode(e.target.value)} />
              </FormField>
              <Btn type="button" tone="ghost" onClick={() => { setBackup(!backup); setCode(""); setError(""); }}>
                {backup ? "Use the app code instead" : "Use a backup code"}
              </Btn>
            </div>
          ) : (<>
          <FormField label="Email">
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <div className="relative">
            <FormField label="Password">
              <Input type={showPassword ? "text" : "password"} className="pr-14" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <Btn type="button" tone="ghost" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute bottom-0 right-0 min-h-11 min-w-11 px-2"><Icon name={showPassword ? "eyeOff" : "eye"} /></Btn>
          </div>
          </>)}
          {error && <Callout tone="crit" compact>{error}</Callout>}
          <Btn tone="primary" type="submit" loading={busy} className="w-full">
              {busy ? "Signing in…" : needCode ? "Verify" : "Sign in"}
            </Btn>
        </form>
        <p className="login-caption">
          <T>Access is by invitation from Musawara Creative.</T>
        </p>
      </div>
    </main>
  );
}
