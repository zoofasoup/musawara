// The media part of a chat bubble: images and stickers are shown in place (tap to enlarge), videos and audio get a player,
// documents stay a labelled link. If the file cannot be loaded the bubble falls back to the plain label with Open / Save.

import { useState } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { mediaLabel, type Msg } from "./util";

const mediaHref = (waId: string) => `/api/crm/media/${encodeURIComponent(waId)}`;
const linkCls = "inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium underline underline-offset-2";

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

/** `src` only overrides where the file comes from (the style guide demo); chats always use the gateway route. */
export function MediaBlock({ m, pending, src }: { m: Msg; pending: boolean; src?: string }) {
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const type = m.media_type;
  if (!type) return null;
  const href = src ?? mediaHref(m.wa_id);
  const label = mediaLabel(type);

  // A message still being sent has no file on the server yet; a failed load shows the plain label.
  if (pending || failed || !["image", "sticker", "video", "audio", "ptt"].includes(type)) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 text-ink">
        {type === "document" && <FileText className="h-4 w-4 shrink-0 text-ink2" aria-hidden />}
        <span className="text-xs font-medium">{failed ? `${label} (preview unavailable)` : label}</span>
        {!pending && <Links href={href} />}
      </div>
    );
  }

  if (type === "image" || type === "sticker") {
    const sticker = type === "sticker";
    return (
      <>
        <button type="button" onClick={() => setZoom(true)} aria-label={`Enlarge ${label.toLowerCase()}`} className="press block min-h-0 min-w-0 overflow-hidden rounded-xl">
          <img
            src={href}
            alt={label}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={sticker ? "h-32 w-32 object-contain" : "max-h-72 w-full min-w-40 object-cover"}
          />
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
      <video src={href} controls playsInline preload="metadata" onError={() => setFailed(true)} className="max-h-80 w-full min-w-48 rounded-xl bg-black">
        <track kind="captions" />
      </video>
    );
  }

  // audio and voice notes
  return (
    <div className="min-w-52">
      <p className="mb-1 text-xs font-medium text-ink">{label}</p>
      <audio src={href} controls preload="none" onError={() => setFailed(true)} className="h-10 w-full" />
    </div>
  );
}
