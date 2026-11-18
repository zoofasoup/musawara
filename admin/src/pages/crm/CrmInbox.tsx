// WhatsApp inbox: conversation list and thread, polled through the platform proxy
// (no websocket). List every 5 s, open thread every 3 s, connection status 3 s / 15 s.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Callout } from "../../components/Callout";
import { useSearchParams } from "react-router-dom";
import { crm } from "./crmApi";
import { Btn, Empty, Panel } from "../../components/kit";
import { ConversationList, type Filters } from "./inbox/ConversationList";
import { GatewayNotice } from "./inbox/GatewayNotice";
import { ThreadView } from "./inbox/ThreadView";
import { classify, tagList, useLive, useWaStatus, type Conv, type SyncState } from "./inbox/util";
import { Skeleton } from "../../components/ui";

export function CrmInbox() {
  const [params, setParams] = useSearchParams();
  const phone = params.get("c");
  const [filters, setFilters] = useState<Filters>({ q: "", tag: "", status: "all" });
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChat, setNewChat] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string>();

  const convs = useLive<Conv[]>("/conversations", 5000);
  const wa = useWaStatus();
  const [syncFast, setSyncFast] = useState(false);
  const sync = useLive<SyncState>("/wa/sync", syncFast ? 2000 : 30000);
  const running = Boolean(sync.data?.running);
  useEffect(() => setSyncFast(running), [running]);
  // When a sync finishes, pull the new conversations straight away.
  useEffect(() => {
    if (sync.data && !sync.data.running && sync.data.finishedAt) void convs.reload();
  }, [sync.data?.finishedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback((p: string | null) => setParams(p ? { c: p } : {}), [setParams]);
  const active = useMemo(() => convs.data?.find((c) => c.phone === phone), [convs.data, phone]);

  async function startSync() {
    setSyncing(true);
    setSyncError(undefined);
    try {
      await crm("/wa/sync", { method: "POST" });
      await sync.reload();
    } catch (e) {
      setSyncError(classify(e).message);
    } finally {
      setSyncing(false);
    }
  }

  function openNew() {
    const digits = newChat.replace(/[^\d]/g, "");
    if (!digits) return;
    open(digits);
    setNewChat("");
    setNewChatOpen(false);
  }

  // Page-level failure: nothing loaded yet and the gateway cannot be used.
  if (convs.error != null && !convs.data) {
    return <GatewayNotice error={convs.error} onRetry={convs.reload} />;
  }

  const height = "h-[calc(100dvh-17rem)] min-h-[26rem] md:h-[calc(100dvh-9rem)]";
  return (
    <div className="space-y-3">
      {convs.error != null && (
        <Callout tone="warn" compact>Lost contact with the WhatsApp gateway. Showing the last data loaded; retrying every few seconds.</Callout>
      )}
      {syncError && (
        <Callout tone="crit" compact action={<Btn tone="ghost" size="sm" onClick={() => setSyncError(undefined)}>Dismiss</Btn>}>Sync failed: {syncError}</Callout>
      )}
      <Panel className={`flex overflow-hidden ${height}`}>
        <div className={`${phone ? "hidden md:flex" : "flex"} min-h-0 w-full shrink-0 flex-col border-border md:w-[340px] md:border-r lg:w-[380px]`}>
          <ConversationList
            convs={convs.data}
            loading={!convs.loaded}
            activePhone={phone}
            filters={filters}
            setFilters={setFilters}
            onOpen={open}
            sync={sync.data}
            syncing={syncing}
            onSync={startSync}
            canSync={wa.ready}
            newChatOpen={newChatOpen}
            toggleNewChat={() => setNewChatOpen((o) => !o)}
            newChat={newChat}
            setNewChat={setNewChat}
            onNewChat={openNew}
          />
        </div>
        <div className={`${phone ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
          {phone ? (
            <ThreadView
              key={phone}
              phone={phone}
              listName={active?.name}
              tags={active ? tagList(active) : []}
              wa={wa.data}
              waProblem={wa.data ? undefined : wa.error}
              onBack={() => open(null)}
              onSent={() => void convs.reload()}
            />
          ) : !convs.loaded ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <Empty icon="mail" title="Select a conversation" hint="Pick one from the list, or use the plus button to start a chat with a phone number." />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
