import { useState } from "react";
import { api, type useApi } from "../../lib/api";
import { ClientAvatar } from "../../components/Layout";
import { Icon } from "../../components/icons";
import { Btn, ConfirmBtn, Empty, inputCls, Panel, Pill, Section, type Notify } from "./kit";

/** Center-crop to a 192px square JPEG data URL (white behind transparent PNGs). */
async function photoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 192, 192);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 192, 192);
  return canvas.toDataURL("image/jpeg", 0.88);
}

type ClientsState = ReturnType<typeof useApi<{ clients: any[] }>>;

function ClientCard({ c, reload, notify }: { c: any; reload: () => void; notify: Notify }) {
  const setPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      await api(`/admin/clients/${c.id}`, { method: "PUT", body: { logo_url: await photoToDataUrl(file) } });
      reload();
      notify(`Photo updated for ${c.name}.`);
    } catch (err: any) {
      notify(err.message || "Could not use that image", "err");
    }
  };

  return (
    <Panel className="flex items-center gap-3 p-3.5">
      {/* the avatar itself is the upload target */}
      <label className="group relative inline-flex h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl" title="Change photo">
        <ClientAvatar name={c.name} logoUrl={c.logo_url} color={c.brand_color} size={14} />
        <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Icon name="camera" className="h-5 w-5" />
        </span>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Change photo for ${c.name}`} onChange={(e) => { setPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{c.name}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Pill icon="chart">{c.account_count} account{c.account_count === 1 ? "" : "s"}</Pill>
          <Pill icon="users">{c.user_count} user{c.user_count === 1 ? "" : "s"}</Pill>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center">
        {c.logo_url && (
          <Btn
            tone="ghost"
            onClick={async () => {
              await api(`/admin/clients/${c.id}`, { method: "PUT", body: { logo_url: "" } });
              reload();
            }}
          >
            Remove photo
          </Btn>
        )}
        <ConfirmBtn
          label="Delete"
          confirmLabel={c.account_count ? `Delete + ${c.account_count} account${c.account_count === 1 ? "" : "s"}` : "Confirm delete"}
          onConfirm={async () => {
            try {
              await api(`/admin/clients/${c.id}`, { method: "DELETE" });
              reload();
              notify(`${c.name} deleted.`);
            } catch (err: any) {
              notify(err.message, "err");
            }
          }}
        />
      </div>
    </Panel>
  );
}

export function ClientsSection({ state, notify }: { state: ClientsState; notify: Notify }) {
  const { data, loading, error, reload } = state;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api("/admin/clients", { method: "POST", body: { name } });
      notify(`${name.trim()} added. Connect its ad accounts next.`);
      setName("");
      setAdding(false);
      reload();
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const clients = data?.clients ?? [];
  return (
    <Section
      id="clients"
      step={2}
      done={clients.length > 0}
      icon="building"
      title="Clients"
      hint="Each client gets its own dashboard, share link and logins."
      action={
        <Btn tone={adding ? "ghost" : "secondary"} icon={adding ? undefined : "plus"} onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "Add client"}
        </Btn>
      }
    >
      {adding && (
        <form onSubmit={add} className="mb-3 flex gap-2 rounded-xl border border-[var(--accent)]/30 bg-surface p-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name, e.g. Musafar Tour & Travel" aria-label="Client name" className={inputCls} />
          <Btn type="submit" tone="primary" loading={saving} disabled={!name.trim()}>
            Add
          </Btn>
        </form>
      )}
      {loading ? (
        <div className="h-24 skeleton rounded-xl" />
      ) : error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : clients.length === 0 ? (
        <Empty icon="building" title="No clients yet" hint="Add your first client, then connect its Meta ad accounts." action={<Btn tone="primary" icon="plus" onClick={() => setAdding(true)}>Add client</Btn>} />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {clients.map((c) => (
            <ClientCard key={c.id} c={c} reload={reload} notify={notify} />
          ))}
        </div>
      )}
    </Section>
  );
}
