// Settings of a CRM copy: only the team. Numbers live on the CRM's own Numbers tab.
import { PageHeader } from "../components/PageHeader";
import { useApi } from "../lib/api";
import { useNotify } from "../components/kit";
import { TeamSection } from "./settings/TeamSection";

export function CrmSettings() {
  const clients = useApi<{ clients: any[] }>("/admin/clients");
  const team = useApi<{ users: any[]; invites: any[] }>("/admin/users");
  const { notify, node } = useNotify();
  return (
    <div className="max-w-4xl pb-24">
      <PageHeader title="Settings" subtitle="Invite your team." />
      <TeamSection state={team} clients={clients.data?.clients ?? []} notify={notify} />
      {node}
    </div>
  );
}
