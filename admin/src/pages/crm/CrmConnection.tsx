// WhatsApp numbers: one card per gateway account with status, QR, rename, brand link, restart, logout and delete.
// Each card polls /accounts/:id/status every 3 s while its number is not ready, every 15 s otherwise.

import { NativeSelect } from "@/components/ui/native-select";
import { Callout } from "../../components/Callout";
import { Input } from "@/components/ui/input";
import { useEffect, useState, type FormEvent } from "react";
import { crm } from "./crmApi";
import { Btn, ConfirmBtn, Empty, Panel, Pill, useNotify, type Notify } from "../../components/kit";
import { Skeleton } from "../../components/ui";
import { CRM_ONLY } from "../../lib/product";
import { classify, fmtPhone, fmtSince, useLive } from "./inbox/util";
import { clientName, statusInfo, useAccounts, type Account, type AccountStatusDetail, type Client } from "./accounts";

const MAX_COPY =
  "This gateway is at its limit of WhatsApp numbers. Every number runs its own WhatsApp Web session and each session needs server memory, so the limit is set on the server. Remove a number you no longer use, or ask whoever runs the gateway to raise MAX_ACCOUNTS and add memory.";

const isMax = (e: unknown) => (e as any)?.status === 409 && (e as any)?.code === "max_accounts";

