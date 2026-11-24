// How the message will look in WhatsApp: a green outgoing bubble on a chat background, with WhatsApp's own text formatting
// (*bold*, _italic_, ~strike~, ```mono```), links, the attachment on top, the time and the two ticks.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCheck, FileText, Film } from "lucide-react";

const TOKENS = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;

/** WhatsApp text formatting as React nodes; formats can nest (bold inside italic). */
export function formatWa(text: string, depth = 0): ReactNode[] {
  return text.split(TOKENS).map((part, i) => {
    if (!part) return null;
    if (depth < 3) {
      if (part.startsWith("```") && part.endsWith("```") && part.length > 6) return <code key={i} className="font-mono text-[0.85em]">{part.slice(3, -3)}</code>;
      if (part.length > 2 && /^\*[^*\n]+\*$/.test(part)) return <strong key={i}>{formatWa(part.slice(1, -1), depth + 1)}</strong>;
      if (part.length > 2 && /^_[^_\n]+_$/.test(part)) return <em key={i}>{formatWa(part.slice(1, -1), depth + 1)}</em>;
      if (part.length > 2 && /^~[^~\n]+~$/.test(part)) return <s key={i}>{formatWa(part.slice(1, -1), depth + 1)}</s>;
    }
    if (/^https?:\/\//.test(part)) return <span key={i} className="text-chart-4 underline">{part}</span>;
    return <span key={i}>{part}</span>;
  });
}

function Attachment({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  const image = file.type.startsWith("image/");
  useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, image]);
  if (image && url) return <img src={url} alt="" className="mb-1 max-h-56 w-full rounded-xl object-cover" />;
  const video = file.type.startsWith("video/");
  return (
    <div className="mb-1 flex items-center gap-2 rounded-xl bg-surface/60 p-2.5 text-xs text-ink2">
      {video ? <Film className="h-5 w-5 shrink-0" aria-hidden /> : <FileText className="h-5 w-5 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <span className="shrink-0 text-muted">{(file.size / 1048576).toFixed(1)} MB</span>
    </div>
  );
}

export function WaPreview({ text, file, title, subtitle }: { text: string; file?: File | null; title?: string; subtitle?: string }) {
  const time = useMemo(() => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), []);
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-soft)]" aria-label="WhatsApp preview">
      <div className="flex items-center gap-2 bg-out px-3 py-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface3 text-xs font-semibold text-ink2" aria-hidden>{(title || "?").trim().charAt(0).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{title || "Recipient"}</p>
          {subtitle && <p className="truncate text-xs text-ink2">{subtitle}</p>}
        </div>
      </div>
      <div className="min-h-40 bg-surface3 p-3">
        <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-out p-1.5 shadow-sm">
          {file && <Attachment file={file} />}
          {text ? <p className="whitespace-pre-wrap break-words px-1.5 pt-0.5 text-sm text-ink">{formatWa(text)}</p> : !file && <p className="px-1.5 pt-0.5 text-sm text-muted">The message appears here</p>}
          <p className="flex items-center justify-end gap-1 px-1.5 pb-0.5 pt-1 text-[11px] text-ink2">{time}<CheckCheck className="h-3.5 w-3.5 text-chart-4" aria-hidden /></p>
        </div>
      </div>
    </div>
  );
}
