import { Textarea } from "@/components/ui/textarea";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, Check, CheckCheck, Clock3, Download, ExternalLink, Paperclip, SendHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";
import { crmUpload } from "../crmApi";

import { Skeleton } from "../../../components/ui";
import { GatewayNotice } from "./GatewayNotice";
import { classify, convTitle, dayKey, fmtClock, fmtDayLabel, fmtPhone, mediaLabel, useLive, type Msg, type Thread, type WaState } from "./util";

const PENDING = "pending-";

function Ticks({ m }: { m: Msg }) {
  const cls = "h-3.5 w-3.5";
  if (m.wa_id.startsWith(PENDING)) return <Clock3 className={cls} aria-label="Sending" />;
  if (m.ack < 0) return <AlertCircle className={`${cls} text-crit`} aria-label="Failed to send" />;
  if (m.ack >= 3) return <CheckCheck className={`${cls} text-chart-4`} aria-label={m.ack === 4 ? "Played" : "Read"} />;
  if (m.ack === 2) return <CheckCheck className={cls} aria-label="Delivered" />;
  if (m.ack === 1) return <Check className={cls} aria-label="Sent" />;
  return <Clock3 className={cls} aria-label="Waiting to send" />;
}

const mediaHref = (waId: string) => `/api/crm/media/${encodeURIComponent(waId)}`;
const linkCls = "inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-xs font-medium underline underline-offset-2";

