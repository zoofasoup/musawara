// Shown by pages that work on exactly one client when the sidebar is set to "All clients".
import { useClientScope } from "../context/ClientScope";
import { Btn, Empty } from "./kit";

export function NeedsClient({ what }: { what: string }) {
  const { clients, setClientId } = useClientScope();
  return (
    <Empty
      icon="building"
      title="Pick a client"
      hint={`${what} works on one client at a time. Choose one here or in the sidebar.`}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {clients.map((c) => <Btn key={c.id} tone="secondary" onClick={() => setClientId(c.id)}>{c.name}</Btn>)}
        </div>
      }
    />
  );
}
