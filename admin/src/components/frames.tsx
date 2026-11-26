// The frames every signed-in page sits in, shared by the platform app (App.tsx) and the CRM copy (CrmApp.tsx).
import { Suspense, useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { BASE } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Layout } from "./Layout";
import { CardSkeleton } from "./ui";
import { SecurityCard } from "./SecurityCard";
import { Btn } from "./kit";
import type { Feature } from "../../shared/permissions";
import { deniedPath } from "../lib/crmRoles";
import { CRM_ONLY } from "../lib/product";
import { userCan } from "../lib/can";
import { CrmLayout } from "../pages/crm/CrmLayout";

const NONE: Array<() => Promise<unknown>> = [];

function usePrefetchPages(enabled: boolean, pages: Array<() => Promise<unknown>>) {
  useEffect(() => {
    if (!enabled) return;
    const network = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (network.connection?.saveData) return;
    const pending: ReturnType<typeof setTimeout>[] = [];
    const idle = setTimeout(() => {
      pages.forEach((load, i) => pending.push(setTimeout(() => void load().catch(() => {}), i * 120)));
    }, 1500);
    return () => {
      clearTimeout(idle);
      pending.forEach(clearTimeout);
    };
  }, [enabled, pages]);
}

export function MfaRequired() {
  const { logout } = useAuth();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <SecurityCard required />
      <Btn tone="ghost" onClick={() => void logout().then(() => (window.location.href = BASE + "/login"))}>Sign out</Btn>
    </main>
  );
}

/** Signed-in frame. It stays mounted while the page inside it changes, so moving between menus never redraws the sidebar. */
export function ProtectedLayout({ pages = NONE }: { pages?: Array<() => Promise<unknown>> }) {
  const { user, ready } = useAuth();
  usePrefetchPages(user?.role === "admin", pages);
  if (!ready) return null;
  if (!user) return <Navigate to="/login" replace />;
  // Team accounts that must have two-factor and do not yet: nothing else opens until it is set up.
  if (user.mfa_required) return <MfaRequired />;
  return (
    <Layout>
      <Suspense fallback={<div className="space-y-4"><CardSkeleton lines={2} /><CardSkeleton lines={4} /></div>}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

/** Team members whose role includes `feature`; others go to the first page their role can open. `clients` also lets client logins through (those pages decide for themselves). */
export function Needs({ feature, clients = false }: { feature: Feature; clients?: boolean }) {
  const { user } = useAuth();
  if (user?.role === "client" && clients && !CRM_ONLY) return <Outlet />;
  if (userCan(user, feature)) return <Outlet />;
  return <Navigate to={deniedPath(user, CRM_ONLY)} replace />;
}

/** The CRM tab bar and number switcher stay put while the section underneath changes. */
export function CrmFrame() {
  return (
    <CrmLayout>
      <Outlet />
    </CrmLayout>
  );
}
