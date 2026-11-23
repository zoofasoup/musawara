import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { BASE } from "./lib/api";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { ClientFrame } from "./components/ClientFrame";
import { ClientScopeProvider, useClientScope } from "./context/ClientScope";
import { CardSkeleton } from "./components/ui";
import { SecurityCard } from "./components/SecurityCard";
import { Btn } from "./components/kit";
import { homePathFor, type Feature } from "../shared/permissions";
import { userCan } from "./lib/can";

// Pages
const AdminHome = lazy(() => import("./pages/AdminHome").then((m) => ({ default: m.AdminHome })));
const ClientDashboard = lazy(() => import("./pages/ClientDashboard").then((m) => ({ default: m.ClientDashboard })));
const CreativeView = lazy(() => import("./pages/CreativeView").then((m) => ({ default: m.CreativeView })));
const Reset = lazy(() => import("./pages/Reset").then((m) => ({ default: m.Reset })));
const Invite = lazy(() => import("./pages/Invite").then((m) => ({ default: m.Invite })));
import { Login } from "./pages/Login";
const ShareView = lazy(() => import("./pages/ShareView").then((m) => ({ default: m.ShareView })));
const AdminSettings = lazy(() => import("./pages/AdminSettings").then((m) => ({ default: m.AdminSettings })));
const BrandKnowledge = lazy(() => import("./pages/BrandKnowledge").then((m) => ({ default: m.BrandKnowledge })));
const Onboarding = lazy(() => import("./pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const Clients = lazy(() => import("./pages/Clients").then((m) => ({ default: m.Clients })));
const Spend = lazy(() => import("./pages/Spend").then((m) => ({ default: m.Spend })));
const Board = lazy(() => import("./pages/Board").then((m) => ({ default: m.Board })));
const Conversions = lazy(() => import("./pages/Conversions").then((m) => ({ default: m.Conversions })));
const Planning = lazy(() => import("./pages/Planning").then((m) => ({ default: m.Planning })));
const Styleguide = lazy(() => import("./pages/Styleguide").then((m) => ({ default: m.Styleguide })));
const Profile = lazy(() => import("./pages/Profile").then((m) => ({ default: m.Profile })));
const Shopee = lazy(() => import("./pages/Shopee").then((m) => ({ default: m.Shopee })));
const Organic = lazy(() => import("./pages/Organic").then((m) => ({ default: m.Organic })));
const ClientReport = lazy(() => import("./pages/ClientReport").then((m) => ({ default: m.ClientReport })));
const ShareReport = lazy(() => import("./pages/ClientReport").then((m) => ({ default: m.ShareReport })));
const Assets = lazy(() => import("./pages/Assets").then((m) => ({ default: m.Assets })));
const ClientAlerts = lazy(() => import("./pages/ClientAlerts").then((m) => ({ default: m.ClientAlerts })));
const Approvals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.Approvals })));
const TeamApprovals = lazy(() => import("./pages/Approvals").then((m) => ({ default: m.TeamApprovals })));
const CrmInbox = lazy(() => import("./pages/crm/CrmInbox").then((m) => ({ default: m.CrmInbox })));
const CrmContacts = lazy(() => import("./pages/crm/CrmContacts").then((m) => ({ default: m.CrmContacts })));
const CrmTemplates = lazy(() => import("./pages/crm/CrmTemplates").then((m) => ({ default: m.CrmTemplates })));
const CrmCampaigns = lazy(() => import("./pages/crm/CrmCampaigns").then((m) => ({ default: m.CrmCampaigns })));
const CrmConnection = lazy(() => import("./pages/crm/CrmConnection").then((m) => ({ default: m.CrmConnection })));
import { CrmLayout } from "./pages/crm/CrmLayout";

function MfaRequired() {
  const { logout } = useAuth();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <SecurityCard required />
      <Btn tone="ghost" onClick={() => void logout().then(() => (window.location.href = BASE + "/login"))}>Sign out</Btn>
    </main>
  );
}

