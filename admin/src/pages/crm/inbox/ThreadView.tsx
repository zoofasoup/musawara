import { Textarea } from "@/components/ui/textarea";
import { Linkified } from "../../../components/Linkified";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowLeft, Check, CheckCheck, Clock3, NotebookPen, Paperclip, UserRound, SendHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";
import { crm, crmUpload, useAccountId, useCrm } from "../crmApi";
import { usePipeline, useFieldValues } from "../pipeline/api";
import { renderMessage, valuesForPerson, variablesFor } from "../broadcast/audience";
import { api, useApi } from "../../../lib/api";
import { Segmented } from "../../../components/Segmented";
import { TONE } from "../../../lib/tone";
import { AdCard } from "./AdCard";
import { Avatar } from "./Avatar";
import type { TimelineItem } from "../pipeline/api";

import { Skeleton } from "../../../components/ui";
import { GatewayNotice } from "./GatewayNotice";
import { Callout } from "../../../components/Callout";
import { MediaBlock, type MediaDemo } from "./MediaBlock";
import { classify, convTitle, dayKey, fmtClock, fmtDayLabel, fmtPhone, useLive, type Msg, type Thread, type WaState } from "./util";

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


/**
 * One chat bubble. Spacing follows the nesting rule: the bubble is rounded-2xl; a bubble with media has 4px padding and the media inside
 * is rounded-xl (outer radius minus padding), so the corners stay concentric. An image and an image with a caption are the same bubble;
 * only the caption line differs. Text-only bubbles use the roomier px-3 py-2.
 */