function Bubble({ m }: { m: Msg }) {
  const mine = Boolean(m.from_me);
  const pending = m.wa_id.startsWith(PENDING);
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 sm:max-w-[70%] ${mine ? "rounded-br-md bg-[color-mix(in_srgb,var(--accent)_14%,white)]" : "rounded-bl-md border border-border bg-surface"} ${pending ? "opacity-70" : ""}`}>
        {m.media_type && (
          <div className="flex flex-wrap items-center gap-x-3 text-ink">
            <span className="text-xs font-medium">{mediaLabel(m.media_type)}</span>
            {!pending && (
              <>
                <a className={linkCls} href={mediaHref(m.wa_id)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                <a className={linkCls} href={mediaHref(m.wa_id)} download>
                  <Download className="h-3.5 w-3.5" /> Save
                </a>
              </>
            )}
          </div>
        )}
        {m.body && <p className="whitespace-pre-wrap break-words text-sm text-ink">{m.body}</p>}
        <p className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted">
          {fmtClock(m.ts)}
          {mine && <Ticks m={m} />}
        </p>
      </div>
    </div>
  );
}

function Composer({ disabled, reason, onSend }: { disabled: boolean; reason: string; onSend: (text: string, file: File | null) => Promise<void> }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canSend = !disabled && !busy && (text.trim() !== "" || file !== null);

  async function submit() {
    if (!canSend) return;
    const t = text;
    const f = file;
    setErr(undefined);
    setBusy(true);
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    try {
      await onSend(t.trim(), f);
    } catch (e) {
      setErr(classify(e).message);
      setText((cur) => cur || t);
      setFile((cur) => cur ?? f);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-border bg-surface p-3">
      {disabled && (
        <p className="mb-2 rounded-lg bg-warn/12 px-3 py-2 text-xs text-warn" role="status">
          {reason}{" "}
          <Link to="/crm/connection" className="font-medium underline">
            Open WhatsApp status
          </Link>
        </p>
      )}
      {err && (
        <p className="mb-2 rounded-lg bg-crit/10 px-3 py-2 text-xs text-crit" role="alert">
          Not sent: {err}
        </p>
      )}
      {file && (
        <p className="mb-2 flex items-center gap-2 text-xs text-ink2">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Remove attachment"
            onClick={() => {
              setFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface2"
          >
            <X className="h-4 w-4" />
          </button>
        </p>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
          title="Attach a file (max 64 MB)"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          disabled={disabled}
          aria-label="Message"
          placeholder={disabled ? "Sending is off" : "Write a message"}
          className="max-h-32 min-h-11 resize-none py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export function ThreadView({
  phone,
  listName,
  tags,
  wa,
  waProblem,
  onBack,
  onSent,
}: {
  phone: string;
  listName?: string;
  tags: string[];
  wa: WaState | undefined;
  waProblem: unknown;
  onBack: () => void;
  onSent: () => void;
}) {
  // Opening a conversation marks it read on the gateway (GET /conversations/:phone), and so does every poll while it is open.
  const { data, error, loaded, reload } = useLive<Thread>(`/conversations/${encodeURIComponent(phone)}`, 3000);
  const [pending, setPending] = useState<Msg[]>([]);
  const [unseen, setUnseen] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seen = useRef({ phone: "", len: 0 });
  const counter = useRef(0);

  useEffect(() => {
    setPending([]);
    setUnseen(0);
    stick.current = true;
    seen.current = { phone: "", len: 0 };
  }, [phone]);

  const messages = useMemo(() => [...(data?.messages ?? []), ...pending], [data, pending]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const prev = seen.current;
    const added = prev.phone === phone ? messages.length - prev.len : 0;
    seen.current = { phone, len: messages.length };
    if (stick.current) {
      el.scrollTop = el.scrollHeight;
    } else if (added > 0 && !messages[messages.length - 1]?.from_me) {
      setUnseen((n) => n + added);
    }
  }, [messages, phone]);

  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stick.current = true;
    setUnseen(0);
  }, []);

  async function send(text: string, file: File | null) {
    const tmp: Msg = { wa_id: PENDING + ++counter.current, phone, from_me: 1, body: text, media_type: file ? "document" : null, ack: 0, is_read: 1, ts: Math.floor(Date.now() / 1000) };
    stick.current = true;
    setPending((p) => [...p, tmp]);
    try {
      const path = `/conversations/${encodeURIComponent(phone)}`;
      // API.md documents multipart for this endpoint, so text goes the same way as files.
      const form = new FormData();
      form.append("text", text);
      if (file) form.append("media", file);
      await crmUpload(path, form);
      await reload(); // the saved message from the gateway is the truth; the placeholder goes after it
      onSent();
    } finally {
      setPending((p) => p.filter((x) => x.wa_id !== tmp.wa_id));
    }
  }

  const title = convTitle({ name: data?.name || listName, phone: data?.phone ?? phone });
  const canSend = wa?.status === "ready";
  const reason = waProblem
    ? classify(waProblem).kind === "unconfigured"
      ? "The WhatsApp gateway is not set up, so messages cannot be sent."
      : "The WhatsApp gateway is unreachable, so messages cannot be sent."
    : !wa
      ? "Checking the WhatsApp connection..."
      : `WhatsApp is not connected (${wa.status === "qr" ? "waiting for a QR scan" : wa.status}), so messages cannot be sent.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2 md:px-4">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-surface2 md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {(data?.name || listName) && <span>{fmtPhone(data?.phone ?? phone)}</span>}
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-surface3 px-1.5 py-0.5 text-ink2">
                {t}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (stick.current) setUnseen(0);
          }}
          className="h-full space-y-1.5 overflow-y-auto bg-surface2 p-3 md:p-4"
        >
          {!loaded ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="ml-auto h-10 w-1/2" />
              <Skeleton className="h-10 w-3/5" />
            </div>
          ) : !data && error ? (
            <GatewayNotice error={error} onRetry={reload} compact />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted">No messages recorded for this number yet. Messages you send below start the conversation.</p>
          ) : (
            messages.map((m, i) => (
              <Fragment key={m.wa_id}>
                {(i === 0 || dayKey(messages[i - 1].ts) !== dayKey(m.ts)) && (
                  <p className="py-2 text-center">
                    <span className="rounded-full bg-surface3 px-3 py-1 text-xs text-ink2">{fmtDayLabel(m.ts)}</span>
                  </p>
                )}
                <Bubble m={m} />
              </Fragment>
            ))
          )}
        </div>
        {data && error != null && (
          <p className="absolute inset-x-3 top-2 rounded-lg bg-warn/12 px-3 py-1.5 text-xs text-warn shadow-sm" role="status">
            Connection to the gateway lost. Showing the last messages loaded; retrying.
          </p>
        )}
        {unseen > 0 && (
          <button type="button" onClick={toBottom} className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground shadow-md">
            <ArrowDown className="h-3.5 w-3.5" />
            {unseen} new message{unseen === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <Composer key={phone} disabled={!canSend} reason={reason} onSend={send} />
    </div>
  );
}
