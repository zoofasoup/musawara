import { NativeSelect } from "@/components/ui/native-select";
import { Segmented } from "../../../components/Controls";
import { Input } from "@/components/ui/input";
import { useMemo } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Empty } from "../../../components/kit";
import { Skeleton } from "../../../components/ui";
import { convTitle, fmtListTime, fmtPhone, mediaLabel, tagList, type Conv, type SyncState } from "./util";

export type Filters = { q: string; tag: string; status: "all" | "unread" | "waiting" };
export const NO_TAG = "__none__";
export const NOT_CONTACT = "__not_contact__";
const TAG_MAX = 2;

function matches(c: Conv, f: Filters) {
  if (f.status === "unread" && !c.unread) return false;
  if (f.status === "waiting" && c.from_me) return false; // their message is the latest and we have not answered
  const tags = tagList(c);
  if (f.tag === NO_TAG && !(c.is_contact && !tags.length)) return false;
  if (f.tag === NOT_CONTACT && c.is_contact) return false;
  if (f.tag && f.tag !== NO_TAG && f.tag !== NOT_CONTACT && !tags.includes(f.tag)) return false;
  const q = f.q.trim().toLowerCase();
  return !q || `${c.name} ${c.phone} ${c.body}`.toLowerCase().includes(q);
}

function Chips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  const sorted = [...tags].sort((a, b) => a.localeCompare(b));
  const rest = sorted.slice(TAG_MAX);
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {sorted.slice(0, TAG_MAX).map((t) => (
        <span key={t} className="max-w-[10rem] truncate rounded-md bg-surface3 px-1.5 py-0.5 text-xs text-ink2">
          {t}
        </span>
      ))}
      {rest.length > 0 && (
        <span title={rest.join(", ")} className="rounded-md bg-surface3 px-1.5 py-0.5 text-xs text-ink2">
          +{rest.length}
        </span>
      )}
    </span>
  );
}

const STATUS: { v: Filters["status"]; label: string }[] = [
  { v: "all", label: "All" },
  { v: "unread", label: "Unread" },
  { v: "waiting", label: "Needs reply" },
];

export function ConversationList({
  convs,
  loading,
  activePhone,
  filters,
  setFilters,
  onOpen,
  sync,
  syncing,
  onSync,
  canSync,
  newChatOpen,
  toggleNewChat,
  newChat,
  setNewChat,
  onNewChat,
}: {
  convs: Conv[] | undefined;
  loading: boolean;
  activePhone: string | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  onOpen: (phone: string) => void;
  sync: SyncState | undefined;
  syncing: boolean;
  onSync: () => void;
  canSync: boolean;
  newChatOpen: boolean;
  toggleNewChat: () => void;
  newChat: string;
  setNewChat: (v: string) => void;
  onNewChat: () => void;
}) {
  const all = convs ?? [];
  const list = useMemo(() => all.filter((c) => matches(c, filters)), [all, filters]);
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of all) for (const t of tagList(c)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [all]);
  const noTag = all.filter((c) => c.is_contact && !tagList(c).length).length;
  const notContact = all.filter((c) => !c.is_contact).length;
  const filtering = Boolean(filters.q || filters.tag || filters.status !== "all");
  const syncText = sync?.running
    ? `Syncing ${sync.done} of ${sync.chats} chats...`
    : sync?.finishedAt
      ? `Last sync added ${sync.added} message${sync.added === 1 ? "" : "s"}`
      : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Search name, number or message"
              autoComplete="off"
              className="pl-9"
            />
          </label>
          <button
            type="button"
            onClick={toggleNewChat}
            aria-label="New chat by number"
            aria-expanded={newChatOpen}
            title="New chat by number"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSync}
            disabled={!canSync || syncing || sync?.running}
            aria-label="Sync history from WhatsApp"
            title={canSync ? "Pull earlier messages from WhatsApp" : "Connect WhatsApp to sync history"}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink2 hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${sync?.running || syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
        {newChatOpen && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onNewChat();
            }}
          >
            <Input
              inputMode="tel"
              value={newChat}
              onChange={(e) => setNewChat(e.target.value)}
              placeholder="Phone number, e.g. 0812... or 62812..."
              aria-label="Phone number"
             
            />
            <button type="submit" disabled={!newChat.trim()} className="min-h-11 shrink-0 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50">
              Open
            </button>
          </form>
        )}
        <NativeSelect
          value={filters.tag}
          onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
          aria-label="Filter by tag"
          className="w-full"
        >
          <option value="">All tags ({all.length})</option>
          {tagOptions.map(([t, n]) => (
            <option key={t} value={t}>
              {t} ({n})
            </option>
          ))}
          {noTag > 0 && <option value={NO_TAG}>Contacts without a tag ({noTag})</option>}
          {notContact > 0 && <option value={NOT_CONTACT}>Not in contacts ({notContact})</option>}
        </NativeSelect>
        <Segmented fill label="Status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={STATUS.map((s) => ({ value: s.v, label: s.label }))} />
        {(syncText || filtering) && (
          <p className="text-xs text-muted" aria-live="polite">
            {filtering && `${list.length} of ${all.length} conversations`}
            {filtering && syncText && " · "}
            {syncText}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !all.length ? (
          <div className="p-3">
            <Empty icon="mail" title="No conversations yet" hint="Messages are recorded from the moment the gateway connected. Use the sync button to pull earlier chats from WhatsApp." />
          </div>
        ) : !list.length ? (
          <div className="p-6 text-center text-xs text-muted">
            No conversation matches.{" "}
            <button type="button" className="min-h-11 font-medium text-musawara-ink underline" onClick={() => setFilters({ q: "", tag: "", status: "all" })}>
              Clear filters
            </button>
          </div>
        ) : (
          <ul>
            {list.map((c) => (
              <li key={c.phone}>
                <button
                  type="button"
                  onClick={() => onOpen(c.phone)}
                  aria-current={c.phone === activePhone ? "true" : undefined}
                  className={`block min-h-14 w-full border-b border-border px-3 py-2.5 text-left hover:bg-surface2 ${c.phone === activePhone ? "bg-surface2" : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`min-w-0 truncate text-sm ${c.unread ? "font-bold text-ink" : "font-medium text-ink"}`}>{convTitle(c)}</span>
                    <span className="shrink-0 text-xs text-muted">{fmtListTime(c.ts)}</span>
                  </span>
                  {c.name && <span className="block truncate text-xs text-muted">{fmtPhone(c.phone)}</span>}
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-ink2">
                      {c.from_me ? "You: " : ""}
                      {c.body || mediaLabel(c.media_type)}
                    </span>
                    {c.unread > 0 && (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground" aria-label={`${c.unread} unread`}>
                        {c.unread}
                      </span>
                    )}
                  </span>
                  <Chips tags={tagList(c)} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
