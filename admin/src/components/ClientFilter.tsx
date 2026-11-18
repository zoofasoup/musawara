// "All clients / one client" filter for the team pages that span clients (Spend, Planning, Board, Approvals).
import { NativeSelect } from "@/components/ui/native-select";
import { useClientScope } from "../context/ClientScope";

export function ClientFilter({ className = "" }: { className?: string }) {
  const { clients, clientId, setClientId } = useClientScope();
  return (
    <NativeSelect aria-label="Client" value={clientId ?? ""} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)} className={`min-w-[10rem] ${className}`}>
      <option value="">All clients</option>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </NativeSelect>
  );
}