export function Bubble({ m, demo }: { m: Msg; demo?: MediaDemo }) {
  const mine = Boolean(m.from_me);
  const pending = m.wa_id.startsWith(PENDING);
  const framed = Boolean(m.media_type);
  const inset = framed ? "px-2" : "";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl sm:max-w-[70%] ${framed ? "p-1" : "px-3 py-2"} ${mine ? "rounded-br-md bg-[color-mix(in_srgb,var(--accent)_14%,white)]" : "rounded-bl-md bg-surface shadow-[var(--shadow-soft)]"} ${pending ? "opacity-70" : ""}`}>
        <MediaBlock m={m} pending={pending} demo={demo} />
        {m.body && <p className={`whitespace-pre-wrap break-words text-sm text-ink ${inset} ${framed ? "pt-1.5" : ""}`}><Linkified text={m.body} /></p>}
        <p className={`flex items-center justify-end gap-1 text-xs text-muted ${framed ? "px-2 pb-1 pt-0.5" : "mt-0.5"}`}>
          {fmtClock(m.ts)}
          {mine && <Ticks m={m} />}
        </p>
      </div>
    </div>
  );
}

/** An internal note in the thread: only the team sees it, it is never sent to the customer. */
function NoteBubble({ note }: { note: Note }) {
  return (
    <div className="flex justify-center">
      <div className={`max-w-[90%] rounded-2xl px-3 py-2 sm:max-w-[70%] ${TONE.warn.soft}`}>
        <p className="flex items-center gap-1 text-xs font-medium"><NotebookPen className="h-3.5 w-3.5" aria-hidden />Internal note, not sent to the customer</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink"><Linkified text={note.text} /></p>
        <p className="mt-0.5 text-xs text-ink2">{note.user_name ? `${note.user_name} · ` : ""}{fmtClock(note.ts)}</p>
      </div>
    </div>
  );
}

type Note = { id: number; ts: number; text: string; user_name: string | null };
type Entry = { key: string; ts: number; msg?: Msg; note?: Note };
const sqlUtcToUnix = (at: string) => Math.floor(Date.parse(at.replace(" ", "T") + "Z") / 1000);

type QuickReply = { id: number; name: string; body: string; category: string; use_count: number };

function Composer({ disabled, reason, onSend, onNote, replies, fill }: { disabled: boolean; reason: string; onSend: (text: string, file: File | null) => Promise<void>; onNote: (text: string) => Promise<void>; replies: QuickReply[]; fill: (body: string) => string }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const noting = mode === "note";
  // Typing "/" at the start opens the saved templates (quick replies): keep typing to narrow, arrows and Enter to pick.
  const [hi, setHi] = useState(0);
  const [closed, setClosed] = useState(false);
  const query = !noting && !closed && text.startsWith("/") && !text.includes("\n") ? text.slice(1).trim().toLowerCase() : null;
  const options = query === null ? [] : replies.filter((t) => !query || `${t.name} ${t.category} ${t.body}`.toLowerCase().includes(query)).slice(0, 8);
  const menu = query !== null && replies.length > 0;
  const pick = (t: QuickReply) => { setText(fill(t.body)); setHi(0); setClosed(false); void crm(`/templates/${t.id}/used`, { method: "POST" }).catch(() => {}); };
  const blocked = disabled && !noting; // a note works even when WhatsApp is not connected
  const canSend = !blocked && !busy && (text.trim() !== "" || (!noting && file !== null));

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
      if (noting) await onNote(t.trim()); else await onSend(t.trim(), f);
    } catch (e) {
      setErr(classify(e).message);
      setText((cur) => cur || t);
      setFile((cur) => cur ?? f);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative bg-surface p-3 shadow-[0_-8px_24px_-16px_rgba(20,24,36,0.18)]">
      {menu && (
        <ul role="listbox" aria-label="Templates" className="absolute inset-x-3 bottom-full z-20 mb-1 max-h-64 overflow-y-auto rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-panel)]">
          {options.length === 0 && <li className="px-3 py-2 text-xs text-muted">No template matches "{query}".</li>}
          {options.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === hi}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(t); }} onMouseEnter={() => setHi(i)} className={`block w-full min-h-11 rounded-xl px-3 py-1.5 text-left ${i === hi ? "bg-surface2" : ""}`}>
                <span className="flex items-center gap-2"><span className="truncate text-sm font-medium text-ink">/{t.name}</span>{t.category && <span className="shrink-0 rounded-lg bg-surface3 px-1.5 py-0.5 text-[11px] text-ink2">{t.category}</span>}</span>
                <span className="block truncate text-xs text-muted">{t.body.replace(/\s+/g, " ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mb-2">
        <Segmented label="Reply or note" value={mode} onChange={setMode} options={[{ value: "reply", label: "Reply" }, { value: "note", label: "Internal note", icon: <NotebookPen className="h-3.5 w-3.5" aria-hidden /> }]} />
      </div>
      {disabled && !noting && (
        <Callout tone="warn" compact className="mb-2">
          {reason}{" "}
          <Link to="/crm/connection" className="font-medium underline">
            Open WhatsApp status
          </Link>
        </Callout>
      )}
      {err && (
        <Callout tone="crit" compact className="mb-2">
          {noting ? "Not saved" : "Not sent"}: {err}
        </Callout>
      )}
      {file && !noting && (
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
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-surface2"
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
          disabled={blocked || busy || noting}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
          title="Attach a file (max 64 MB)"
          className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-ink2 shadow-[var(--shadow-soft)] hover:text-ink hover:shadow-[var(--shadow-panel)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setHi(0); setClosed(false); }}
          onKeyDown={(e) => {
            if (menu && options.length > 0) {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % options.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + options.length) % options.length); return; }
              if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); pick(options[Math.min(hi, options.length - 1)]); return; }
            }
            if (menu && e.key === "Escape") { e.preventDefault(); setClosed(true); return; }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          disabled={blocked}
          aria-label={noting ? "Internal note" : "Message"}
          placeholder={noting ? "Write a note for the team (the customer never sees it)" : disabled ? "Sending is off" : replies.length ? "Write a message, or type / for templates" : "Write a message"}
          className="max-h-32 min-h-11 resize-none rounded-2xl py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={noting ? "Save note" : "Send"}
          className="press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--accent)_60%,transparent)] hover:brightness-105 disabled:opacity-50"
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
  onDetails,
}: {
  phone: string;
  listName?: string;
  tags: string[];
  wa: WaState | undefined;
  waProblem: unknown;
  onBack: () => void;
  onSent: () => void;
  onDetails?: () => void;
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

  const account = useAccountId();
  const tplQ = useCrm<unknown>("/templates");
  const replies = useMemo<QuickReply[]>(() => {
    const raw: any = tplQ.data;
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.templates) ? raw.templates : [];
    return arr.map((t: any): QuickReply => ({ id: t.id, name: String(t.name ?? ""), body: String(t.body ?? t.template ?? t.text ?? ""), category: String(t.category ?? ""), use_count: Number(t.use_count ?? 0) })).filter((t: QuickReply) => t.body).sort((a: QuickReply, b: QuickReply) => b.use_count - a.use_count || a.name.localeCompare(b.name));
  }, [tplQ.data]);
  const board = usePipeline();
  const fieldValues = useFieldValues(board.account);
  const fill = (body: string) => {
    const vars = variablesFor(board.data?.fields ?? []);
    const lead = board.data?.leads.find((l) => l.phone === phone);
    const values = valuesForPerson(vars, { phone }, {
      stageName: () => board.data?.stages.find((s) => s.id === lead?.stage_id)?.name ?? "",
      ownerName: () => board.data?.owners.find((o) => o.id === lead?.owner_user_id)?.name ?? "",
      fieldValue: (_p, id) => fieldValues.data?.values[phone]?.[id] ?? "",
    });
    return renderMessage(body, { name: data?.name || listName, phone, vars: values });
  };
  const timeline = useApi<{ items: TimelineItem[] }>(account ? `/crm-tasks/timeline/${phone}?account=${account}` : null, { key: String(account) });
  const notes = useMemo<Note[]>(() => (timeline.data?.items ?? []).filter((i) => i.kind === "note" && i.id != null).map((i) => ({ id: i.id!, ts: sqlUtcToUnix(i.at), text: i.text, user_name: i.user_name ?? null })), [timeline.data]);
  const messages = useMemo(() => [...(data?.messages ?? []), ...pending], [data, pending]);
  const entries = useMemo<Entry[]>(
    () => [...messages.map((m): Entry => ({ key: m.wa_id, ts: m.ts, msg: m })), ...notes.map((n): Entry => ({ key: `note-${n.id}`, ts: n.ts, note: n }))].sort((a, b) => a.ts - b.ts),
    [messages, notes]
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const prev = seen.current;
    const added = prev.phone === phone ? entries.length - prev.len : 0;
    seen.current = { phone, len: entries.length };
    if (stick.current) {
      el.scrollTop = el.scrollHeight;
    } else if (added > 0 && entries[entries.length - 1]?.msg && !entries[entries.length - 1].msg!.from_me) {
      setUnseen((n) => n + added);
    }
  }, [entries, phone]);

  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stick.current = true;
    setUnseen(0);
  }, []);

  async function saveNote(text: string) {
    await api("/crm-tasks/notes?account=" + account, { method: "POST", body: { phone, body: text } });
    stick.current = true;
    timeline.reload();
  }

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
      <div className="flex items-center gap-2 px-2 py-2 shadow-[0_8px_24px_-18px_rgba(20,24,36,0.2)] md:px-4">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink2 hover:bg-surface2 md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar phone={data?.phone ?? phone} name={data?.name || listName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
            {(data?.name || listName) && <span>{fmtPhone(data?.phone ?? phone)}</span>}
            {tags.map((t) => (
              <span key={t} className="rounded-lg bg-surface3 px-2 py-0.5 text-ink2">
                {t}
              </span>
            ))}
          </p>
        </div>
        {onDetails && (
          <button type="button" onClick={onDetails} aria-label="Contact details" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink2 hover:bg-surface2 xl:hidden">
            <UserRound className="h-5 w-5" />
          </button>
        )}
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
          ) : entries.length === 0 && !data?.ad ? (
            <p className="py-10 text-center text-xs text-muted">No messages recorded for this number yet. Messages you send below start the conversation.</p>
          ) : (
            <>
              {data?.ad && <AdCard ad={data.ad} account={account} />}
              {entries.map((e, i) => (
                <Fragment key={e.key}>
                  {(i === 0 || dayKey(entries[i - 1].ts) !== dayKey(e.ts)) && (
                    <p className="py-2 text-center">
                      <span className="rounded-full bg-surface3 px-3 py-1 text-xs text-ink2">{fmtDayLabel(e.ts)}</span>
                    </p>
                  )}
                  {e.msg ? <Bubble m={e.msg} /> : <NoteBubble note={e.note!} />}
                </Fragment>
              ))}
            </>
          )}
        </div>
        {data && error != null && (
          <p className="absolute inset-x-3 top-2 rounded-2xl bg-warn/12 px-3 py-2 text-xs text-warn shadow-sm backdrop-blur" role="status">
            Connection to the gateway lost. Showing the last messages loaded; retrying.
          </p>
        )}
        {unseen > 0 && (
          <button type="button" onClick={toBottom} className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-[var(--accent)] text-[var(--on-accent)] shadow-[0_6px_16px_-6px_color-mix(in_srgb,var(--accent)_60%,transparent)] hover:brightness-105 px-4 text-xs font-semibold">
            <ArrowDown className="h-3.5 w-3.5" />
            {unseen} new message{unseen === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <Composer key={phone} disabled={!canSend} reason={reason} onSend={send} onNote={saveNote} replies={replies} fill={fill} />
    </div>
  );
}
