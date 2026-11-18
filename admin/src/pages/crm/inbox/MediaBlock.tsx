// The media part of a chat bubble, modelled on WhatsApp: images and stickers in place (tap to enlarge), a video player,
// a voice-note player with a waveform, and a document card (type tile, file name, "pdf · 164 KB").
// If a file cannot be loaded the bubble falls back to the plain label with Open / Save.

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, Pause, Play } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { mediaLabel, type Msg } from "./util";

const mediaHref = (waId: string) => `/api/crm/media/${encodeURIComponent(waId)}`;
const linkCls = "inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium underline underline-offset-2";

export type DocMeta = { name: string | null; size: number | null; type: string | null };
/** Overrides for the style guide demo only; chats always read from the gateway route. */
export type MediaDemo = { src?: string; meta?: DocMeta };

function Links({ href }: { href: string }) {
  return (
    <>
      <a className={linkCls} href={href} target="_blank" rel="noopener noreferrer">
        <ExternalLink className="h-3.5 w-3.5" /> Open
      </a>
      <a className={linkCls} href={href} download>
        <Download className="h-3.5 w-3.5" /> Save
      </a>
    </>
  );
}

// ---- document metadata: one tiny ranged request gives the name (Content-Disposition), size (Content-Range) and type ----
const metaCache = new Map<string, DocMeta>();
const nameFrom = (cd: string | null) => {
  if (!cd) return null;
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd);
  if (star) try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")); } catch { /* fall through to the plain form */ }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].trim() : null;
};
function useDocMeta(href: string, skip: boolean): DocMeta | null {
  const [meta, setMeta] = useState<DocMeta | null>(metaCache.get(href) ?? null);
  useEffect(() => {
    if (skip || metaCache.has(href)) return;
    let alive = true;
    fetch(href, { headers: { Range: "bytes=0-0" } })
      .then((r) => {
        const total = /\/(\d+)$/.exec(r.headers.get("content-range") ?? "");
        const m: DocMeta = { name: nameFrom(r.headers.get("content-disposition")), size: total ? Number(total[1]) : Number(r.headers.get("content-length")) || null, type: r.headers.get("content-type") };
        metaCache.set(href, m);
        if (alive) setMeta(m);
        r.body?.cancel().catch(() => {});
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [href, skip]);
  return meta;
}

const sizeText = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const extOf = (name: string | null, type: string | null) => {
  const fromName = name && /\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1];
  if (fromName) return fromName.toLowerCase();
  const t = (type ?? "").split(";")[0].split("/")[1];
  return t ? t.replace(/^vnd\..*\./, "").slice(0, 5) : "file";
};
const TILE: Record<string, string> = { pdf: "bg-crit/12 text-crit", doc: "bg-chart-4/12 text-chart-4", docx: "bg-chart-4/12 text-chart-4", xls: "bg-good/12 text-good", xlsx: "bg-good/12 text-good", csv: "bg-good/12 text-good", ppt: "bg-warn/12 text-warn", pptx: "bg-warn/12 text-warn", zip: "bg-surface3 text-ink2" };

function DocCard({ href, pending, meta }: { href: string; pending: boolean; meta: DocMeta | null }) {
  const ext = extOf(meta?.name ?? null, meta?.type ?? null);
  const line = [ext.toUpperCase(), sizeText(meta?.size ?? null)].filter(Boolean).join(" · ");
  const inner = (
    <>
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold uppercase ${TILE[ext] ?? "bg-surface3 text-ink2"}`}>
        {ext.length <= 4 ? ext : <FileText className="h-5 w-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{meta?.name ?? "Document"}</span>
        <span className="block text-xs text-muted">{pending ? "Sending…" : line || "Tap to open"}</span>
      </span>
      {!pending && <Download className="h-4 w-4 shrink-0 text-ink2" aria-hidden />}
    </>
  );
  const cls = "press flex min-h-14 min-w-52 items-center gap-3 rounded-xl bg-black/[0.04] p-2";
  return pending ? <div className={cls}>{inner}</div> : <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`Open ${meta?.name ?? "document"}`}>{inner}</a>;
}

// ---- voice note ----
const bars = (seed: string, n = 34) => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2246822519) >>> 0;
    const v = (h % 1000) / 1000;
    const envelope = 0.55 + 0.45 * Math.sin((i / n) * Math.PI); // louder in the middle, like speech
    return 0.18 + 0.82 * v * envelope;
  });
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function VoicePlayer({ src, seed, label, onError }: { src: string; seed: string; label: string; onError: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const wave = useMemo(() => bars(seed), [seed]);
  const frac = dur > 0 ? pos / dur : 0;
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(onError);
    else a.pause();
  };
  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur;
  };
  return (
    <div className="flex min-w-56 items-center gap-2.5 px-2 py-1">
      <button type="button" onClick={toggle} aria-label={playing ? `Pause ${label.toLowerCase()}` : `Play ${label.toLowerCase()}`} className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="h-4 w-4 translate-x-px" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} tabIndex={0} onPointerDown={seek} className="flex h-7 cursor-pointer touch-none items-center gap-[2px]">
          {wave.map((h, i) => (
            <span key={i} className={`w-[3px] rounded-full ${i / wave.length < frac ? "bg-[var(--accent)]" : "bg-ink/20"}`} style={{ height: `${Math.round(h * 100)}%` }} />
          ))}
        </div>
        <p className="tnum text-xs text-muted">{clock(playing || pos > 0 ? pos : dur)}</p>
      </div>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => setDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }}
        onError={onError}
      />
    </div>
  );
}

export function MediaBlock({ m, pending, demo }: { m: Msg; pending: boolean; demo?: MediaDemo }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const type = m.media_type;
  const href = demo?.src ?? mediaHref(m.wa_id);
  const meta = useDocMeta(href, pending || type !== "document" || Boolean(demo?.meta));
  if (!type) return null;
  const label = mediaLabel(type);

  if (type === "document") return <DocCard href={href} pending={pending} meta={demo?.meta ?? meta} />;

  // A message still being sent has no file on the server yet; a failed load shows the plain label.
  if (pending || failed || !["image", "sticker", "video", "audio", "ptt"].includes(type)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 px-2 py-1 text-ink">
        <span className="text-xs font-medium">{failed ? `${label} (preview unavailable)` : label}</span>
        {!pending && <Links href={href} />}
      </div>
    );
  }

  if (type === "image" || type === "sticker") {
    const sticker = type === "sticker";
    return (
      <>
        <button type="button" onClick={() => setZoom(true)} aria-label={`Enlarge ${label.toLowerCase()}`} className={`press block min-h-0 min-w-0 overflow-hidden rounded-xl ${sticker ? "" : "w-[min(18rem,72vw)]"}`}>
          <img src={href} alt={label} loading="lazy" decoding="async" onError={() => setFailed(true)} className={sticker ? "h-32 w-32 object-contain" : "max-h-72 w-full object-cover"} />
        </button>
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent showCloseButton className="max-w-[min(96vw,64rem)] bg-black/90 p-2 ring-0 sm:max-w-[min(96vw,64rem)]">
            <DialogTitle className="sr-only">{label}</DialogTitle>
            <img src={href} alt={label} className="mx-auto max-h-[85dvh] w-auto max-w-full rounded-lg object-contain" />
            <div className="flex justify-center gap-3 text-white [&_a]:text-white"><Links href={href} /></div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type === "video") {
    return (
      <div className="w-[min(18rem,72vw)] overflow-hidden rounded-xl bg-surface3">
        <video src={href} controls playsInline preload="metadata" onError={() => setFailed(true)} className="max-h-72 w-full object-cover">
          <track kind="captions" />
        </video>
      </div>
    );
  }

  // audio and voice notes
  return <VoicePlayer src={href} seed={m.wa_id} label={label} onError={() => setFailed(true)} />;
}