function BrandSelect({ id, value, clients, disabled, onChange }: { id: string; value: number | null; clients: Client[]; disabled?: boolean; onChange: (v: number | null) => void }) {
  return (
    <NativeSelect id={id} className="w-full" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">No brand</option>
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function QrBlock({ qr }: { qr: string | null }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-4 border-t border-border pt-4 sm:flex-row sm:items-start">
      {qr ? (
        <img src={qr} alt="WhatsApp QR code to scan" width={240} height={240} className="h-auto w-full max-w-[240px] rounded-xl border border-border bg-white" />
      ) : (
        <Skeleton className="h-[240px] w-full max-w-[240px]" />
      )}
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink2">
        <li>Open WhatsApp on the phone with this number.</li>
        <li>Go to Settings, then Linked devices.</li>
        <li>Tap Link a device and point the camera at this code.</li>
        <li>This page updates by itself once linked. The code refreshes now and then, so scan the one on screen.</li>
      </ol>
    </div>
  );
}

function AccountCard({ account, notify }: { account: Account; notify: Notify }) {
  const { clients, reload, selectedId, select } = useAccounts();
  const [fast, setFast] = useState(account.status !== "ready");
  const live = useLive<AccountStatusDetail>(`/accounts/${account.id}/status`, fast ? 3000 : 15000);
  const status = live.data?.status ?? account.status;
  useEffect(() => setFast(status !== "ready"), [status]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(account.name);
  const [delProblem, setDelProblem] = useState<string | null>(null);

  const s = statusInfo(status);
  const phone = live.data?.me?.phone ?? account.phone;
  const waName = live.data?.me?.name ?? account.wa_name;
  const since = live.data?.since ?? account.since;
  const err = live.data?.error ?? account.error;
  const brand = clientName(clients, account.client_id);
  const isDefault = Boolean(account.is_default);
  const base = `/accounts/${account.id}`;

  async function run(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(label);
    try {
      await fn();
      notify(done);
    } catch (e) {
      // Restart and relink reopen Chrome and can outlast the proxy's timeout; the status poll shows the real result.
      if (classify(e).kind === "down" && (label === "restart" || label === "logout")) notify("The gateway is still working on it. Watch the status here.");
      else notify(classify(e).message, "err");
    } finally {
      setBusy(null);
      void live.reload();
      reload();
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || n === account.name) return setRenaming(false);
    await run("rename", () => crm(base, { method: "PATCH", body: { name: n } }), "Renamed.");
    setRenaming(false);
  }

  async function remove(force: boolean) {
    setBusy("delete");
    try {
      await crm(base + (force ? "?force=1" : ""), { method: "DELETE" });
      notify("Number deleted.");
      setDelProblem(null);
      // If this was the open number, the layout falls back to the default on the next list refresh.
      reload();
    } catch (e) {
      if ((e as any)?.status === 409 && !force) setDelProblem(classify(e).message);
      else notify(classify(e).message, "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {renaming ? (
            <form onSubmit={saveName} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`rename-${account.id}`}>
                Number name
              </label>
              <Input id={`rename-${account.id}`} className="w-56 max-w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
              <Btn tone="primary" type="submit" loading={busy === "rename"}>
                Save
              </Btn>
              <Btn
                tone="ghost"
                type="button"
                onClick={() => {
                  setRenaming(false);
                  setName(account.name);
                }}
              >
                Cancel
              </Btn>
            </form>
          ) : (
            <h2 className="break-words text-base font-bold text-ink">{account.name}</h2>
          )}
          <p className="mt-1 text-xs text-muted">
            {CRM_ONLY ? (isDefault ? "Default number" : null) : [brand, isDefault ? "Default number" : null].filter(Boolean).join(" · ") || "Not linked to a brand"}
          </p>
        </div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      <p className="mt-2 text-xs text-muted">{s.hint}</p>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">In this state for</dt>
          <dd className="font-medium text-ink">{since ? fmtSince(now - since) : "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Number</dt>
          <dd className="font-medium text-ink">{phone ? fmtPhone(phone) : "Not linked"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">WhatsApp name</dt>
          <dd className="break-words font-medium text-ink">{waName || "Not available"}</dd>
        </div>
      </dl>

      {err && status !== "ready" && (
        <Callout tone="crit" compact className="mt-4 break-words">{err}</Callout>
      )}
      {live.error != null && !live.data && <p className="mt-3 text-xs text-warn">Live status is unavailable right now. Showing the last known state.</p>}

      {status === "qr" && <QrBlock qr={live.data?.qr ?? null} />}
      {status === "loading" && <p className="mt-4 text-sm text-ink2">Linked successfully. Loading chats from WhatsApp, please wait.</p>}

      {!CRM_ONLY && (
        <div className="mt-4 grid gap-1 border-t border-border pt-4 sm:max-w-xs">
          <label htmlFor={`brand-${account.id}`} className="text-xs text-muted">
            Brand
          </label>
          <BrandSelect
            id={`brand-${account.id}`}
            value={account.client_id}
            clients={clients}
            disabled={busy === "brand"}
            onChange={(v) => run("brand", () => crm(base, { method: "PATCH", body: { client_id: v } }), "Brand updated.")}
          />
          {clients.length === 0 && <p className="text-xs text-muted">No brands to choose from yet.</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {selectedId !== account.id && (
          <Btn tone="primary" icon="check" onClick={() => select(account.id)}>
            Use in CRM
          </Btn>
        )}
        {!renaming && (
          <Btn icon="tag" onClick={() => setRenaming(true)}>
            Rename
          </Btn>
        )}
        <Btn icon="refresh" loading={busy === "restart"} onClick={() => run("restart", () => crm(base + "/restart", { method: "POST" }), "Restarting. The status updates here.")}>
          Restart
        </Btn>
        {(status === "ready" || status === "loading") && (
          <ConfirmBtn
            label="Log out"
            confirmLabel="Tap again to log out"
            icon="link"
            onConfirm={() => run("logout", () => crm(base + "/logout", { method: "POST" }), "Logged out. A new QR code will appear shortly.")}
          />
        )}
        {isDefault ? (
          <p className="text-xs text-muted">The default number cannot be deleted.</p>
        ) : (
          <ConfirmBtn label="Delete" confirmLabel="Tap again to delete" onConfirm={() => remove(false)} />
        )}
      </div>

      {delProblem && (
        <div className="mt-4 rounded-xl border border-crit/30 bg-crit/5 p-3" role="alert">
          <p className="text-sm font-medium text-ink">This number was not deleted</p>
          <p className="mt-1 break-words text-xs text-ink2">{delProblem}</p>
          <p className="mt-2 text-xs text-ink2">
            Deleting anyway permanently removes {account.name}: its contacts and tags, every message, its templates, campaigns and campaign history, and the linked WhatsApp session. This cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ConfirmBtn label="Delete anyway" confirmLabel="Tap again to erase everything" onConfirm={() => remove(true)} />
            <Btn tone="ghost" onClick={() => setDelProblem(null)}>
              Keep this number
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

function AddNumber({ notify, onClose }: { notify: Notify; onClose: () => void }) {
  const { clients, reload, accounts } = useAccounts();
  const [name, setName] = useState("");
  const [client, setClient] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // A CRM copy has one internal row for the business, and linking the number to it is what lets CRM staff see it; there is no way
  // to link it later, so no number is created until that row is known. Lowest id: the same row the server assigns staff to.
  const business = CRM_ONLY && clients.length ? Math.min(...clients.map((c) => c.id)) : null;
  const waiting = CRM_ONLY && business === null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || waiting) return;
    setSaving(true);
    setProblem(null);
    try {
      const owner = CRM_ONLY ? business : client;
      await crm("/accounts", { method: "POST", body: { name: n, ...(owner !== null ? { client_id: owner } : {}) } });
      notify("Number added. Scan its QR code below to link it.");
      reload();
      onClose();
    } catch (err) {
      setProblem(isMax(err) ? MAX_COPY : classify(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="p-4 sm:p-5">
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-sm font-medium text-ink">Add a number</h2>
        <p className="text-xs text-muted">
          Creates the number and shows its QR code. {accounts.length} in use. Each number needs server memory, so the gateway allows only a few.
        </p>
        <div className="grid gap-1">
          <label htmlFor="new-name" className="text-xs text-muted">
            Name
          </label>
          <Input className="w-auto" id="new-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="For example: Padel store" autoFocus />
        </div>
        {!CRM_ONLY && (
          <div className="grid gap-1 sm:max-w-xs">
            <label htmlFor="new-brand" className="text-xs text-muted">
              Brand (optional)
            </label>
            <BrandSelect id="new-brand" value={client} clients={clients} onChange={setClient} />
          </div>
        )}
        {problem && (
          <Callout tone="crit" compact className="break-words">{problem}</Callout>
        )}
        {waiting && <p className="text-xs text-muted">Business data is not loaded yet. If this stays, reload the page.</p>}
        <div className="flex flex-wrap gap-2">
          <Btn tone="primary" type="submit" icon="plus" loading={saving} disabled={!name.trim() || waiting}>
            Create and show QR
          </Btn>
          <Btn tone="ghost" type="button" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </form>
    </Panel>
  );
}

export function CrmConnection() {
  const { accounts } = useAccounts();
  const { notify, node } = useNotify();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {node}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-ink">WhatsApp numbers</h1>
          <p className="mt-1 text-xs text-muted">Each number has its own contacts, inbox, templates and broadcasts.</p>
        </div>
        {!adding && (
          <Btn tone="primary" icon="plus" onClick={() => setAdding(true)}>
            Add number
          </Btn>
        )}
      </div>

      {adding && <AddNumber notify={notify} onClose={() => setAdding(false)} />}

      {accounts.length === 0 ? (
        !adding && <Empty icon="users" title="No WhatsApp numbers yet" hint="Add your first number, then scan its QR code with the phone that owns it." />
      ) : (
        accounts.map((a) => <AccountCard key={a.id} account={a} notify={notify} />)
      )}
    </div>
  );
}