/** Signed-in frame. It stays mounted while the page inside it changes, so moving between menus never redraws the sidebar. */
function ProtectedLayout() {
  const { user, ready } = useAuth();
  usePrefetchPages(user?.role === "admin");
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
function Needs({ feature, clients = false }: { feature: Feature; clients?: boolean }) {
  const { user } = useAuth();
  if (user?.role === "client") return clients ? <Outlet /> : <Navigate to={`/c/${user.client_id}`} replace />;
  if (userCan(user, feature)) return <Outlet />;
  return <Navigate to={user?.role === "admin" ? homePathFor(user.staff_role) : "/login"} replace />;
}

/** Any team member with a role (Clients list, scoped to their clients). */
function StaffOnly() {
  const { user } = useAuth();
  return user?.role === "admin" && user.staff_role ? <Outlet /> : <Navigate to={user?.role === "admin" ? "/profile" : "/"} replace />;
}

/** The CRM tab bar and number switcher stay put while the section underneath changes. */
function CrmFrame() {
  return (
    <CrmLayout>
      <Outlet />
    </CrmLayout>
  );
}

/** Old address of a page that now lives under a client (/shopee, /organic ...): go to the chosen client's page, or pick a client. */
function ScopedRedirect({ to }: { to: string }) {
  const { loading, singleId, clientId } = useClientScope();
  const { search } = useLocation();
  if (loading && clientId === null) return <CardSkeleton lines={3} />;
  const id = clientId ?? singleId;
  return <Navigate to={id ? `/c/${id}/${to}${search}` : "/clients"} replace />;
}

/** Reads :id from the path so each client page receives a numeric clientId. */
function ClientRoute({ page: Page }: { page: React.ComponentType<{ clientId: number }> }) {
  const clientId = Number(useParams().id);
  if (!Number.isInteger(clientId)) return <Navigate to="/" replace />;
  return <Page clientId={clientId} />;
}

/** A client's front page: the dashboard for logins and roles with ads data; other team roles land on the first tab they have. */
function ClientHome() {
  const { user } = useAuth();
  const id = Number(useParams().id);
  if (user?.role === "client" || userCan(user, "ads")) return <ClientRoute page={ClientDashboard} />;
  const tab = userCan(user, "approvals") ? "approvals" : userCan(user, "sales") ? "sales" : "brand";
  return <Navigate to={`/c/${id}/${tab}`} replace />;
}

function RootRedirect() {
  const { user } = useAuth();
  if (user?.role === "admin") {
    const home = homePathFor(user.staff_role);
    return home === "/" ? <AdminHome /> : <Navigate to={home} replace />;
  }
  return <Navigate to={`/c/${user?.client_id}`} replace />;
}

/** Fetch every page's code once the app is idle, so moving between menus never waits on a download. */
const PAGES = [
  () => import("./pages/AdminHome"), () => import("./pages/ClientDashboard"), () => import("./pages/CreativeView"), () => import("./pages/ClientAlerts"),
  () => import("./pages/Approvals"), () => import("./pages/Assets"), () => import("./pages/BrandKnowledge"), () => import("./pages/ClientReport"),
  () => import("./pages/Onboarding"), () => import("./pages/Spend"), () => import("./pages/SalesGrid"), () => import("./pages/Conversions"), () => import("./pages/Clients"),
  () => import("./pages/Planning"), () => import("./pages/Board"), () => import("./pages/Shopee"), () => import("./pages/Organic"),
  () => import("./pages/AdminSettings"), () => import("./pages/Profile"), () => import("./pages/crm/CrmInbox"), () => import("./pages/crm/CrmContacts"),
];
function usePrefetchPages(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const network = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (network.connection?.saveData) return;
    const pending: ReturnType<typeof setTimeout>[] = [];
    const idle = setTimeout(() => {
      PAGES.forEach((load, i) => pending.push(setTimeout(() => void load().catch(() => {}), i * 120)));
    }, 1500);
    return () => {
      clearTimeout(idle);
      pending.forEach(clearTimeout);
    };
  }, [enabled]);
}

export function App() {
  return (
    // startTransition: while a page's code or data is loading, the page you are on stays up instead of flashing a skeleton
    <BrowserRouter basename={BASE}>
      <ClientScopeProvider>
        <Suspense fallback={null}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/reset/:token" element={<Reset />} />
            <Route path="/share/:token" element={<ShareView />} />
            <Route path="/share/:token/report" element={<ShareReport />} />

            {/* Signed in: one persistent frame */}
            <Route element={<ProtectedLayout />}>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/c/:id" element={<ClientFrame />}>
                <Route index element={<ClientHome />} />
                <Route element={<Needs feature="ads" clients />}>
                  <Route path="creatives" element={<ClientRoute page={CreativeView} />} />
                  <Route path="alerts" element={<ClientRoute page={ClientAlerts} />} />
                  <Route path="report" element={<ClientRoute page={ClientReport} />} />
                </Route>
                <Route path="brand" element={<ClientRoute page={BrandKnowledge} />} />
                <Route element={<Needs feature="approvals" clients />}>
                  <Route path="approvals" element={<ClientRoute page={Approvals} />} />
                </Route>
                {/* Team only: each page needs its own feature */}
                <Route element={<Needs feature="settings" />}>
                  <Route path="onboarding" element={<ClientRoute page={Onboarding} />} />
                </Route>
                <Route element={<Needs feature="content" />}>
                  <Route path="assets" element={<ClientRoute page={Assets} />} />
                  <Route path="organic" element={<ClientRoute page={Organic} />} />
                </Route>
                <Route element={<Needs feature="sales" />}>
                  <Route path="sales" element={<ClientRoute page={Conversions} />} />
                  <Route path="shopee" element={<ClientRoute page={Shopee} />} />
                </Route>
              </Route>

              {/* Team only */}
              <Route element={<StaffOnly />}>
                <Route path="/clients" element={<Clients />} />
              </Route>
              <Route element={<Needs feature="settings" />}>
                <Route path="/settings" element={<AdminSettings />} />
                <Route path="/styleguide" element={<Styleguide />} />
              </Route>
              <Route element={<Needs feature="content" />}>
                <Route path="/assets" element={<ScopedRedirect to="assets" />} />
                <Route path="/planning" element={<Planning />} />
                <Route path="/board" element={<Board />} />
                <Route path="/organic" element={<ScopedRedirect to="organic" />} />
              </Route>
              <Route element={<Needs feature="sales" />}>
                <Route path="/shopee" element={<ScopedRedirect to="shopee" />} />
                <Route path="/conversions" element={<ScopedRedirect to="sales" />} />
              </Route>
              <Route element={<Needs feature="spend" />}>
                <Route path="/spend" element={<Spend />} />
              </Route>
              <Route element={<Needs feature="approvals" />}>
                <Route path="/approvals" element={<TeamApprovals />} />
              </Route>
              <Route element={<Needs feature="crm" />}>
                <Route path="/crm" element={<Navigate to="/crm/inbox" replace />} />
                <Route element={<CrmFrame />}>
                  <Route path="/crm/inbox" element={<CrmInbox />} />
                  <Route path="/crm/contacts" element={<CrmContacts />} />
                  <Route path="/crm/templates" element={<CrmTemplates />} />
                  <Route path="/crm/broadcasts" element={<CrmCampaigns />} />
                  <Route path="/crm/connection" element={<CrmConnection />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ClientScopeProvider>
    </BrowserRouter>
  );
}
